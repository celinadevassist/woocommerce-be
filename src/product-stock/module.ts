import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ProductStockController } from './controller';
import { ProductStockService } from './service';
import { ProductStock, ProductStockSchema, StockTransaction, StockTransactionSchema } from './schema';
import { Store, StoreSchema } from '../store/schema';
import { ProductUnit, ProductUnitSchema } from '../product-unit/schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ProductStock.name, schema: ProductStockSchema },
      { name: StockTransaction.name, schema: StockTransactionSchema },
      { name: Store.name, schema: StoreSchema },
      { name: ProductUnit.name, schema: ProductUnitSchema },
    ]),
  ],
  controllers: [ProductStockController],
  providers: [ProductStockService],
  exports: [ProductStockService],
})
export class ProductStockModule {}
