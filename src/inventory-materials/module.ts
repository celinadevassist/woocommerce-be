import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import { InventoryMaterialsController } from './controller';
import { InventoryMaterialsService } from './service';
import {
  Material,
  MaterialSchema,
  MaterialTransaction,
  MaterialTransactionSchema,
} from './schema';
import { Store, StoreSchema } from '../store/schema';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    MongooseModule.forFeature([
      { name: Material.name, schema: MaterialSchema },
      { name: MaterialTransaction.name, schema: MaterialTransactionSchema },
      { name: Store.name, schema: StoreSchema },
    ]),
  ],
  controllers: [InventoryMaterialsController],
  providers: [InventoryMaterialsService],
  exports: [InventoryMaterialsService],
})
export class InventoryMaterialsModule {}
