import { Global, Module } from "@nestjs/common";
import { WebhooksService } from "./webhooks.service";
import { WebhooksController } from "./webhooks.controller";
import { WebhooksDispatcher } from "./webhooks.dispatcher";

@Global()
@Module({
  controllers: [WebhooksController],
  providers: [WebhooksService, WebhooksDispatcher],
  exports: [WebhooksService],
})
export class WebhooksModule {}
