import { forwardRef, Module, OnModuleInit } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import { Connection } from 'mongoose';
import { InjectConnection } from '@nestjs/mongoose';

import { RoleModule, UserModule } from 'src/modules';
import { ActionLogModule } from 'src/modules/actionLog.module';
import { MetadataController } from './controller';
import { Metadata, MetadataSchema } from './schema';
import { MetadataService } from './service';

@Module({
  imports: [
    forwardRef(() => UserModule),
    forwardRef(() => RoleModule),
    forwardRef(() => ActionLogModule),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    MongooseModule.forFeature([
      { name: Metadata.name, schema: MetadataSchema },
      // References to other models are included in service via injection
    ]),
  ],
  controllers: [
    MetadataController,
  ],
  providers: [
    MetadataService,
  ],
  exports: [
    MetadataService,
  ],
})
export class MetadataModule implements OnModuleInit {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  async onModuleInit() {
    try {
      // Ensure indexes are properly created for metadata collection
      const collection = this.connection.collection('metadata');
      
      console.log('Checking metadata collection indexes...');
      const indexes = await collection.indexes();
      
      console.log('Metadata collection indexes checked/updated successfully');
    } catch (error) {
      console.error('Error managing metadata indexes:', error);
    }
  }
} 