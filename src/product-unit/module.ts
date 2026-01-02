import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ProductUnitController } from './controller';
import { ProductUnitService } from './service';
import { ProductUnit, ProductUnitSchema } from './schema';
import { Store, StoreSchema } from '../store/schema';
import { SKU, SKUSchema } from '../inventory-skus/schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ProductUnit.name, schema: ProductUnitSchema },
      { name: Store.name, schema: StoreSchema },
      { name: SKU.name, schema: SKUSchema },
    ]),
  ],
  controllers: [ProductUnitController],
  providers: [ProductUnitService],
  exports: [ProductUnitService],
})
export class ProductUnitModule {}
