import { CanActivate, forwardRef, Inject, Injectable } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { verify } from 'jsonwebtoken';
import { config } from '../config.manager';

@Injectable()
export class WsGuard implements CanActivate {
  constructor(
    @Inject(forwardRef(() => AuthService)) private authService: AuthService,
  ) {}

  async canActivate(context: any): Promise<boolean | any> {
    const bearerToken =
      context.args[0].handshake.headers?.authorization?.split(' ')[1];
    try {
      const payload = verify(
        bearerToken,
        process.env.JWT_SECRET || config.jwt.secret,
      ) as any;
      const user = await this.authService.findUserExistance(
        payload.customer.id,
      );
      if (user) {
        context.args[0].handshake.user = user;
        return user;
      } else {
        return false;
      }
    } catch (ex) {
      return false;
    }
  }
}
