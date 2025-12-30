import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RunningCostsController } from './controller';
import { RunningCostsService } from './service';
import { CostTemplate, CostTemplateSchema, CostEntry, CostEntrySchema } from './schema';
import { Store, StoreSchema } from '../store/schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CostTemplate.name, schema: CostTemplateSchema },
      { name: CostEntry.name, schema: CostEntrySchema },
      { name: Store.name, schema: StoreSchema },
    ]),
  ],
  controllers: [RunningCostsController],
  providers: [RunningCostsService],
  exports: [RunningCostsService],
})
export class RunningCostsModule {}
