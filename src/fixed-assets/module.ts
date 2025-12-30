import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { FixedAssetsController } from './controller';
import { FixedAssetsService } from './service';
import { FixedAsset, FixedAssetSchema } from './schema';
import { Store, StoreSchema } from '../store/schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: FixedAsset.name, schema: FixedAssetSchema },
      { name: Store.name, schema: StoreSchema },
    ]),
  ],
  controllers: [FixedAssetsController],
  providers: [FixedAssetsService],
  exports: [FixedAssetsService],
})
export class FixedAssetsModule {}
