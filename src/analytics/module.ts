import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import { AnalyticsController } from './controller';
import { AnalyticsService } from './service';
import { OrderModule } from '../order/module';
import { CustomerModule } from '../customer/module';
import { ProductModule } from '../product/module';
import { ReviewModule } from '../review/module';
import { StoreModule } from '../store/module';
import { CostEntry, CostEntrySchema } from '../running-costs/schema';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    MongooseModule.forFeature([
      { name: CostEntry.name, schema: CostEntrySchema },
    ]),
    forwardRef(() => OrderModule),
    forwardRef(() => CustomerModule),
    forwardRef(() => ProductModule),
    forwardRef(() => ReviewModule),
    forwardRef(() => StoreModule),
  ],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
