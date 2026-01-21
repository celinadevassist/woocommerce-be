import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { StateGroup, StateGroupSchema } from './state-group.schema';
import { LocalState, LocalStateSchema } from './local-state.schema';
import { LocationLibraryService } from './service';
import { LocationLibraryController } from './controller';
import { ShippingModule } from '../shipping/module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: StateGroup.name, schema: StateGroupSchema },
      { name: LocalState.name, schema: LocalStateSchema },
    ]),
    forwardRef(() => ShippingModule),
  ],
  controllers: [LocationLibraryController],
  providers: [LocationLibraryService],
  exports: [LocationLibraryService],
})
export class LocationLibraryModule {}
