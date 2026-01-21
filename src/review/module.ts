import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import { Review, ReviewSchema } from './schema';
import {
  ResponseTemplate,
  ResponseTemplateSchema,
} from './response-template.schema';
import { ReviewController } from './controller';
import { PublicReviewController } from './public.controller';
import { ReviewService } from './service';
import { PublicReviewService } from './public.service';
import { ProductModule } from '../product/module';
import { Store, StoreSchema } from '../store/schema';
import { Product, ProductSchema } from '../product/schema';
import { WooCommerceModule } from '../integrations/woocommerce/woocommerce.module';
import { StoreModule } from '../store/module';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    MongooseModule.forFeature([
      { name: Review.name, schema: ReviewSchema },
      { name: Store.name, schema: StoreSchema },
      { name: Product.name, schema: ProductSchema },
      { name: ResponseTemplate.name, schema: ResponseTemplateSchema },
    ]),
    forwardRef(() => ProductModule),
    forwardRef(() => StoreModule),
    WooCommerceModule,
  ],
  controllers: [ReviewController, PublicReviewController],
  providers: [ReviewService, PublicReviewService],
  exports: [ReviewService, MongooseModule],
})
export class ReviewModule {}
