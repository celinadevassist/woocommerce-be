import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import { StoreController } from './controller';
import { StoreService } from './service';
import { Store, StoreSchema } from './schema';
import { WooCommerceModule } from '../integrations/woocommerce/woocommerce.module';
import { SyncModule } from '../sync/module';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    MongooseModule.forFeature([{ name: Store.name, schema: StoreSchema }]),
    forwardRef(() => SyncModule),
    WooCommerceModule,
  ],
  controllers: [StoreController],
  providers: [StoreService],
  exports: [StoreService, MongooseModule],
})
export class StoreModule {}
