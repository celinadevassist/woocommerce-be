import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { Transporter } from 'nodemailer';
import * as fs from 'fs';
import * as path from 'path';
import * as handlebars from 'handlebars';

export interface EmailOptions {
  to: string | string[];
  subject: string;
  template?: string;
  context?: any;
  text?: string;
  html?: string;
  attachments?: any[];
  from?: string;
  replyTo?: string;
  cc?: string | string[];
  bcc?: string | string[];
  // Email tracking
  tracking?: {
    trackingId?: string; // Optional pre-existing tracking ID (skip creation if provided)
    emailType:
      | 'registration_confirmation'
      | 'payment_pending'
      | 'payment_reminder'
      | 'payment_confirmed'
      | 'zoom_reminder';
    userId?: string;
    registrationId?: string;
    sessionId?: string;
    metadata?: any;
  };
}

@Injectable()
export class MailerService {
  private transporter: Transporter;
  private readonly logger = new Logger(MailerService.name);
  private readonly templatesPath: string;

  constructor(private configService: ConfigService) {
    // Set templates path based on environment
    const isDevelopment =
      this.configService.get<string>('NODE_ENV') === 'development';
    if (isDevelopment) {
      this.templatesPath = path.join(process.cwd(), 'src/templates/emails');
    } else {
      // In production: __dirname is /app/dist/services/, templates are at /app/dist/templates/emails/
      this.templatesPath = path.join(__dirname, '../templates/emails');
    }

    this.initializeTransporter();
  }

  private initializeTransporter() {
    const smtpConfig = {
      host: this.configService.get<string>('SMTP_HOST'),
      port: this.configService.get<number>('SMTP_PORT', 587),
      secure: this.configService.get<boolean>('SMTP_SECURE', false),
      auth: {
        user: this.configService.get<string>('SMTP_USER'),
        pass: this.configService.get<string>('SMTP_PASSWORD'),
      },
      tls: {
        rejectUnauthorized: false,
      },
    };

    this.transporter = nodemailer.createTransport(smtpConfig);

    this.verifyConnection();
  }

  private async verifyConnection() {
    try {
      await this.transporter.verify();
      this.logger.log('SMTP connection verified successfully');
    } catch (error) {
      this.logger.error('SMTP connection failed:', error);
    }
  }

  async sendMail(options: EmailOptions): Promise<boolean> {
    try {
      this.logger.log('\n🚀 [MAILER SERVICE] Starting email send process');
      this.logger.log('='.repeat(60));

      const from =
        options.from ||
        `${this.configService.get('EMAIL_FROM_NAME')} <${this.configService.get(
          'EMAIL_FROM',
        )}>`;

      this.logger.log('📧 [STEP 1] Email Configuration:');
      this.logger.log(
        `   To: ${
          Array.isArray(options.to) ? options.to.join(', ') : options.to
        }`,
      );
      this.logger.log(`   From: ${from}`);
      this.logger.log(`   Subject: ${options.subject}`);
      this.logger.log(`   Template: ${options.template || 'No template'}`);

      let html = options.html;

      if (options.template && !html) {
        this.logger.log('\n📝 [STEP 2] Rendering Template:');
        this.logger.log(`   Template Name: ${options.template}`);
        html = await this.renderTemplate(options.template, options.context);
        this.logger.log(
          `   ✅ Template rendered (${(html.length / 1024).toFixed(2)} KB)`,
        );
      }

      // Email tracking - use existing tracking ID or create new one
      let trackingId: string = null;
      if (options.tracking && html) {
        try {
          // Use pre-existing tracking ID if provided, otherwise create new one
          if (options.tracking.trackingId) {
            trackingId = options.tracking.trackingId;
            this.logger.log(`   📊 Using existing tracking ID: ${trackingId}`);
          } else {
            const recipientEmail = Array.isArray(options.to)
              ? options.to[0]
              : options.to;

            this.logger.log(`   📊 Created new tracking ID: ${trackingId}`);
          }

          if (trackingId) {
            const backendUrl = this.configService.get(
              'BACKEND_URL',
              'http://localhost:3041',
            );
            const trackingPixelUrl = `${backendUrl}/api/email-tracking/pixel/${trackingId}`;
            const trackingPixel = `<img src="${trackingPixelUrl}" width="1" height="1" style="display:none;" alt="" />`;

            // Embed tracking pixel at the end of HTML body
            if (html.includes('</body>')) {
              html = html.replace('</body>', `${trackingPixel}</body>`);
            } else {
              html += trackingPixel;
            }

            this.logger.log(`   📊 Tracking pixel embedded`);
          }
        } catch (trackingError) {
          this.logger.warn(`   ⚠️  Tracking failed: ${trackingError.message}`);
          // Don't block email sending if tracking fails
        }
      }

      const mailOptions = {
        from,
        to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
        subject: options.subject,
        text: options.text,
        html,
        attachments: options.attachments,
        replyTo: options.replyTo,
        cc: options.cc,
        bcc: options.bcc,
      };

      this.logger.log('\n🌐 [STEP 3] SMTP Configuration:');
      this.logger.log(`   Host: ${this.configService.get('SMTP_HOST')}`);
      this.logger.log(`   Port: ${this.configService.get('SMTP_PORT')}`);
      this.logger.log(`   Secure: ${this.configService.get('SMTP_SECURE')}`);
      this.logger.log(`   User: ${this.configService.get('SMTP_USER')}`);
      this.logger.log(
        `   Password: ${
          this.configService.get('SMTP_PASSWORD') ? '***SET***' : '❌ NOT SET'
        }`,
      );

      this.logger.log('\n📤 [STEP 4] Sending Email...');
      const startTime = Date.now();
      const result = await this.transporter.sendMail(mailOptions);
      const requestTime = Date.now() - startTime;

      this.logger.log('\n📨 [STEP 5] Email Sent Successfully:');
      this.logger.log(`   Message ID: ${result.messageId}`);
      this.logger.log(`   Response: ${result.response}`);
      this.logger.log(`   Time: ${requestTime}ms`);
      this.logger.log('='.repeat(60));
      this.logger.log('✅ EMAIL SENT SUCCESSFULLY!');
      this.logger.log('='.repeat(60));
      return { success: true, trackingId } as any;
    } catch (error) {
      this.logger.error('\n🚨 [ERROR] Email sending failed!');
      this.logger.error('='.repeat(60));
      this.logger.error(`❌ Error Message: ${error.message}`);
      this.logger.error(`   Error Code: ${error.code || 'none'}`);
      this.logger.error(`   Error Command: ${error.command || 'none'}`);

      if (error.code === 'ECONNREFUSED') {
        this.logger.error(
          '   🔌 CONNECTION REFUSED: Cannot connect to SMTP server',
        );
        this.logger.error('   Check: SMTP_HOST and SMTP_PORT are correct');
      } else if (error.code === 'EAUTH') {
        this.logger.error('   🔒 AUTHENTICATION FAILED: Invalid credentials');
        this.logger.error('   Check: SMTP_USER and SMTP_PASSWORD');
      } else if (error.code === 'ETIMEDOUT') {
        this.logger.error(
          '   ⏰ CONNECTION TIMEOUT: SMTP server not responding',
        );
        this.logger.error('   Check: Firewall, network connectivity');
      }

      this.logger.error(`   Full Stack: ${error.stack}`);
      this.logger.error('='.repeat(60));
      return false;
    }
  }

  private async renderTemplate(
    templateName: string,
    context: any,
  ): Promise<string> {
    try {
      const templatePath = path.join(this.templatesPath, `${templateName}.hbs`);
      const templateContent = fs.readFileSync(templatePath, 'utf-8');
      const template = handlebars.compile(templateContent);
      return template(context);
    } catch (error) {
      this.logger.error(`Failed to render template ${templateName}:`, error);
      throw error;
    }
  }

  async sendVerificationEmail(
    email: string,
    token: string,
    userName?: string,
  ): Promise<boolean> {
    const verificationUrl = `${this.configService.get(
      'EMAIL_VERIFICATION_URL',
    )}?token=${token}`;
    const appName = this.configService.get('APP_NAME', 'BrandBanda');

    return this.sendMail({
      to: email,
      subject: `Verify Your Email - ${appName}`,
      template: 'email-verification',
      context: {
        userName: userName || 'User',
        verificationUrl,
        appName,
      },
    });
  }

  async sendPasswordResetEmail(
    email: string,
    token: string,
    userName?: string,
  ): Promise<boolean> {
    const resetUrl = `${this.configService.get(
      'PASSWORD_RESET_URL',
    )}?token=${token}`;
    const appName = this.configService.get('APP_NAME', 'BrandBanda');

    return this.sendMail({
      to: email,
      subject: `Reset Your Password - ${appName}`,
      template: 'password-reset',
      context: {
        userName: userName || 'User',
        resetUrl,
        appName,
        expiresIn: '1 hour',
      },
    });
  }

  async sendWelcomeEmail(email: string, userName: string): Promise<boolean> {
    const appName = this.configService.get('APP_NAME', 'BrandBanda');

    return this.sendMail({
      to: email,
      subject: `Welcome to ${appName}!`,
      template: 'welcome',
      context: {
        userName,
        appName,
        loginUrl: this.configService.get('APP_URL'),
      },
    });
  }

  async sendInvoiceEmail(email: string, invoiceData: any): Promise<boolean> {
    const appName = this.configService.get('APP_NAME', 'BrandBanda');

    return this.sendMail({
      to: email,
      subject: `Invoice #${invoiceData.invoiceNumber} - ${appName}`,
      template: 'invoice',
      context: {
        ...invoiceData,
        appName,
      },
      attachments: invoiceData.attachments || [],
    });
  }

  async sendSubscriptionEmail(
    email: string,
    subscriptionData: any,
  ): Promise<boolean> {
    const appName = this.configService.get('APP_NAME', 'BrandBanda');

    return this.sendMail({
      to: email,
      subject: `Subscription ${subscriptionData.type} - ${appName}`,
      template: 'subscription',
      context: {
        ...subscriptionData,
        appName,
      },
    });
  }

  async sendProjectInvitationEmail(
    email: string,
    invitationData: any,
  ): Promise<boolean> {
    const appName = this.configService.get('APP_NAME', 'BrandBanda');

    return this.sendMail({
      to: email,
      subject: `You've been invited to join ${invitationData.projectName}`,
      template: 'project-invitation',
      context: {
        ...invitationData,
        appName,
      },
    });
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.transporter.verify();
      return true;
    } catch (error) {
      this.logger.error('SMTP test failed:', error);
      return false;
    }
  }

  /**
   * Send free session registration confirmation email
   */
  async sendFreeSessionRegistrationEmail(
    email: string,
    registrationData: {
      firstName: string;
      lastName: string;
      sessionTitle: string;
      sessionType?: string;
      estimatedDuration?: number;
      instructor?: string;
      level?: string;
      agenda?: Array<{ topic: string; description: string }>;
      lang?: string;
      registrationId?: string;
      sessionId?: string;
      userId?: string;
    },
  ): Promise<boolean> {
    const frontendUrl = this.configService.get(
      'FRONTEND_URL',
      'http://localhost:5173',
    );
    const supportEmail = this.configService.get(
      'SUPPORT_EMAIL',
      'support@2zpoint.com',
    );

    return this.sendMail({
      to: email,
      subject: `Registration Confirmed - ${registrationData.sessionTitle}`,
      template: 'session-registration-free',
      context: {
        ...registrationData,
        supportEmail,
        frontendUrl,
      },
      tracking: registrationData.registrationId
        ? {
            emailType: 'registration_confirmation',
            userId: registrationData.userId,
            registrationId: registrationData.registrationId,
            sessionId: registrationData.sessionId,
            metadata: {
              sessionTitle: registrationData.sessionTitle,
            },
          }
        : undefined,
    });
  }

  /**
   * Send paid session registration email (pending payment)
   */
  async sendPaidSessionPendingEmail(
    email: string,
    registrationData: {
      firstName: string;
      lastName: string;
      sessionTitle: string;
      price: number;
      currency: string;
      validityPeriodDays?: number;
      estimatedDuration?: number;
      agenda?: Array<{ topic: string; description: string }>;
      lang?: string;
      registrationId: string;
      sessionId?: string;
      userId?: string;
    },
  ): Promise<boolean> {
    const frontendUrl = this.configService.get(
      'FRONTEND_URL',
      'http://localhost:5173',
    );
    const supportEmail = this.configService.get(
      'SUPPORT_EMAIL',
      'support@2zpoint.com',
    );
    const paymentPageUrl = `${frontendUrl}/payment-options?registrationId=${registrationData.registrationId}`;
    const whatsappMessage = encodeURIComponent(
      `Hi, I want to complete payment for ${registrationData.sessionTitle}. Registration ID: ${registrationData.registrationId}`,
    );

    return this.sendMail({
      to: email,
      subject: `Complete Your Payment - ${registrationData.sessionTitle}`,
      template: 'session-registration-paid-pending',
      context: {
        ...registrationData,
        supportEmail,
        frontendUrl,
        paymentPageUrl,
        whatsappMessage,
      },
      tracking: {
        emailType: 'payment_pending',
        userId: registrationData.userId,
        registrationId: registrationData.registrationId,
        sessionId: registrationData.sessionId,
        metadata: {
          sessionTitle: registrationData.sessionTitle,
          price: registrationData.price,
          currency: registrationData.currency,
        },
      },
    });
  }

  /**
   * Send payment reminder email
   */
  async sendPaymentReminderEmail(
    email: string,
    reminderData: {
      firstName: string;
      sessionTitle: string;
      price: number;
      currency: string;
      validityPeriodDays?: number;
      agenda?: Array<{ topic: string; description: string }>;
      lang?: string;
      registrationId: string;
      sessionId?: string;
      userId?: string;
    },
  ): Promise<boolean> {
    const frontendUrl = this.configService.get(
      'FRONTEND_URL',
      'http://localhost:5173',
    );
    const supportEmail = this.configService.get(
      'SUPPORT_EMAIL',
      'support@2zpoint.com',
    );
    const paymentPageUrl = `${frontendUrl}/payment-options?registrationId=${reminderData.registrationId}`;
    const whatsappMessage = encodeURIComponent(
      `Hi, I want to complete payment for ${reminderData.sessionTitle}. Registration ID: ${reminderData.registrationId}`,
    );

    return this.sendMail({
      to: email,
      subject: `Payment Reminder - ${reminderData.sessionTitle}`,
      template: 'session-payment-reminder',
      context: {
        ...reminderData,
        supportEmail,
        frontendUrl,
        paymentPageUrl,
        whatsappMessage,
      },
      tracking: {
        emailType: 'payment_reminder',
        userId: reminderData.userId,
        registrationId: reminderData.registrationId,
        sessionId: reminderData.sessionId,
        metadata: {
          sessionTitle: reminderData.sessionTitle,
          price: reminderData.price,
          currency: reminderData.currency,
        },
      },
    });
  }

  /**
   * Send Zoom session reminder email with tracking
   */
  async sendZoomReminderEmail(
    email: string,
    reminderData: {
      topic: string;
      description?: string;
      meetingDate: string;
      startTime: string;
      duration: number;
      timeZone: string;
      agenda?: string[];
      zoomLink: string;
      passcode?: string;
      reminderType: string;
      timeUntil: string;
      lang?: string;
      // Optional tracking data
      userId?: string;
      registrationId?: string;
      sessionId?: string;
      meetingId?: string;
      notificationType?: string;
    },
  ): Promise<{ success: boolean; trackingId?: string }> {
    const supportEmail = this.configService.get(
      'SUPPORT_EMAIL',
      'support@2zpoint.com',
    );

    // Create tracking ID before sending email
    const trackingId: string = null;
    try {
    } catch (error) {
      this.logger.error(
        `Failed to create email tracking for ${email}: ${error.message}`,
      );
    }

    // Pass the pre-created tracking ID to sendMail
    const result = await this.sendMail({
      to: email,
      subject: `${reminderData.reminderType}: ${reminderData.topic}`,
      template: 'zoom-session-reminder',
      context: {
        ...reminderData,
        supportEmail,
      },
      tracking: trackingId
        ? {
            trackingId, // Use pre-created tracking ID
            emailType: 'zoom_reminder',
            userId: reminderData.userId,
            registrationId: reminderData.registrationId,
            sessionId: reminderData.sessionId,
            metadata: {
              topic: reminderData.topic,
              meetingDate: reminderData.meetingDate,
              reminderType: reminderData.reminderType,
              meetingId: reminderData.meetingId,
              notificationType: reminderData.notificationType,
            },
          }
        : undefined,
    });

    return { success: result, trackingId };
  }

  /**
   * Send payment confirmation email
   */
  async sendPaymentConfirmedEmail(
    email: string,
    confirmationData: {
      firstName: string;
      lastName: string;
      sessionTitle: string;
      amountPaid: number;
      currency: string;
      paymentTransactionId?: string;
      paidAt: string;
      validityPeriodDays?: number;
      estimatedDuration?: number;
      sessionType?: string;
      instructor?: string;
      level?: string;
      agenda?: Array<{ topic: string; description: string }>;
      lang?: string;
      registrationId?: string;
      sessionId?: string;
      userId?: string;
    },
  ): Promise<boolean> {
    const frontendUrl = this.configService.get(
      'FRONTEND_URL',
      'http://localhost:5173',
    );
    const supportEmail = this.configService.get(
      'SUPPORT_EMAIL',
      'support@2zpoint.com',
    );

    return this.sendMail({
      to: email,
      subject: `Payment Confirmed - ${confirmationData.sessionTitle}`,
      template: 'session-payment-confirmed',
      context: {
        ...confirmationData,
        supportEmail,
        frontendUrl,
      },
      tracking: confirmationData.registrationId
        ? {
            emailType: 'payment_confirmed',
            userId: confirmationData.userId,
            registrationId: confirmationData.registrationId,
            sessionId: confirmationData.sessionId,
            metadata: {
              sessionTitle: confirmationData.sessionTitle,
              amountPaid: confirmationData.amountPaid,
              currency: confirmationData.currency,
              paymentTransactionId: confirmationData.paymentTransactionId,
            },
          }
        : undefined,
    });
  }
}
