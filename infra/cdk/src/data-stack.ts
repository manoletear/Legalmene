import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as rds from "aws-cdk-lib/aws-rds";
import * as kms from "aws-cdk-lib/aws-kms";
import * as iam from "aws-cdk-lib/aws-iam";
import * as opensearch from "aws-cdk-lib/aws-opensearchservice";
import { Construct } from "constructs";

interface DataStackProps extends cdk.StackProps {
  stage: string;
  tags: Record<string, string>;
  vpc: ec2.IVpc;
}

export class DataStack extends cdk.Stack {
  readonly databaseSecretArn: string;
  readonly databaseEndpoint: string;
  readonly databasePort: string;
  // Buscador de texto completo (opcional: --context opensearch=true). Sin él, la API busca en Postgres.
  readonly searchEndpoint?: string;
  readonly searchDomainArn?: string;

  constructor(scope: Construct, id: string, props: DataStackProps) {
    super(scope, id, props);
    Object.entries(props.tags).forEach(([k, v]) => cdk.Tags.of(this).add(k, v));

    const dataKey = new kms.Key(this, "DataKmsKey", {
      enableKeyRotation: true,
      removalPolicy: props.stage === "prod" ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      alias: `legalmene-${props.stage}-data`,
    });

    const dbCredentials = rds.Credentials.fromGeneratedSecret("legalmene_admin", {
      secretName: `legalmene/${props.stage}/aurora/admin`,
      encryptionKey: dataKey,
    });

    // Aurora PostgreSQL Multi-AZ. writer + reader (2 réplicas en prod, 1 en dev).
    const cluster = new rds.DatabaseCluster(this, "AuroraPostgres", {
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        version: rds.AuroraPostgresEngineVersion.VER_16_4,
      }),
      credentials: dbCredentials,
      defaultDatabaseName: "legalmene",
      vpc: props.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      writer: rds.ClusterInstance.serverlessV2("Writer", {
        autoMinorVersionUpgrade: true,
      }),
      readers:
        props.stage === "prod"
          ? [
              rds.ClusterInstance.serverlessV2("Reader1", { scaleWithWriter: true }),
              rds.ClusterInstance.serverlessV2("Reader2", { scaleWithWriter: true }),
            ]
          : [rds.ClusterInstance.serverlessV2("Reader1", { scaleWithWriter: true })],
      serverlessV2MinCapacity: props.stage === "prod" ? 1 : 0.5,
      serverlessV2MaxCapacity: props.stage === "prod" ? 16 : 4,
      storageEncrypted: true,
      storageEncryptionKey: dataKey,
      backup: {
        retention: cdk.Duration.days(props.stage === "prod" ? 35 : 7),
        preferredWindow: "06:00-07:00",
      },
      preferredMaintenanceWindow: "sun:07:00-sun:08:00",
      deletionProtection: props.stage === "prod",
      removalPolicy:
        props.stage === "prod" ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      cloudwatchLogsExports: ["postgresql"],
      iamAuthentication: true,
    });

    this.databaseSecretArn = cluster.secret!.secretArn;
    this.databaseEndpoint = cluster.clusterEndpoint.hostname;
    this.databasePort = cluster.clusterEndpoint.port.toString();

    const conBuscador = String(this.node.tryGetContext("opensearch") ?? "false") === "true";
    if (conBuscador) {
      const prod = props.stage === "prod";
      const sg = new ec2.SecurityGroup(this, "SearchSg", { vpc: props.vpc, description: "OpenSearch: HTTPS solo desde la VPC" });
      sg.addIngressRule(ec2.Peer.ipv4(props.vpc.vpcCidrBlock), ec2.Port.tcp(443));
      const subnets = props.vpc.selectSubnets({ subnetType: ec2.SubnetType.PRIVATE_ISOLATED }).subnets.slice(0, prod ? 2 : 1);
      const domain = new opensearch.Domain(this, "Search", {
        version: opensearch.EngineVersion.OPENSEARCH_2_17,
        vpc: props.vpc,
        vpcSubnets: [{ subnets }],
        securityGroups: [sg],
        capacity: {
          dataNodes: prod ? 2 : 1,
          dataNodeInstanceType: prod ? "m7g.large.search" : "t3.small.search",
          multiAzWithStandbyEnabled: false,
        },
        zoneAwareness: prod ? { enabled: true, availabilityZoneCount: 2 } : undefined,
        ebs: { volumeSize: prod ? 50 : 10, volumeType: ec2.EbsDeviceVolumeType.GP3 },
        encryptionAtRest: { enabled: true, kmsKey: dataKey },
        nodeToNodeEncryption: true,
        enforceHttps: true,
        tlsSecurityPolicy: opensearch.TLSSecurityPolicy.TLS_1_2,
        // Acceso por IAM: la política del dominio delega en la cuenta y el rol de la API recibe es:ESHttp*.
        accessPolicies: [
          new iam.PolicyStatement({
            principals: [new iam.AccountRootPrincipal()],
            actions: ["es:ESHttp*"],
            resources: [`arn:${cdk.Aws.PARTITION}:es:${this.region}:${this.account}:domain/*/*`],
          }),
        ],
        removalPolicy: prod ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      });
      this.searchEndpoint = `https://${domain.domainEndpoint}`;
      this.searchDomainArn = domain.domainArn;
      new cdk.CfnOutput(this, "SearchEndpoint", { value: this.searchEndpoint });
    }

    new cdk.CfnOutput(this, "DbEndpoint", { value: this.databaseEndpoint });
    new cdk.CfnOutput(this, "DbSecretArn", { value: this.databaseSecretArn });
  }
}
