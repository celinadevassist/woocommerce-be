import { Controller, Post, Body, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { MailerService } from './mailer.service';
import { User } from '../decorators';
import { UserDocument } from '../schema';

@ApiTags('email-test')
@ApiBearerAuth()
@Controller('email-test')
export class EmailTestController {
  constructor(private mailerService: MailerService) {}

  @Get('test-connection')
  @ApiOperation({ summary: 'Test SMTP connection' })
  @UseGuards(AuthGuard())
  async testConnection(): Promise<{ success: boolean; message: string }> {
    const success = await this.mailerService.testConnection();
    return {
      success,
      message: success
        ? 'SMTP connection successful'
        : 'SMTP connection failed',
    };
  }

  @Post('send-test')
  @ApiOperation({ summary: 'Send test email' })
  @UseGuards(AuthGuard())
  async sendTestEmail(
    @User() user: UserDocument,
    @Body() data: { to?: string },
  ): Promise<{ success: boolean; message: string }> {
    const to = data.to || user.email;

    try {
      const success = await this.mailerService.sendMail({
        to,
        subject: 'Test Email from 2ZPoint',
        text: 'This is a test email to verify your email configuration.',
        html: `
          <h2>Test Email</h2>
          <p>This is a test email from 2ZPoint to verify your email configuration.</p>
          <p>If you received this email, your MXrouting SMTP setup is working correctly!</p>
          <hr>
          <p>Sent at: ${new Date().toISOString()}</p>
        `,
      });

      return {
        success,
        message: success
          ? `Test email sent to ${to}`
          : 'Failed to send test email',
      };
    } catch (error) {
      return {
        success: false,
        message: `Error: ${error.message}`,
      };
    }
  }

  @Post('test-verification')
  @ApiOperation({ summary: 'Send test verification email' })
  @UseGuards(AuthGuard())
  async sendTestVerification(
    @User() user: UserDocument,
  ): Promise<{ success: boolean; message: string }> {
    try {
      const success = await this.mailerService.sendVerificationEmail(
        user.email,
        'test-token-123456',
        user.firstName || user.email,
      );

      return {
        success,
        message: success
          ? 'Verification email sent'
          : 'Failed to send verification email',
      };
    } catch (error) {
      return {
        success: false,
        message: `Error: ${error.message}`,
      };
    }
  }

  @Post('test-password-reset')
  @ApiOperation({ summary: 'Send test password reset email' })
  @UseGuards(AuthGuard())
  async sendTestPasswordReset(
    @User() user: UserDocument,
  ): Promise<{ success: boolean; message: string }> {
    try {
      const success = await this.mailerService.sendPasswordResetEmail(
        user.email,
        'test-reset-token-123456',
        user.firstName || user.email,
      );

      return {
        success,
        message: success
          ? 'Password reset email sent'
          : 'Failed to send password reset email',
      };
    } catch (error) {
      return {
        success: false,
        message: `Error: ${error.message}`,
      };
    }
  }

  @Post('test-invoice')
  @ApiOperation({ summary: 'Send test invoice email' })
  @UseGuards(AuthGuard())
  async sendTestInvoice(
    @User() user: UserDocument,
  ): Promise<{ success: boolean; message: string }> {
    try {
      const testInvoiceData = {
        invoiceNumber: 'INV-TEST-001',
        invoiceDate: new Date().toLocaleDateString(),
        dueDate: new Date(
          Date.now() + 7 * 24 * 60 * 60 * 1000,
        ).toLocaleDateString(),
        customerName: user.firstName || user.email,
        customerEmail: user.email,
        items: [
          {
            description: 'Test Service',
            quantity: 1,
            unitPrice: 100,
            amount: 100,
            currency: 'USD',
          },
        ],
        currency: 'USD',
        subtotal: 100,
        tax: 5,
        taxRate: 5,
        total: 105,
        status: 'pending',
      };

      const success = await this.mailerService.sendInvoiceEmail(
        user.email,
        testInvoiceData,
      );

      return {
        success,
        message: success
          ? 'Invoice email sent'
          : 'Failed to send invoice email',
      };
    } catch (error) {
      return {
        success: false,
        message: `Error: ${error.message}`,
      };
    }
  }
}
