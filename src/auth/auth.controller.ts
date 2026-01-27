import {
  Controller,
  Post,
  Body,
  UsePipes,
  Get,
  Param,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';

import { Scopes, User } from '../decorators';

import { JoiValidationPipe } from '../pipes';
import {
  UpdatePasswordDTO,
  UpdatePasswordSchema,
  SignInDTO,
  SignInSchema,
  SignUpSchema,
  SignUpDTO,
  LanguageSchema,
  EmailSchema,
} from '../dtos';
import { UserDocument } from 'src/schema';

@ApiTags('auth')
@ApiBearerAuth()
@Controller(':lang/auth')
export class AuthController {
  constructor(private authService: AuthService) {}
  @Post('signup')
  @ApiOperation({ summary: 'Create a new user account' })
  @ApiResponse({ status: 201, description: 'User registered successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input or user already exists' })
  @UsePipes(
    new JoiValidationPipe({
      body: SignUpSchema,
      param: {
        lang: LanguageSchema,
      },
    }),
  )
  async signup(
    @Body() user: SignUpDTO,
    @Param('lang') lang: string,
  ): Promise<any> {
    return await this.authService.signup(user, lang);
  }

  @Post('signin')
  @ApiOperation({ summary: 'Sign in to an existing account' })
  @ApiResponse({ status: 200, description: 'User signed in successfully, returns JWT token' })
  @ApiResponse({ status: 400, description: 'Invalid credentials' })
  @ApiResponse({ status: 401, description: 'Authentication failed' })
  @UsePipes(
    new JoiValidationPipe({
      body: SignInSchema,
      param: {
        lang: LanguageSchema,
      },
    }),
  )
  async signIn(
    @Body() user: SignInDTO,
    @Param('lang') lang: string,
  ): Promise<any> {
    return await this.authService.signin(user, lang);
  }

  @Get('forgot-password/:email')
  @ApiOperation({ summary: 'Request password reset email' })
  @ApiResponse({ status: 200, description: 'Password reset email sent successfully' })
  @ApiResponse({ status: 400, description: 'Invalid email address' })
  @UsePipes(
    new JoiValidationPipe({
      param: {
        email: EmailSchema,
        lang: LanguageSchema,
      },
    }),
  )
  async forgetPassword(
    @Param('email') email: string,
    @Param('lang') lang: string,
  ) {
    return await this.authService.forgetPassword(email, lang);
  }

  @Post('reset-password')
  @ApiOperation({ summary: 'Reset password using token from email' })
  @ApiResponse({ status: 200, description: 'Password reset successfully' })
  @ApiResponse({ status: 400, description: 'Invalid or expired token' })
  @UsePipes(
    new JoiValidationPipe({
      param: {
        lang: LanguageSchema,
      },
    }),
  )
  async resetPassword(
    @Body() data: { token: string; newPassword: string },
    @Param('lang') lang: string,
  ): Promise<any> {
    return await this.authService.resetPasswordWithToken(
      data.token,
      data.newPassword,
      lang,
    );
  }

  @Get('verify-email/:token')
  @ApiOperation({ summary: 'Verify email address with token' })
  @ApiResponse({ status: 200, description: 'Email verified successfully' })
  @ApiResponse({ status: 400, description: 'Invalid or expired verification token' })
  @UsePipes(
    new JoiValidationPipe({
      param: {
        lang: LanguageSchema,
      },
    }),
  )
  async verifyEmail(
    @Param('token') token: string,
    @Param('lang') lang: string,
  ): Promise<any> {
    return await this.authService.verifyEmail(token, lang);
  }

  @Post('resend-verification')
  @ApiOperation({ summary: 'Resend email verification link' })
  @ApiResponse({ status: 200, description: 'Verification email sent successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized - authentication required' })
  @UsePipes(
    new JoiValidationPipe({
      param: {
        lang: LanguageSchema,
      },
    }),
  )
  @UseGuards(AuthGuard())
  async resendVerification(
    @User() user: UserDocument,
    @Param('lang') lang: string,
  ): Promise<any> {
    return await this.authService.resendVerificationEmail(
      user._id.toString(),
      lang,
    );
  }

  @Post('change-password')
  @ApiOperation({ summary: 'Change password for authenticated user' })
  @ApiResponse({ status: 200, description: 'Password changed successfully' })
  @ApiResponse({ status: 400, description: 'Invalid password or validation failed' })
  @ApiResponse({ status: 401, description: 'Unauthorized - authentication required' })
  @UsePipes(
    new JoiValidationPipe({
      body: UpdatePasswordSchema,
      param: {
        lang: LanguageSchema,
      },
    }),
  )
  @UseGuards(AuthGuard())
  async add(
    @Body() data: UpdatePasswordDTO,
    @User() creator: UserDocument,
    @Param('lang') lang: string,
  ): Promise<any> {
    return await this.authService.changePassword(data, creator, lang);
  }

  @Post('logout')
  @ApiOperation({ summary: 'Logout authenticated user' })
  @ApiResponse({ status: 200, description: 'Logged out successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized - authentication required' })
  @UsePipes(
    new JoiValidationPipe({
      param: {
        lang: LanguageSchema,
      },
    }),
  )
  @UseGuards(AuthGuard())
  async logout(@Param('lang') lang: string): Promise<any> {
    return {
      message:
        lang === 'en'
          ? 'Logged out successfully'
          : lang === 'ar'
          ? 'تم تسجيل الخروج بنجاح'
          : 'Logged out successfully',
      success: true,
    };
  }
}
