import { Module, Global } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { Subscription, SubscriptionSchema, Invoice, InvoiceSchema } from './schema';
import { SubscriptionService } from './service';
import { SubscriptionController, InvoiceController } from './controller';
import { SubscriptionGuard } from './guard';

@Global() // Make this module global so SubscriptionGuard can be used anywhere
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Subscription.name, schema: SubscriptionSchema },
      { name: Invoice.name, schema: InvoiceSchema },
    ]),
    ScheduleModule.forRoot(),
  ],
  controllers: [SubscriptionController, InvoiceController],
  providers: [SubscriptionService, SubscriptionGuard],
  exports: [SubscriptionService, SubscriptionGuard],
})
export class SubscriptionModule {}
