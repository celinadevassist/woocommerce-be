import { forwardRef, Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { PassportModule } from '@nestjs/passport';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from '../schema';
import { RoleModule } from '../modules';
import { AuthController } from './auth.controller';
import { SMSService } from '../services';
import { LoggerModule } from 'src/logger/logger.module';
import { ImageModule } from 'src/modules/image.module';
import { HttpModule } from '@nestjs/axios';
import { EmailService } from 'src/services/email.service';
import { MailrelayService } from 'src/services/mailrelay.service';
import { MailerService } from 'src/services/mailer.service';
import { LoggerService } from 'src/logger/logger.service';
import { MetadataModule } from 'src/common_metadata_module/module';
import { ConfigModule } from '@nestjs/config';

@Module({
    imports: [
        ConfigModule,
        RoleModule,
        MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
        PassportModule.register({ defaultStrategy: 'jwt' }),
        HttpModule,
        forwardRef(() => LoggerModule),
        forwardRef(() => ImageModule),
        forwardRef(() => MetadataModule),
    ],
    controllers: [AuthController],
    providers: [
        AuthService,
        JwtStrategy,
        SMSService,
        EmailService,
        MailrelayService,
        MailerService,
        LoggerService
    ],
    exports: [JwtStrategy, AuthService],
})
export class AuthModule { }
