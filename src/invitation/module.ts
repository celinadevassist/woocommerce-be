import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { Invitation, InvitationSchema } from './schema';
import { InvitationController } from './controller';
import { InvitationService } from './service';
import { AuthModule } from '../auth/auth.module';
import { Store, StoreSchema } from '../store/schema';
import { User, UserSchema } from '../schema/user.schema';

@Module({
  imports: [
    ConfigModule,
    forwardRef(() => AuthModule),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    MongooseModule.forFeature([
      { name: Invitation.name, schema: InvitationSchema },
      { name: Store.name, schema: StoreSchema },
      { name: User.name, schema: UserSchema },
    ]),
    HttpModule,
  ],
  controllers: [InvitationController],
  providers: [InvitationService],
  exports: [InvitationService],
})
export class InvitationModule {}
