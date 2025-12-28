import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Phone, PhoneSchema } from './schema';
import { PhoneService } from './service';
import { PhoneController } from './controller';
import { CustomerModule } from '../customer/module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Phone.name, schema: PhoneSchema }]),
    forwardRef(() => CustomerModule),
  ],
  controllers: [PhoneController],
  providers: [PhoneService],
  exports: [PhoneService],
})
export class PhoneModule {}
