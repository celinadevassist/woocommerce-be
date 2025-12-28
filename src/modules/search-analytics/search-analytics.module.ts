import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import { SearchAnalyticsController } from './search-analytics.controller';
import { SearchAnalyticsService } from './search-analytics.service';
import { SearchQuerySchema } from '../../shared/search-query.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: 'SearchQuery', schema: SearchQuerySchema }
    ]),
    PassportModule.register({ defaultStrategy: 'jwt' })
  ],
  controllers: [SearchAnalyticsController],
  providers: [SearchAnalyticsService],
  exports: [SearchAnalyticsService]
})
export class SearchAnalyticsModule {}
