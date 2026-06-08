import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { S3Client, GetObjectCommand, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { DocumentStorage } from "./storage.interface";
import { S3_CLIENT } from "./s3-client.provider";

@Injectable()
export class S3Storage implements DocumentStorage {
  readonly bucketName: string;

  constructor(
    @Inject(S3_CLIENT) private readonly s3: S3Client,
    config: ConfigService,
  ) {
    this.bucketName = config.get<string>("S3_DOCUMENTS_BUCKET") ?? "legalmene-dev-documents";
  }

  async generateUploadUrl(input: {
    key: string;
    contentType: string;
    contentLength: number;
    expiresInSec: number;
  }): Promise<string> {
    const cmd = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: input.key,
      ContentType: input.contentType,
      ContentLength: input.contentLength,
    });
    return getSignedUrl(this.s3, cmd, { expiresIn: input.expiresInSec });
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.s3.send(new HeadObjectCommand({ Bucket: this.bucketName, Key: key }));
      return true;
    } catch {
      return false;
    }
  }

  async generateDownloadUrl(input: {
    key: string;
    filename: string;
    expiresInSec: number;
  }): Promise<string> {
    const cmd = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: input.key,
      ResponseContentDisposition: `attachment; filename="${input.filename}"`,
    });
    return getSignedUrl(this.s3, cmd, { expiresIn: input.expiresInSec });
  }
}
