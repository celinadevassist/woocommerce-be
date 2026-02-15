import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { MongooseModule } from '@nestjs/mongoose';
import { CustomFieldsetController } from './controller';
import { CustomFieldsetService } from './service';
import { CustomFieldset, CustomFieldsetSchema } from './schema';
import { Store, StoreSchema } from '../store/schema';
import { Product, ProductSchema } from '../product/schema';
import { Category, CategorySchema } from '../category/schema';
import { Tag, TagSchema } from '../tag/schema';
import { Attribute, AttributeSchema } from '../attribute/schema';
import { WooCommerceModule } from '../integrations/woocommerce/woocommerce.module';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    MongooseModule.forFeature([
      { name: CustomFieldset.name, schema: CustomFieldsetSchema },
      { name: Store.name, schema: StoreSchema },
      { name: Product.name, schema: ProductSchema },
      { name: Category.name, schema: CategorySchema },
      { name: Tag.name, schema: TagSchema },
      { name: Attribute.name, schema: AttributeSchema },
    ]),
    WooCommerceModule,
  ],
  controllers: [CustomFieldsetController],
  providers: [CustomFieldsetService],
  exports: [CustomFieldsetService],
})
export class CustomFieldsetModule {}
