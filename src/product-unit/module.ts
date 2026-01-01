import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ProductUnitController } from './controller';
import { ProductUnitService } from './service';
import { ProductUnit, ProductUnitSchema } from './schema';
import { Store, StoreSchema } from '../store/schema';
import { ProductStockModule } from '../product-stock/module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ProductUnit.name, schema: ProductUnitSchema },
      { name: Store.name, schema: StoreSchema },
    ]),
    forwardRef(() => ProductStockModule),
  ],
  controllers: [ProductUnitController],
  providers: [ProductUnitService],
  exports: [ProductUnitService],
})
export class ProductUnitModule {}
