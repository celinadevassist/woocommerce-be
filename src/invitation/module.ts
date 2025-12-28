import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { Invitation, InvitationSchema } from './schema';
import { InvitationController } from './controller';
import { InvitationService } from './service';
import { AuthModule } from '../auth/auth.module';
import { Organization, OrganizationSchema } from '../organization/schema';
import { User, UserSchema } from '../schema/user.schema';
import { EmailService } from '../services/email.service';
import { MailrelayService } from '../services/mailrelay.service';
import { MailerService } from '../services/mailer.service';
import { LoggerModule } from '../logger/logger.module';
import { MetadataModule } from '../common_metadata_module/module';

@Module({
  imports: [
    ConfigModule,
    forwardRef(() => AuthModule),
    forwardRef(() => MetadataModule),
    forwardRef(() => LoggerModule),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    MongooseModule.forFeature([
      { name: Invitation.name, schema: InvitationSchema },
      { name: Organization.name, schema: OrganizationSchema },
      { name: User.name, schema: UserSchema },
    ]),
    HttpModule,
  ],
  controllers: [InvitationController],
  providers: [
    InvitationService,
    EmailService,
    MailrelayService,
    MailerService,
  ],
  exports: [InvitationService],
})
export class InvitationModule {}
