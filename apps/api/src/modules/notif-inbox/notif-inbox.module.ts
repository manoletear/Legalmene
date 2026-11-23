import { Global, Module } from "@nestjs/common";
import { NotifInboxService } from "./notif-inbox.service";
import { NotifInboxController } from "./notif-inbox.controller";

@Global()
@Module({
  controllers: [NotifInboxController],
  providers: [NotifInboxService],
  exports: [NotifInboxService],
})
export class NotifInboxModule {}
