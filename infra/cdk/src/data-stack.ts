import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as rds from "aws-cdk-lib/aws-rds";
import * as kms from "aws-cdk-lib/aws-kms";
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

    new cdk.CfnOutput(this, "DbEndpoint", { value: this.databaseEndpoint });
    new cdk.CfnOutput(this, "DbSecretArn", { value: this.databaseSecretArn });
  }
}
