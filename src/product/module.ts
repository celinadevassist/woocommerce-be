import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import { ProductController } from './controller';
import { ProductService } from './service';
import { Product, ProductSchema } from './schema';
import { ProductVariant, ProductVariantSchema } from './variant.schema';
import { Store, StoreSchema } from '../store/schema';
import { Category, CategorySchema } from '../category/schema';
import { Tag, TagSchema } from '../tag/schema';
import { Attribute, AttributeSchema } from '../attribute/schema';
import { WooCommerceModule } from '../integrations/woocommerce/woocommerce.module';
import { S3UploadModule } from '../modules/s3-upload/s3-upload.module';
import { SearchAnalyticsModule } from '../modules/search-analytics/search-analytics.module';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    MongooseModule.forFeature([
      { name: Product.name, schema: ProductSchema },
      { name: ProductVariant.name, schema: ProductVariantSchema },
      { name: Store.name, schema: StoreSchema },
      { name: Category.name, schema: CategorySchema },
      { name: Tag.name, schema: TagSchema },
      { name: Attribute.name, schema: AttributeSchema },
    ]),
    WooCommerceModule,
    S3UploadModule,
    SearchAnalyticsModule,
  ],
  controllers: [ProductController],
  providers: [ProductService],
  exports: [ProductService, MongooseModule],
})
export class ProductModule {}
