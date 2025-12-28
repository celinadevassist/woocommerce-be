import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';


import { ActionLogService } from 'src/services/actionLog.service';
import { ActionLogController } from 'src/controllers/actionLog.controller';
import { ActionLogMongoSchema } from 'src/schema/actionLog.schema';
import { RoleModule } from './roles.module';



@Module({
    imports: [
        forwardRef(() => RoleModule),
        PassportModule.register({ defaultStrategy: 'jwt' }),
        MongooseModule.forFeature([{ name: 'ActionLog', schema: ActionLogMongoSchema }]),
    ],
    controllers: [
        ActionLogController,
    ],
    providers: [
        ActionLogService,
    ],
    exports: [
        ActionLogService,
    ],
})
export class ActionLogModule { }