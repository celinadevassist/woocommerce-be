import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ProductStockController } from './controller';
import { ProductStockService } from './service';
import { ProductStock, ProductStockSchema, StockTransaction, StockTransactionSchema } from './schema';
import { Store, StoreSchema } from '../store/schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ProductStock.name, schema: ProductStockSchema },
      { name: StockTransaction.name, schema: StockTransactionSchema },
      { name: Store.name, schema: StoreSchema },
    ]),
  ],
  controllers: [ProductStockController],
  providers: [ProductStockService],
  exports: [ProductStockService],
})
export class ProductStockModule {}
