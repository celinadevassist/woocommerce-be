import { forwardRef, Module, Global } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import { AuditLog, AuditLogSchema } from './schema';
import { AuditLogController } from './controller';
import { AuditLogService } from './service';
import { AuthModule } from '../auth/auth.module';

@Global() // Make AuditLogService available globally
@Module({
  imports: [
    forwardRef(() => AuthModule),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    MongooseModule.forFeature([
      { name: AuditLog.name, schema: AuditLogSchema },
    ]),
  ],
  controllers: [AuditLogController],
  providers: [AuditLogService],
  exports: [AuditLogService],
})
export class AuditLogModule {}
