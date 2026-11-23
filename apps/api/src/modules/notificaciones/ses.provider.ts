import { Provider } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SESClient } from "@aws-sdk/client-ses";

export const SES_CLIENT = Symbol("SES_CLIENT");

export const SesProvider: Provider = {
  provide: SES_CLIENT,
  inject: [ConfigService],
  useFactory: (config: ConfigService) => {
    return new SESClient({ region: config.get<string>("SES_REGION") ?? "sa-east-1" });
  },
};
