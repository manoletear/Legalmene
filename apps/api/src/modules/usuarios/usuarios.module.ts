import { Global, Module } from "@nestjs/common";
import { UsuariosService } from "./usuarios.service";
import { MeController } from "./me.controller";
import { UsuariosAdminController } from "./usuarios-admin.controller";

@Global()
@Module({
  controllers: [MeController, UsuariosAdminController],
  providers: [UsuariosService],
  exports: [UsuariosService],
})
export class UsuariosModule {}
