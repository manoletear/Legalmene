import { Provider } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { S3Client } from "@aws-sdk/client-s3";

export const S3_CLIENT = Symbol("S3_CLIENT");

export const S3ClientProvider: Provider = {
  provide: S3_CLIENT,
  inject: [ConfigService],
  useFactory: (config: ConfigService) => {
    const region = config.get<string>("AWS_REGION") ?? "sa-east-1";
    const endpoint = config.get<string>("S3_ENDPOINT"); // ej. http://localhost:4566 para LocalStack
    return new S3Client({
      region,
      endpoint,
      forcePathStyle: !!endpoint, // LocalStack requiere path-style
    });
  },
};
