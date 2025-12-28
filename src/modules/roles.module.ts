import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import { RolesMongoSchema } from 'src/schema/role.schema';

import { RoleController } from '../controllers';
import { RoleService } from '../services';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    MongooseModule.forFeature([{ name: 'Role', schema: RolesMongoSchema }]),
  ],
  controllers: [RoleController],
  providers: [
    RoleService,
  ],
  exports: [
    RoleService,
  ],
})
export class RoleModule { }
