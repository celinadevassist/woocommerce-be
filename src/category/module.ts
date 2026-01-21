import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import { CategoryController } from './controller';
import { CategoryService } from './service';
import { Category, CategorySchema } from './schema';
import { Store, StoreSchema } from '../store/schema';
import { WooCommerceModule } from '../integrations/woocommerce/woocommerce.module';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    MongooseModule.forFeature([
      { name: Category.name, schema: CategorySchema },
      { name: Store.name, schema: StoreSchema },
    ]),
    WooCommerceModule,
  ],
  controllers: [CategoryController],
  providers: [CategoryService],
  exports: [CategoryService, MongooseModule],
})
export class CategoryModule {}
