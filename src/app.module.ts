import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from './auth/auth.module';
import { config } from './config.manager';
import { Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RoleModule, UserModule } from './modules';
import { HealthController } from './controllers/health.controller';

import { ActionLogModule } from './modules/actionLog.module';

import { MetadataModule } from './common_metadata_module/module';
import { SearchAnalyticsModule } from './modules/search-analytics/search-analytics.module';
import { S3UploadModule } from './modules/s3-upload/s3-upload.module';
import { ZiinaModule } from './shared/payment/ziina';
import { SharedEmailModule } from './services/shared-email.module';

// CartFlow modules
import { StoreModule } from './store/module';
import { SyncModule } from './sync/module';
import { ProductModule } from './product/module';
import { InventoryModule } from './inventory/module';
import { OrderModule } from './order/module';
import { CustomerModule } from './customer/module';
import { ReviewModule } from './review/module';
import { AnalyticsModule } from './analytics/module';
import { WebhookModule } from './webhook/module';
import { CategoryModule } from './category/module';
import { AttributeModule } from './attribute/module';
import { TagModule } from './tag/module';
import { InvitationModule } from './invitation/module';
import { AuditLogModule } from './audit-log/module';
import { PhoneModule } from './phone/module';
import { EmailModule } from './email/module';
import { SubscriptionModule } from './subscription/module';
import { AdminModule } from './admin/module';
import { InventoryMaterialsModule } from './inventory-materials/module';
import { InventorySKUsModule } from './inventory-skus/module';
import { ProductionBatchesModule } from './production-batches/module';
import { ProductUnitModule } from './product-unit/module';
import { OrderFulfillmentModule } from './order-fulfillment/module';
import { OrderItemModule } from './order-item/module';
import { RunningCostsModule } from './running-costs/module';
import { FixedAssetsModule } from './fixed-assets/module';
import { ReviewRequestModule } from './review-request/module';
import { ShippingModule } from './shipping/module';
import { PluginsModule } from './plugins/module';
import { StoreSettingsModule } from './store-settings/module';
import { LocationLibraryModule } from './location-library/module';
import { ProductImportModule } from './product-import/module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    RoleModule,
    AuthModule,
    UserModule,

    ActionLogModule,
    MongooseModule.forRoot(process.env.DB_URI),
    MetadataModule,
    SearchAnalyticsModule,

    // Shared modules
    S3UploadModule,
    ZiinaModule,
    SharedEmailModule,

    // CartFlow modules
    StoreModule,
    SyncModule,
    ProductModule,
    InventoryModule,
    OrderModule,
    CustomerModule,
    ReviewModule,
    AnalyticsModule,
    WebhookModule,
    CategoryModule,
    AttributeModule,
    TagModule,
    InvitationModule,
    AuditLogModule,
    PhoneModule,
    EmailModule,
    SubscriptionModule,
    AdminModule,
    InventoryMaterialsModule,
    InventorySKUsModule,
    ProductionBatchesModule,
    ProductUnitModule,
    OrderFulfillmentModule,
    OrderItemModule,
    RunningCostsModule,
    FixedAssetsModule,
    ReviewRequestModule,
    ShippingModule,
    PluginsModule,
    StoreSettingsModule,
    LocationLibraryModule,
    ProductImportModule,
  ],
  controllers: [HealthController],
  providers: [ValidationPipe],
})
export class AppModule {}
