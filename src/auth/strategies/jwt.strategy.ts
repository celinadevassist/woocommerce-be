import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { config } from '../../config.manager';

// interfaces
import { IJWTPayload } from '../../interfaces';

// services
import { AuthService } from '../auth.service';
import { UserDocument } from 'src/schema';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly authService: AuthService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: process.env.JWT_SECRET || config.jwt.secret,
    });
  }

  public async validate(payload: IJWTPayload): Promise<UserDocument> {
    const user: UserDocument = await this.authService.findUserExistance(
      payload.customer.id,
    );
    if (!user) {
      throw new UnauthorizedException();
    }
    return user;
  }
}
