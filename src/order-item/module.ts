import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import { OrderItemController } from './controller';
import { OrderItemService } from './service';
import { OrderItem, OrderItemSchema } from './schema';
import { Order, OrderSchema } from '../order/schema';
import { ProductUnit, ProductUnitSchema } from '../product-unit/schema';
import { ProductStockModule } from '../product-stock/module';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    MongooseModule.forFeature([
      { name: OrderItem.name, schema: OrderItemSchema },
      { name: Order.name, schema: OrderSchema },
      { name: ProductUnit.name, schema: ProductUnitSchema },
    ]),
    forwardRef(() => ProductStockModule),
  ],
  controllers: [OrderItemController],
  providers: [OrderItemService],
  exports: [OrderItemService],
})
export class OrderItemModule {}
