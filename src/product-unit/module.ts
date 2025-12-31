import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ProductUnitController } from './controller';
import { ProductUnitService } from './service';
import { ProductUnit, ProductUnitSchema } from './schema';
import { Store, StoreSchema } from '../store/schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ProductUnit.name, schema: ProductUnitSchema },
      { name: Store.name, schema: StoreSchema },
    ]),
  ],
  controllers: [ProductUnitController],
  providers: [ProductUnitService],
  exports: [ProductUnitService],
})
export class ProductUnitModule {}
