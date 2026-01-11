import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ShippingController } from './controller';
import { ShippingService } from './service';
import { Store, StoreSchema } from '../store/schema';
import { WooCommerceModule } from '../integrations/woocommerce/woocommerce.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Store.name, schema: StoreSchema }]),
    WooCommerceModule,
  ],
  controllers: [ShippingController],
  providers: [ShippingService],
  exports: [ShippingService],
})
export class ShippingModule {}
