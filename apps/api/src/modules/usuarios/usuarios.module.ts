import { Global, Module } from "@nestjs/common";
import { UsuariosService } from "./usuarios.service";

@Global()
@Module({
  providers: [UsuariosService],
  exports: [UsuariosService],
})
export class UsuariosModule {}
