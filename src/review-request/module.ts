import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import { ScheduleModule } from '@nestjs/schedule';
import { ReviewRequest, ReviewRequestSchema } from './schema';
import { ReviewRequestSettings, ReviewRequestSettingsSchema } from './settings.schema';
import { ReviewRequestController } from './controller';
import { PublicReviewRequestController } from './public.controller';
import { ReviewRequestService } from './service';
import { ReviewRequestScheduledService } from './scheduled.service';
import { Store, StoreSchema } from '../store/schema';
import { Order, OrderSchema } from '../order/schema';
import { ReviewModule } from '../review/module';
import { SMSService } from '../services/sms.service';
import { LoggerService } from '../logger/logger.service';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    ScheduleModule.forRoot(),
    MongooseModule.forFeature([
      { name: ReviewRequest.name, schema: ReviewRequestSchema },
      { name: ReviewRequestSettings.name, schema: ReviewRequestSettingsSchema },
      { name: Store.name, schema: StoreSchema },
      { name: Order.name, schema: OrderSchema },
    ]),
    forwardRef(() => ReviewModule),
  ],
  controllers: [ReviewRequestController, PublicReviewRequestController],
  providers: [
    ReviewRequestService,
    ReviewRequestScheduledService,
    SMSService,
    LoggerService,
  ],
  exports: [ReviewRequestService, MongooseModule],
})
export class ReviewRequestModule {}
