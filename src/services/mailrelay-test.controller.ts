import { Controller, Post, Body, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { MailrelayService } from './mailrelay.service';
import { User } from '../decorators';
import { UserDocument } from '../schema';

@ApiTags('mailrelay-test')
@ApiBearerAuth()
@Controller('mailrelay-test')
export class MailrelayTestController {
  constructor(private mailrelayService: MailrelayService) {}

  @Get('test-connection')
  @ApiOperation({ summary: 'Test Mailrelay API connection' })
  @UseGuards(AuthGuard())
  async testConnection(): Promise<{ success: boolean; message: string }> {
    const success = await this.mailrelayService.testConnection();
    return {
      success,
      message: success
        ? 'Mailrelay API connection successful'
        : 'Mailrelay API connection failed',
    };
  }

  @Post('send-test')
  @ApiOperation({ summary: 'Send test email via Mailrelay' })
  @UseGuards(AuthGuard())
  async sendTestEmail(
    @User() user: UserDocument,
    @Body() data: { to?: string; tags?: string[] },
  ): Promise<{ success: boolean; message: string }> {
    const to = data.to || user.email;

    try {
      const success = await this.mailrelayService.sendMail({
        to,
        subject: 'Test Email from 2ZPoint via Mailrelay',
        text: 'This is a test email to verify your Mailrelay configuration.',
        html: `
          <h2>Test Email via Mailrelay</h2>
          <p>This is a test email from 2ZPoint to verify your Mailrelay.com configuration.</p>
          <p>If you received this email, your Mailrelay API setup is working correctly!</p>
          <hr>
          <p><strong>Sent at:</strong> ${new Date().toISOString()}</p>
          <p><strong>Service:</strong> Mailrelay.com API</p>
        `,
        tags: data.tags || ['test', 'mailrelay'],
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
  @ApiOperation({ summary: 'Send test verification email via Mailrelay' })
  @UseGuards(AuthGuard())
  async sendTestVerification(
    @User() user: UserDocument,
  ): Promise<{ success: boolean; message: string }> {
    try {
      const success = await this.mailrelayService.sendVerificationEmail(
        user.email,
        'test-token-123456',
        user.firstName || user.email,
      );

      return {
        success,
        message: success
          ? 'Verification email sent via Mailrelay'
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
  @ApiOperation({ summary: 'Send test password reset email via Mailrelay' })
  @UseGuards(AuthGuard())
  async sendTestPasswordReset(
    @User() user: UserDocument,
  ): Promise<{ success: boolean; message: string }> {
    try {
      const success = await this.mailrelayService.sendPasswordResetEmail(
        user.email,
        'test-reset-token-123456',
        user.firstName || user.email,
      );

      return {
        success,
        message: success
          ? 'Password reset email sent via Mailrelay'
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
  @ApiOperation({ summary: 'Send test invoice email via Mailrelay' })
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

      const success = await this.mailrelayService.sendInvoiceEmail(
        user.email,
        testInvoiceData,
      );

      return {
        success,
        message: success
          ? 'Invoice email sent via Mailrelay'
          : 'Failed to send invoice email',
      };
    } catch (error) {
      return {
        success: false,
        message: `Error: ${error.message}`,
      };
    }
  }

  @Post('test-with-attachment')
  @ApiOperation({ summary: 'Send test email with attachment via Mailrelay' })
  @UseGuards(AuthGuard())
  async sendTestWithAttachment(
    @User() user: UserDocument,
  ): Promise<{ success: boolean; message: string }> {
    try {
      // Create a simple text attachment
      const textContent = Buffer.from(
        'This is a test attachment content',
        'utf-8',
      ).toString('base64');

      const success = await this.mailrelayService.sendMail({
        to: user.email,
        subject: 'Test Email with Attachment via Mailrelay',
        html: `
          <h2>Test Email with Attachment</h2>
          <p>This email includes a test attachment sent via Mailrelay API.</p>
          <p>Please check if you received the attachment correctly.</p>
        `,
        attachments: [
          {
            content: textContent,
            filename: 'test-attachment.txt',
            contentType: 'text/plain',
          },
        ],
        tags: ['test', 'attachment', 'mailrelay'],
      });

      return {
        success,
        message: success
          ? 'Email with attachment sent via Mailrelay'
          : 'Failed to send email with attachment',
      };
    } catch (error) {
      return {
        success: false,
        message: `Error: ${error.message}`,
      };
    }
  }
}
