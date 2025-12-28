import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { S3UploadService } from './s3-upload.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [S3UploadService],
  exports: [S3UploadService],
})
export class S3UploadModule {}
