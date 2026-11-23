import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as cf_origins from "aws-cdk-lib/aws-cloudfront-origins";
import { Construct } from "constructs";

interface EdgeStackProps extends cdk.StackProps {
  stage: string;
  tags: Record<string, string>;
}

export class EdgeStack extends cdk.Stack {
  readonly documentsBucket: s3.IBucket;
  readonly frontendBucket: s3.IBucket;
  readonly frontendDistribution: cloudfront.IDistribution;

  constructor(scope: Construct, id: string, props: EdgeStackProps) {
    super(scope, id, props);
    Object.entries(props.tags).forEach(([k, v]) => cdk.Tags.of(this).add(k, v));

    // S3 bucket privado para documentos legales (escritos, resoluciones, contratos).
    // Versionado + lifecycle a IA después de 90 días, Glacier después de 1 año.
    this.documentsBucket = new s3.Bucket(this, "DocumentsBucket", {
      bucketName: `legalmene-${props.stage}-documents-${this.account}`,
      versioned: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      lifecycleRules: [
        {
          id: "documents-tiering",
          transitions: [
            {
              storageClass: s3.StorageClass.INFREQUENT_ACCESS,
              transitionAfter: cdk.Duration.days(90),
            },
            {
              storageClass: s3.StorageClass.GLACIER_INSTANT_RETRIEVAL,
              transitionAfter: cdk.Duration.days(365),
            },
          ],
          noncurrentVersionExpiration: cdk.Duration.days(180),
        },
      ],
      removalPolicy:
        props.stage === "prod" ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: props.stage !== "prod",
      cors: [
        {
          allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.PUT, s3.HttpMethods.POST],
          allowedOrigins: ["*"],
          allowedHeaders: ["*"],
          maxAge: 3600,
        },
      ],
    });

    // S3 + CloudFront para hostear el bundle Angular.
    this.frontendBucket = new s3.Bucket(this, "FrontendBucket", {
      bucketName: `legalmene-${props.stage}-frontend-${this.account}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy:
        props.stage === "prod" ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: props.stage !== "prod",
    });

    const oac = new cloudfront.S3OriginAccessControl(this, "FrontendOac");
    const frontendOrigin = cf_origins.S3BucketOrigin.withOriginAccessControl(this.frontendBucket, {
      originAccessControl: oac,
    });

    this.frontendDistribution = new cloudfront.Distribution(this, "FrontendDistribution", {
      defaultRootObject: "index.html",
      defaultBehavior: {
        origin: frontendOrigin,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        responseHeadersPolicy: cloudfront.ResponseHeadersPolicy.SECURITY_HEADERS,
      },
      errorResponses: [
        // SPA: cualquier 404 sirve index.html para que el router de Angular maneje la ruta.
        { httpStatus: 404, responseHttpStatus: 200, responsePagePath: "/index.html" },
        { httpStatus: 403, responseHttpStatus: 200, responsePagePath: "/index.html" },
      ],
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
    });

    new cdk.CfnOutput(this, "FrontendUrl", {
      value: `https://${this.frontendDistribution.distributionDomainName}`,
    });
    new cdk.CfnOutput(this, "DocumentsBucketName", { value: this.documentsBucket.bucketName });
  }
}
