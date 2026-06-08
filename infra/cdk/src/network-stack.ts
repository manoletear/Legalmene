import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import { Construct } from "constructs";

interface NetworkStackProps extends cdk.StackProps {
  stage: string;
  tags: Record<string, string>;
}

export class NetworkStack extends cdk.Stack {
  readonly vpc: ec2.IVpc;

  constructor(scope: Construct, id: string, props: NetworkStackProps) {
    super(scope, id, props);
    Object.entries(props.tags).forEach(([k, v]) => cdk.Tags.of(this).add(k, v));

    // VPC con 3 AZs: subnets públicas para ALB, privadas con NAT para ECS/Aurora.
    this.vpc = new ec2.Vpc(this, "Vpc", {
      maxAzs: 3,
      natGateways: props.stage === "prod" ? 3 : 1,
      ipAddresses: ec2.IpAddresses.cidr("10.20.0.0/16"),
      subnetConfiguration: [
        {
          name: "public",
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
        },
        {
          name: "private-app",
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
          cidrMask: 22,
        },
        {
          name: "private-data",
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
          cidrMask: 24,
        },
      ],
      enableDnsHostnames: true,
      enableDnsSupport: true,
    });

    // Endpoints VPC para reducir tráfico NAT y mejorar latencia/costo.
    this.vpc.addGatewayEndpoint("S3Endpoint", { service: ec2.GatewayVpcEndpointAwsService.S3 });
    this.vpc.addInterfaceEndpoint("SecretsManagerEndpoint", {
      service: ec2.InterfaceVpcEndpointAwsService.SECRETS_MANAGER,
    });
    this.vpc.addInterfaceEndpoint("EcrEndpoint", {
      service: ec2.InterfaceVpcEndpointAwsService.ECR,
    });
    this.vpc.addInterfaceEndpoint("EcrDockerEndpoint", {
      service: ec2.InterfaceVpcEndpointAwsService.ECR_DOCKER,
    });
    this.vpc.addInterfaceEndpoint("CloudWatchLogsEndpoint", {
      service: ec2.InterfaceVpcEndpointAwsService.CLOUDWATCH_LOGS,
    });

    new cdk.CfnOutput(this, "VpcId", { value: this.vpc.vpcId });
  }
}
