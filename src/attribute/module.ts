import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import { AttributeController } from './controller';
import { AttributeService } from './service';
import { Attribute, AttributeSchema, AttributeTerm, AttributeTermSchema } from './schema';
import { Store, StoreSchema } from '../store/schema';
import { Organization, OrganizationSchema } from '../organization/schema';
import { WooCommerceModule } from '../integrations/woocommerce/woocommerce.module';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    MongooseModule.forFeature([
      { name: Attribute.name, schema: AttributeSchema },
      { name: AttributeTerm.name, schema: AttributeTermSchema },
      { name: Store.name, schema: StoreSchema },
      { name: Organization.name, schema: OrganizationSchema },
    ]),
    WooCommerceModule,
  ],
  controllers: [AttributeController],
  providers: [AttributeService],
  exports: [AttributeService],
})
export class AttributeModule {}
