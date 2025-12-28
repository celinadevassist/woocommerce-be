import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import { ProductController } from './controller';
import { ProductService } from './service';
import { Product, ProductSchema } from './schema';
import { ProductVariant, ProductVariantSchema } from './variant.schema';
import { Organization, OrganizationSchema } from '../organization/schema';
import { Store, StoreSchema } from '../store/schema';
import { WooCommerceModule } from '../integrations/woocommerce/woocommerce.module';
import { S3UploadModule } from '../modules/s3-upload/s3-upload.module';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    MongooseModule.forFeature([
      { name: Product.name, schema: ProductSchema },
      { name: ProductVariant.name, schema: ProductVariantSchema },
      { name: Organization.name, schema: OrganizationSchema },
      { name: Store.name, schema: StoreSchema },
    ]),
    WooCommerceModule,
    S3UploadModule,
  ],
  controllers: [ProductController],
  providers: [ProductService],
  exports: [ProductService, MongooseModule],
})
export class ProductModule {}
