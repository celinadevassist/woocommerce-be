import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { WebhookController } from './controller';
import { WebhookService } from './service';
import { Store, StoreSchema } from '../store/schema';
import { OrderModule } from '../order/module';
import { ProductModule } from '../product/module';
import { CustomerModule } from '../customer/module';
import { ReviewModule } from '../review/module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Store.name, schema: StoreSchema }]),
    forwardRef(() => OrderModule),
    forwardRef(() => ProductModule),
    forwardRef(() => CustomerModule),
    forwardRef(() => ReviewModule),
  ],
  controllers: [WebhookController],
  providers: [WebhookService],
  exports: [WebhookService],
})
export class WebhookModule {}
