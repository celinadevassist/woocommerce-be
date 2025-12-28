import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import { Customer, CustomerSchema } from './schema';
import { CustomerSegment, CustomerSegmentSchema } from './segment.schema';
import { Order, OrderSchema } from '../order/schema';
import { CustomerController } from './controller';
import { CustomerService } from './service';
import { OrganizationModule } from '../organization/module';
import { PhoneModule } from '../phone/module';
import { EmailModule } from '../email/module';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    MongooseModule.forFeature([
      { name: Customer.name, schema: CustomerSchema },
      { name: CustomerSegment.name, schema: CustomerSegmentSchema },
      { name: Order.name, schema: OrderSchema },
    ]),
    forwardRef(() => OrganizationModule),
    forwardRef(() => PhoneModule),
    forwardRef(() => EmailModule),
  ],
  controllers: [CustomerController],
  providers: [CustomerService],
  exports: [CustomerService, MongooseModule],
})
export class CustomerModule {}
