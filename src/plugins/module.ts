import { Module } from '@nestjs/common';
import { PluginsController } from './controller';

@Module({
  controllers: [PluginsController],
})
export class PluginsModule {}
