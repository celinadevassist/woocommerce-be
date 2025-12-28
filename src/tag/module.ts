import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import { TagController } from './controller';
import { TagService } from './service';
import { Tag, TagSchema } from './schema';
import { Store, StoreSchema } from '../store/schema';
import { Organization, OrganizationSchema } from '../organization/schema';
import { WooCommerceModule } from '../integrations/woocommerce/woocommerce.module';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    MongooseModule.forFeature([
      { name: Tag.name, schema: TagSchema },
      { name: Store.name, schema: StoreSchema },
      { name: Organization.name, schema: OrganizationSchema },
    ]),
    WooCommerceModule,
  ],
  controllers: [TagController],
  providers: [TagService],
  exports: [TagService, MongooseModule],
})
export class TagModule {}
