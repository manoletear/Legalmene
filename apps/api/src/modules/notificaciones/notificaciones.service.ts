import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { SES_CLIENT } from "./ses.provider";

export interface EmailMessage {
  to: string[];
  subject: string;
  bodyHtml: string;
  bodyText?: string;
}

@Injectable()
export class NotificacionesService {
  private readonly logger = new Logger(NotificacionesService.name);
  private readonly from: string;
  private readonly enabled: boolean;

  constructor(
    @Inject(SES_CLIENT) private readonly ses: SESClient,
    private readonly config: ConfigService,
  ) {
    this.from = config.get<string>("SES_FROM") ?? "no-reply@legalchile.cl";
    // En dev no enviamos emails reales: SES_ENABLED debe ser "true" explícito.
    this.enabled = config.get<string>("SES_ENABLED") === "true";
  }

  async enviarEmail(msg: EmailMessage): Promise<void> {
    if (!this.enabled) {
      this.logger.log(
        `[DEV] Email skipped: to=${msg.to.join(",")} subject="${msg.subject}" (set SES_ENABLED=true para enviar)`,
      );
      return;
    }
    try {
      await this.ses.send(
        new SendEmailCommand({
          Source: this.from,
          Destination: { ToAddresses: msg.to },
          Message: {
            Subject: { Data: msg.subject, Charset: "UTF-8" },
            Body: {
              Html: { Data: msg.bodyHtml, Charset: "UTF-8" },
              ...(msg.bodyText ? { Text: { Data: msg.bodyText, Charset: "UTF-8" } } : {}),
            },
          },
        }),
      );
      this.logger.log(`Email enviado: to=${msg.to.join(",")} subject="${msg.subject}"`);
    } catch (err) {
      this.logger.error(
        `Email falló para to=${msg.to.join(",")}: ${err instanceof Error ? err.message : err}`,
      );
    }
  }
}
