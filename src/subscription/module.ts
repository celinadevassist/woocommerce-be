import { Module, Global } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigModule } from '@nestjs/config';
import {
  Subscription,
  SubscriptionSchema,
  Invoice,
  InvoiceSchema,
} from './schema';
import { Store, StoreSchema } from '../store/schema';
import { SubscriptionService } from './service';
import {
  SubscriptionController,
  InvoiceController,
  PaymentWebhookController,
} from './controller';
import { SubscriptionGuard } from './guard';
import { ZiinaModule } from '../shared/payment/ziina';

@Global() // Make this module global so SubscriptionGuard can be used anywhere
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Subscription.name, schema: SubscriptionSchema },
      { name: Invoice.name, schema: InvoiceSchema },
      { name: Store.name, schema: StoreSchema },
    ]),
    ScheduleModule.forRoot(),
    ConfigModule,
    ZiinaModule,
  ],
  controllers: [
    SubscriptionController,
    InvoiceController,
    PaymentWebhookController,
  ],
  providers: [SubscriptionService, SubscriptionGuard],
  exports: [SubscriptionService, SubscriptionGuard],
})
export class SubscriptionModule {}
