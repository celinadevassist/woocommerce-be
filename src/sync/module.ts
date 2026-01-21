import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import { ScheduleModule } from '@nestjs/schedule';
import { SyncController } from './controller';
import { SyncService } from './service';
import { ScheduledSyncService } from './scheduled-sync.service';
import { SyncJob, SyncJobSchema } from './schema';
import { Store, StoreSchema } from '../store/schema';
import { StoreModule } from '../store/module';
import { ProductModule } from '../product/module';
import { OrderModule } from '../order/module';
import { CustomerModule } from '../customer/module';
import { ReviewModule } from '../review/module';
import { WooCommerceModule } from '../integrations/woocommerce/woocommerce.module';
import { LoggerModule } from '../logger/logger.module';
import { MetadataModule } from '../common_metadata_module/module';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    ScheduleModule.forRoot(),
    MongooseModule.forFeature([
      { name: SyncJob.name, schema: SyncJobSchema },
      { name: Store.name, schema: StoreSchema },
    ]),
    forwardRef(() => StoreModule),
    forwardRef(() => ProductModule),
    forwardRef(() => OrderModule),
    forwardRef(() => CustomerModule),
    forwardRef(() => ReviewModule),
    WooCommerceModule,
    LoggerModule,
    forwardRef(() => MetadataModule),
  ],
  controllers: [SyncController],
  providers: [SyncService, ScheduledSyncService],
  exports: [SyncService, ScheduledSyncService],
})
export class SyncModule {}
