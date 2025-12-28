import { Controller, Post, Body, UsePipes, Get, Param, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

import { Scopes, User } from '../decorators';

import { JoiValidationPipe } from '../pipes';
import {
  UpdatePasswordDTO, UpdatePasswordSchema,
  SignInDTO, SignInSchema,
  SignUpSchema, SignUpDTO,
  LanguageSchema,
  EmailSchema,
} from '../dtos';
import { UserDocument } from 'src/schema';


@ApiTags('auth')
@ApiBearerAuth()
@Controller(':lang/auth')

export class AuthController {
  constructor(private authService: AuthService) { }
  @Post('signup')
  @UsePipes(new JoiValidationPipe({
    body: SignUpSchema,
    param: {
      lang: LanguageSchema,
    }
  }))
  async signup(@Body() user: SignUpDTO, @Param('lang') lang: string): Promise<any> {
    return await this.authService.signup(user, lang);
  }

  @Post('signin')
  @UsePipes(new JoiValidationPipe({
    body: SignInSchema,
    param: {
      lang: LanguageSchema,
    }
  }))
  async signIn(@Body() user: SignInDTO, @Param('lang') lang: string): Promise<any> {
    return await this.authService.signin(user, lang);
  }

  @Get('forgot-password/:email')
  @UsePipes(new JoiValidationPipe({
    param: {
      email: EmailSchema,
      lang: LanguageSchema,
    }
  }))
  async forgetPassword(@Param('email') email: string, @Param('lang') lang: string) {
    return await this.authService.forgetPassword(email, lang);
  }

  @Post('reset-password')
  @UsePipes(new JoiValidationPipe({
    param: {
      lang: LanguageSchema,
    }
  }))
  async resetPassword(
    @Body() data: { token: string; newPassword: string },
    @Param('lang') lang: string
  ): Promise<any> {
    return await this.authService.resetPasswordWithToken(data.token, data.newPassword, lang);
  }

  @Get('verify-email/:token')
  @UsePipes(new JoiValidationPipe({
    param: {
      lang: LanguageSchema,
    }
  }))
  async verifyEmail(@Param('token') token: string, @Param('lang') lang: string): Promise<any> {
    return await this.authService.verifyEmail(token, lang);
  }

  @Post('resend-verification')
  @UsePipes(new JoiValidationPipe({
    param: {
      lang: LanguageSchema,
    }
  }))
  @UseGuards(AuthGuard())
  async resendVerification(@User() user: UserDocument, @Param('lang') lang: string): Promise<any> {
    return await this.authService.resendVerificationEmail(user._id.toString(), lang);
  }

  @Post('change-password')
  @UsePipes(new JoiValidationPipe({
    body: UpdatePasswordSchema,
    param: {
      lang: LanguageSchema,
    }
  }))
  @UseGuards(AuthGuard())
  async add(@Body() data: UpdatePasswordDTO, @User() creator: UserDocument, @Param('lang') lang: string): Promise<any> {
    return await this.authService.changePassword(data, creator, lang);
  }

  @Post('logout')
  @UsePipes(new JoiValidationPipe({
    param: {
      lang: LanguageSchema,
    }
  }))
  @UseGuards(AuthGuard())
  async logout(@Param('lang') lang: string): Promise<any> {
    return {
      message: lang === 'en'
        ? 'Logged out successfully'
        : lang === 'ar'
          ? 'تم تسجيل الخروج بنجاح'
          : 'Logged out successfully',
      success: true
    };
  }
}
