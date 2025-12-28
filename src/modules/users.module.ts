import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SMSService, UserService } from '../services';
import { UserController } from '../controllers';
import { PassportModule } from '@nestjs/passport';
import { RoleModule } from './roles.module';
import { LoggerModule } from 'src/logger/logger.module';
import { AuthModule } from 'src/auth';
import { ImageModule } from './image.module';
import { ActionLogModule } from './actionLog.module';
import { HttpModule } from '@nestjs/axios/dist/http.module';
import { User, UserSchema } from 'src/schema';

@Module({
  imports: [
    forwardRef(() => AuthModule),
    forwardRef(() => RoleModule),
    forwardRef(() => LoggerModule),
    forwardRef(() => ImageModule),
    forwardRef(() => ActionLogModule),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema }, // ✅ correct model name
    ]),
    HttpModule,
  ],
  controllers: [UserController],
  providers: [UserService, SMSService],
  exports: [UserService],
})
export class UserModule {}
