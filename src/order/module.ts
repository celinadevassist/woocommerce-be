import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import { Order, OrderSchema } from './schema';
import { OrderController } from './controller';
import { OrderService } from './service';
import { OrganizationModule } from '../organization/module';
import { Store, StoreSchema } from '../store/schema';
import { WooCommerceModule } from '../integrations/woocommerce/woocommerce.module';
import { CustomerModule } from '../customer/module';
import { PhoneModule } from '../phone/module';
import { EmailModule } from '../email/module';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    MongooseModule.forFeature([
      { name: Order.name, schema: OrderSchema },
      { name: Store.name, schema: StoreSchema },
    ]),
    forwardRef(() => OrganizationModule),
    forwardRef(() => CustomerModule),
    forwardRef(() => PhoneModule),
    forwardRef(() => EmailModule),
    WooCommerceModule,
  ],
  controllers: [OrderController],
  providers: [OrderService],
  exports: [OrderService, MongooseModule],
})
export class OrderModule {}
