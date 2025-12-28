import { Module, forwardRef } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AnalyticsController } from './controller';
import { AnalyticsService } from './service';
import { OrderModule } from '../order/module';
import { CustomerModule } from '../customer/module';
import { ProductModule } from '../product/module';
import { ReviewModule } from '../review/module';
import { OrganizationModule } from '../organization/module';
import { StoreModule } from '../store/module';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    forwardRef(() => OrderModule),
    forwardRef(() => CustomerModule),
    forwardRef(() => ProductModule),
    forwardRef(() => ReviewModule),
    forwardRef(() => OrganizationModule),
    forwardRef(() => StoreModule),
  ],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
