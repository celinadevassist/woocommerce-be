import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import { AdminController } from './controller';
import { AdminService } from './service';
import { User, UserSchema } from '../schema/user.schema';
import { Store, StoreSchema } from '../store/schema';
import {
  Subscription,
  SubscriptionSchema,
  Invoice,
  InvoiceSchema,
} from '../subscription/schema';
import { RoleModule } from '../modules/roles.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Store.name, schema: StoreSchema },
      { name: Subscription.name, schema: SubscriptionSchema },
      { name: Invoice.name, schema: InvoiceSchema },
    ]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    RoleModule,
  ],
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
