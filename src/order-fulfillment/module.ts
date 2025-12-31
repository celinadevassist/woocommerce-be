import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Order, OrderSchema } from '../order/schema';
import { ProductUnit, ProductUnitSchema } from '../product-unit/schema';
import { OrderFulfillmentService } from './service';
import { OrderFulfillmentController } from './controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Order.name, schema: OrderSchema },
      { name: ProductUnit.name, schema: ProductUnitSchema },
    ]),
  ],
  controllers: [OrderFulfillmentController],
  providers: [OrderFulfillmentService],
  exports: [OrderFulfillmentService],
})
export class OrderFulfillmentModule {}
