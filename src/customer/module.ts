import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import { Customer, CustomerSchema } from './schema';
import { CustomerSegment, CustomerSegmentSchema } from './segment.schema';
import { Order, OrderSchema } from '../order/schema';
import { Store, StoreSchema } from '../store/schema';
import { CustomerController } from './controller';
import { CustomerService } from './service';
import { PhoneModule } from '../phone/module';
import { EmailModule } from '../email/module';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    MongooseModule.forFeature([
      { name: Customer.name, schema: CustomerSchema },
      { name: CustomerSegment.name, schema: CustomerSegmentSchema },
      { name: Order.name, schema: OrderSchema },
      { name: Store.name, schema: StoreSchema },
    ]),
    forwardRef(() => PhoneModule),
    forwardRef(() => EmailModule),
  ],
  controllers: [CustomerController],
  providers: [CustomerService],
  exports: [CustomerService, MongooseModule],
})
export class CustomerModule {}
