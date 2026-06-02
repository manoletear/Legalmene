import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser, AuthenticatedUser } from "../../common/decorators/current-user.decorator";
import { NotifInboxService } from "./notif-inbox.service";

// Inbox del usuario actual. No requiere X-Cod-Plan: las notif son personales.
@ApiTags("notificaciones")
@ApiBearerAuth("EntraID")
@UseGuards(JwtAuthGuard)
@Controller("notif-inbox")
export class NotifInboxController {
  constructor(private readonly service: NotifInboxService) {}

  @Get()
  inbox(
    @CurrentUser() user: AuthenticatedUser,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Query("soloUnseen") soloUnseen?: string,
  ) {
    const usuarioId = user.id ?? user.entraOid;
    return this.service.inbox(usuarioId, {
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
      soloUnseen: soloUnseen === "true",
    });
  }

  @Patch(":id/seen")
  marcarLeida(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.service.marcarLeida(user.id ?? user.entraOid, id);
  }

  @Post("seen-all")
  marcarTodasLeidas(@CurrentUser() user: AuthenticatedUser) {
    return this.service.marcarTodasLeidas(user.id ?? user.entraOid);
  }

  @Delete()
  eliminar(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { ids: string[] },
  ) {
    return this.service.eliminar(user.id ?? user.entraOid, body.ids ?? []);
  }
}
