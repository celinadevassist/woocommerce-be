import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EmailService } from './email.service';
import { MailerService } from './mailer.service';
import { MailrelayService } from './mailrelay.service';
import { LoggerModule } from '../logger/logger.module';
import { MetadataModule } from '../common_metadata_module/module';

@Global()
@Module({
  imports: [ConfigModule, LoggerModule, MetadataModule],
  providers: [EmailService, MailerService, MailrelayService],
  exports: [EmailService, MailerService, MailrelayService],
})
export class SharedEmailModule {}
