import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import { InventorySKUsController } from './controller';
import { InventorySKUsService } from './service';
import { SKU, SKUSchema } from './schema';
import { Material, MaterialSchema } from '../inventory-materials/schema';
import { Store, StoreSchema } from '../store/schema';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    MongooseModule.forFeature([
      { name: SKU.name, schema: SKUSchema },
      { name: Material.name, schema: MaterialSchema },
      { name: Store.name, schema: StoreSchema },
    ]),
  ],
  controllers: [InventorySKUsController],
  providers: [InventorySKUsService],
  exports: [InventorySKUsService],
})
export class InventorySKUsModule {}
