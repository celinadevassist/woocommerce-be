import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import { InventoryController } from './controller';
import { InventoryService } from './service';
import {
  InventoryLog,
  InventoryLogSchema,
  StockAlert,
  StockAlertSchema,
} from './schema';
import { Product, ProductSchema } from '../product/schema';
import {
  ProductVariant,
  ProductVariantSchema,
} from '../product/variant.schema';
import { Store, StoreSchema } from '../store/schema';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    MongooseModule.forFeature([
      { name: InventoryLog.name, schema: InventoryLogSchema },
      { name: StockAlert.name, schema: StockAlertSchema },
      { name: Product.name, schema: ProductSchema },
      { name: ProductVariant.name, schema: ProductVariantSchema },
      { name: Store.name, schema: StoreSchema },
    ]),
  ],
  controllers: [InventoryController],
  providers: [InventoryService],
  exports: [InventoryService],
})
export class InventoryModule {}
