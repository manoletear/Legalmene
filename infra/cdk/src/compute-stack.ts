import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as ecs_patterns from "aws-cdk-lib/aws-ecs-patterns";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as iam from "aws-cdk-lib/aws-iam";
import * as logs from "aws-cdk-lib/aws-logs";
import * as wafv2 from "aws-cdk-lib/aws-wafv2";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import { Construct } from "constructs";

interface ComputeStackProps extends cdk.StackProps {
  stage: string;
  tags: Record<string, string>;
  vpc: ec2.IVpc;
  databaseSecretArn: string;
  databaseEndpoint: string;
  databasePort: string;
  documentsBucket: s3.IBucket;
  searchEndpoint?: string;
  searchDomainArn?: string;
}

const sinVacias = (env: Record<string, string>): Record<string, string> =>
  Object.fromEntries(Object.entries(env).filter(([, v]) => v !== ""));

export class ComputeStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: ComputeStackProps) {
    super(scope, id, props);
    Object.entries(props.tags).forEach(([k, v]) => cdk.Tags.of(this).add(k, v));

    // ECR repo para imágenes del API. CI/CD pushea aquí, ECS pulla.
    const repository = new ecr.Repository(this, "ApiRepository", {
      repositoryName: `legalmene-${props.stage}-api`,
      imageScanOnPush: true,
      lifecycleRules: [{ maxImageCount: 10 }],
      removalPolicy:
        props.stage === "prod" ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      emptyOnDelete: props.stage !== "prod",
    });

    const cluster = new ecs.Cluster(this, "Cluster", {
      vpc: props.vpc,
      containerInsightsV2: ecs.ContainerInsights.ENABLED,
      clusterName: `legalmene-${props.stage}`,
    });

    const logGroup = new logs.LogGroup(this, "ApiLogs", {
      logGroupName: `/aws/ecs/legalmene-${props.stage}-api`,
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy:
        props.stage === "prod" ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    // Configuración por ambiente vía contexto (cdk deploy -c webOrigin=https://… -c entraTenantId=…).
    // Lo que falte queda como advertencia de la síntesis: la API no arranca sin lo obligatorio.
    const ctx = (clave: string, porDefecto = ""): string => {
      const v = (this.node.tryGetContext(clave) as string | undefined) ?? porDefecto;
      if (!v) cdk.Annotations.of(this).addWarning(`Falta el contexto "${clave}" (ver infra/cdk/README.md)`);
      return v;
    };

    const taskRole = new iam.Role(this, "ApiTaskRole", {
      assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
    });
    props.documentsBucket.grantReadWrite(taskRole);
    if (props.searchDomainArn) {
      taskRole.addToPolicy(
        new iam.PolicyStatement({
          actions: ["es:ESHttpGet", "es:ESHttpHead", "es:ESHttpPost", "es:ESHttpPut", "es:ESHttpDelete"],
          resources: [props.searchDomainArn, `${props.searchDomainArn}/*`],
        }),
      );
    }

    // Archivo de auditoría (Ley 19.628): bucket propio con Object Lock. La API solo puede
    // escribir objetos nuevos; nadie (ni la propia cuenta en COMPLIANCE) los borra antes de 5 años.
    const prod = props.stage === "prod";
    const auditBucket = new s3.Bucket(this, "AuditArchiveBucket", {
      bucketName: `legalmene-${props.stage}-audit-archive-${this.account}`,
      versioned: true,
      objectLockEnabled: true,
      objectLockDefaultRetention: prod
        ? s3.ObjectLockRetention.compliance(cdk.Duration.days(1827))
        : s3.ObjectLockRetention.governance(cdk.Duration.days(7)),
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      lifecycleRules: [
        { id: "audit-glacier", transitions: [{ storageClass: s3.StorageClass.GLACIER, transitionAfter: cdk.Duration.days(30) }] },
      ],
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });
    auditBucket.grantPut(taskRole, "audit-archive/*");

    // Correos de los flujos (modules/correos) por Amazon SES, solo desde la identidad del remitente.
    const sesFrom = ctx("sesFrom", "no-reply@legalchile.cl");
    const sesDominio = sesFrom.split("@")[1] ?? sesFrom;
    taskRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["ses:SendEmail"],
        resources: [
          `arn:${cdk.Aws.PARTITION}:ses:${this.region}:${this.account}:identity/${sesDominio}`,
          `arn:${cdk.Aws.PARTITION}:ses:${this.region}:${this.account}:identity/${sesFrom}`,
        ],
        conditions: { StringEquals: { "ses:FromAddress": sesFrom } },
      }),
    );

    const entraTenant = ctx("entraTenantId");

    // Secreto de las sesiones propias (login con enlace): generado y guardado en Secrets Manager.
    const sessionSecret = new secretsmanager.Secret(this, "SessionJwtSecret", {
      description: "SESSION_JWT_SECRET de la API (sesiones del login con enlace)",
      generateSecretString: { passwordLength: 64, excludePunctuation: true },
      removalPolicy: props.stage === "prod" ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    // Import del secret por ARN (no por objeto) para que CDK no intente
    // agregar resource policy a un recurso que vive en el Data stack.
    // Eso rompería el grafo de stacks (cycle Compute <-> Data).
    const databaseSecret = secretsmanager.Secret.fromSecretCompleteArn(
      this,
      "ImportedDbSecret",
      props.databaseSecretArn,
    );

    // Fargate + ALB. WAF se asocia abajo.
    const service = new ecs_patterns.ApplicationLoadBalancedFargateService(this, "ApiService", {
      cluster,
      cpu: props.stage === "prod" ? 1024 : 512,
      memoryLimitMiB: props.stage === "prod" ? 2048 : 1024,
      desiredCount: props.stage === "prod" ? 2 : 1,
      assignPublicIp: false,
      taskSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      taskImageOptions: {
        image: ecs.ContainerImage.fromEcrRepository(repository, "latest"),
        containerPort: 3001,
        taskRole,
        logDriver: ecs.LogDrivers.awsLogs({ streamPrefix: "api", logGroup }),
        // Las vacías no se pasan: la API trata "" distinto de "no definida".
        environment: sinVacias({
          NODE_ENV: props.stage === "prod" ? "production" : props.stage,
          PORT: "3001",
          DB_HOST: props.databaseEndpoint,
          DB_PORT: props.databasePort,
          // TLS hacia Aurora verificando el certificado (bundle incluido en la imagen).
          DB_SSL_CA: "/app/certs/rds-global-bundle.pem",
          AUDIT_ARCHIVE_BUCKET: auditBucket.bucketName,
          S3_DOCUMENTS_BUCKET: props.documentsBucket.bucketName,
          STORAGE_BACKEND: "s3",
          // Detrás del ALB hay un salto de proxy: la IP real sale de X-Forwarded-For.
          TRUSTED_PROXY_HOPS: "1",
          WEB_ORIGIN: ctx("webOrigin"),
          ALLOWED_EMAIL_DOMAIN: ctx("allowedEmailDomain", "legalchile.cl"),
          BOOTSTRAP_ADMIN_EMAILS: ctx("bootstrapAdminEmails"),
          ENTRA_TENANT_ID: entraTenant,
          ENTRA_AUDIENCE: ctx("entraAudience"),
          ENTRA_ISSUER: entraTenant ? `https://login.microsoftonline.com/${entraTenant}/v2.0` : "",
          ENTRA_JWKS_URI: entraTenant ? `https://login.microsoftonline.com/${entraTenant}/discovery/v2.0/keys` : "",
          SES_ENABLED: ctx("sesEnabled", "false"),
          SES_FROM: sesFrom,
          CORREO_APRUEBA_ARANCEL: ctx("correoApruebaArancel"),
          CORREO_SOLICITUD_FONDOS: ctx("correoSolicitudFondos"),
          CORREO_AUTORIZA_PROVISION: ctx("correoAutorizaProvision"),
          CORREO_OPERACIONES: ctx("correoOperaciones"),
          // Buscador de texto completo (firmado con el rol de la tarea); sin él, búsqueda en Postgres.
          OPENSEARCH_URL: props.searchEndpoint ?? "",
          OPENSEARCH_AWS_REGION: props.searchEndpoint ? this.region : "",
        }),
        secrets: {
          DB_USERNAME: ecs.Secret.fromSecretsManager(databaseSecret, "username"),
          DB_PASSWORD: ecs.Secret.fromSecretsManager(databaseSecret, "password"),
          DB_NAME: ecs.Secret.fromSecretsManager(databaseSecret, "dbname"),
          SESSION_JWT_SECRET: ecs.Secret.fromSecretsManager(sessionSecret),
        },
      },
      publicLoadBalancer: true,
      circuitBreaker: { rollback: true },
      healthCheckGracePeriod: cdk.Duration.seconds(60),
      minHealthyPercent: 100,
      maxHealthyPercent: 200,
    });

    service.targetGroup.configureHealthCheck({
      path: "/api/v1/health",
      healthyHttpCodes: "200",
      interval: cdk.Duration.seconds(30),
      timeout: cdk.Duration.seconds(5),
    });

    // Auto-scaling por CPU.
    const scaling = service.service.autoScaleTaskCount({
      minCapacity: props.stage === "prod" ? 2 : 1,
      maxCapacity: props.stage === "prod" ? 10 : 3,
    });
    scaling.scaleOnCpuUtilization("CpuScaling", {
      targetUtilizationPercent: 65,
      scaleInCooldown: cdk.Duration.seconds(120),
      scaleOutCooldown: cdk.Duration.seconds(60),
    });

    // WAF regional asociado al ALB.
    const webAcl = new wafv2.CfnWebACL(this, "ApiWebAcl", {
      scope: "REGIONAL",
      defaultAction: { allow: {} },
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName: `legalmene-${props.stage}-api-waf`,
        sampledRequestsEnabled: true,
      },
      rules: [
        {
          name: "AWSManagedRulesCommonRuleSet",
          priority: 1,
          overrideAction: { none: {} },
          statement: {
            managedRuleGroupStatement: {
              vendorName: "AWS",
              name: "AWSManagedRulesCommonRuleSet",
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: "common-rules",
            sampledRequestsEnabled: true,
          },
        },
        {
          name: "RateLimit",
          priority: 2,
          action: { block: {} },
          statement: {
            rateBasedStatement: { limit: 2000, aggregateKeyType: "IP" },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: "rate-limit",
            sampledRequestsEnabled: true,
          },
        },
      ],
    });

    new wafv2.CfnWebACLAssociation(this, "ApiWafAssociation", {
      resourceArn: service.loadBalancer.loadBalancerArn,
      webAclArn: webAcl.attrArn,
    });

    // Aurora SG necesita permitir el SG del Fargate. La conexión se establece
    // referenciando el cluster por endpoint+secret, pero para SG: el cluster
    // de RDS exporta su SG. Aquí asumimos que CDK auto-resuelve por allowFrom.
    // (Si se requiere fino: pasar el cluster a este stack en vez del endpoint.)

    new cdk.CfnOutput(this, "ApiUrl", {
      value: `http://${service.loadBalancer.loadBalancerDnsName}/api/v1`,
    });
    new cdk.CfnOutput(this, "EcrRepositoryUri", { value: repository.repositoryUri });
  }
}
