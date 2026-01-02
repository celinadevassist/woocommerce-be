import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ProductionBatchesController } from './controller';
import { ProductionBatchesService } from './service';
import { ProductionBatch, ProductionBatchSchema } from './schema';
import { Material, MaterialSchema } from '../inventory-materials/schema';
import { SKU, SKUSchema } from '../inventory-skus/schema';
import { Store, StoreSchema } from '../store/schema';
import { InventoryMaterialsModule } from '../inventory-materials/module';
import { ProductUnitModule } from '../product-unit/module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ProductionBatch.name, schema: ProductionBatchSchema },
      { name: Material.name, schema: MaterialSchema },
      { name: SKU.name, schema: SKUSchema },
      { name: Store.name, schema: StoreSchema },
    ]),
    InventoryMaterialsModule,
    ProductUnitModule,
  ],
  controllers: [ProductionBatchesController],
  providers: [ProductionBatchesService],
  exports: [ProductionBatchesService],
})
export class ProductionBatchesModule {}
