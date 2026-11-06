import { Global, Module } from "@nestjs/common";
import { UsuariosService } from "./usuarios.service";
import { PerfilesService } from "./perfiles.service";
import { MeController } from "./me.controller";
import { PerfilesController, UsuariosAdminController } from "./usuarios-admin.controller";

@Global()
@Module({
  controllers: [MeController, UsuariosAdminController, PerfilesController],
  providers: [UsuariosService, PerfilesService],
  exports: [UsuariosService, PerfilesService],
})
export class UsuariosModule {}
