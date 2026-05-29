import { Global, Module } from "@nestjs/common";
import { UsuariosService } from "./usuarios.service";
import { MeController } from "./me.controller";

@Global()
@Module({
  controllers: [MeController],
  providers: [UsuariosService],
  exports: [UsuariosService],
})
export class UsuariosModule {}
