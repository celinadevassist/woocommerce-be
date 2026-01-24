import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';

import { ProductImportController } from './controller';
import { ProductImportService } from './service';
import { ProductImport, ProductImportSchema } from './schema';
import { Store, StoreSchema } from '../store/schema';
import { Product, ProductSchema } from '../product/schema';
import { ProductVariant, ProductVariantSchema } from '../product/variant.schema';
import { WooCommerceModule } from '../integrations/woocommerce/woocommerce.module';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    MongooseModule.forFeature([
      { name: ProductImport.name, schema: ProductImportSchema },
      { name: Store.name, schema: StoreSchema },
      { name: Product.name, schema: ProductSchema },
      { name: ProductVariant.name, schema: ProductVariantSchema },
    ]),
    WooCommerceModule,
  ],
  controllers: [ProductImportController],
  providers: [ProductImportService],
  exports: [ProductImportService, MongooseModule],
})
export class ProductImportModule {}
