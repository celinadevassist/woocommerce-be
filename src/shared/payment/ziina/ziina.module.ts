import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ZiinaService } from './ziina.service';

@Module({
  imports: [ConfigModule],
  providers: [ZiinaService],
  exports: [ZiinaService],
})
export class ZiinaModule {}
