import { Injectable, InternalServerErrorException, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { LoggerService } from '../logger/logger.service';
import { MetadataService } from '../common_metadata_module/service';
import { ModuleType } from '../common_metadata_module/enum';
import { MailerService } from './mailer.service';

export interface EmailData {
  recipients: string | string[];
  subject: string;
  content: string;
  sender?: string;
  contentType?: 'text' | 'html';
  attachments?: any[];
}

export interface EmailProvider {
  name: string;
  handler: (data: EmailData, credentials: any) => Promise<any>;
  this: EmailService;
}

@Injectable()
export class EmailService {
  emailProviders: EmailProvider[] = [];
  logger: LoggerService;

  constructor(
    logger: LoggerService,
    @Inject(forwardRef(() => MetadataService)) private readonly metadataService: MetadataService,
    private readonly mailerService: MailerService,
    private readonly configService: ConfigService,
  ) {
    this.logger = logger;

    this.emailProviders = [
      { name: 'ERPNext Email', handler: this.sendEmail_ERPNext, this: this },
      // Add more providers here as needed
      // { name: 'SendGrid', handler: this.sendEmail_SendGrid, this: this },
      // { name: 'Mailgun', handler: this.sendEmail_Mailgun, this: this },
    ];
  }

  // Legacy method for backward compatibility
  async sendEmail(to: string, subject: string, content: string): Promise<{ message: string }> {
    const emailData: EmailData = {
      recipients: to,
      subject: subject,
      content: content,
      contentType: 'text'
    };

    // For backward compatibility, we'll try to send without userId first
    // This will only work if there are environment-based credentials
    const success = await this.sendEmailWithProviders(emailData);
    
    if (success) {
      return { message: 'Your New PW send to your registered E-mail' };
    } else {
      return { message: "Failed To Send" };
    }
  }

  // New method with provider support
  async sendEmailWithProviders(data: EmailData, userId?: string): Promise<boolean> {
    for (const provider of this.emailProviders) {
      try {
        // Get credentials from metadata for this provider
        const credentials = await this.getProviderCredentials(provider.name, userId);
        if (!credentials) {
          this.logger.error(`No credentials found for ${provider.name}`, 'EmailService');
          continue;
        }

        const response = await provider.handler.call(provider.this, data, credentials);
        if (response === true) {
          this.logger.log(`Email sent successfully via ${provider.name}`, 'EmailService');
          return true;
        } else {
          this.logger.error(`${provider.name} -> ${JSON.stringify(response)}`, 'EmailService');
        }
      } catch (e) {
        this.logger.error(`${provider.name} -> ${JSON.stringify(e)}`, 'EmailService');
      }
    }
    return false;
  }

  private async getProviderCredentials(providerName: string, userId?: string): Promise<any> {
    try {
      if (!userId) {
        this.logger.error('UserId is required to fetch email provider credentials', 'EmailService');
        return null;
      }

      const metadata = await this.metadataService.findByUserAndModule(userId, ModuleType.EMAIL_MARKETING);
      if (!metadata || !metadata.meta) {
        this.logger.error(`No email marketing metadata found for user ${userId}`, 'EmailService');
        return null;
      }

      // Look for provider-specific credentials in meta object
      const providerKey = providerName.toLowerCase().replace(/\s+/g, '_');
      return metadata.meta[providerKey] || metadata.meta.default_provider || null;
    } catch (error) {
      this.logger.error(`Error fetching credentials for ${providerName}: ${JSON.stringify(error)}`, 'EmailService');
      return null;
    }
  }

  async sendEmail_ERPNext(data: EmailData, credentials: any): Promise<any> {
    try {
      if (!credentials.baseUrl || !credentials.token) {
        return 'ERPNext credentials missing baseUrl or token';
      }

      // Convert recipients to string if it's an array
      const recipients = Array.isArray(data.recipients) 
        ? data.recipients.join(', ') 
        : data.recipients;

      const payload = {
        recipients: recipients,
        subject: data.subject,
        content: data.content,
        communication_doctype: credentials.communication_doctype || "User",
        communication_name: credentials.communication_name || "Administrator",
        send_email: true,
        content_type: data.contentType || "text",
        sender: data.sender || credentials.default_sender || recipients,
        communication_medium: "Email"
      };

      const response = await axios.post(
        `${credentials.baseUrl}/api/method/frappe.core.doctype.communication.email.make`,
        payload,
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `token ${credentials.token}`,
          },
          timeout: 30000, // 30 seconds timeout
        }
      );

      // Check ERPNext response format
      if (response.data && response.data.message) {
        // ERPNext typically returns success in the message field
        if (response.data.message.name || response.status === 200) {
          return true;
        } else {
          return `ERPNext -> Unexpected response: ${JSON.stringify(response.data)}`;
        }
      } else if (response.status === 200) {
        return true;
      } else {
        return `ERPNext -> HTTP ${response.status}: ${response.statusText}`;
      }
    } catch (error) {
      if (error.response) {
        return `ERPNext -> HTTP ${error.response.status}: ${JSON.stringify(error.response.data)}`;
      } else if (error.request) {
        return `ERPNext -> Network error: ${error.message}`;
      } else {
        return `ERPNext -> Error: ${error.message}`;
      }
    }
  }

  // Template for additional providers
  async sendEmail_SendGrid(data: EmailData, credentials: any): Promise<any> {
    try {
      // Implementation for SendGrid
      // This is a placeholder - implement according to SendGrid API
      if (!credentials.apiKey) {
        return 'SendGrid credentials missing apiKey';
      }

      // SendGrid implementation would go here
      return 'SendGrid provider not implemented yet';
    } catch (error) {
      return `SendGrid -> Error: ${error.message}`;
    }
  }

  async sendEmail_Mailgun(data: EmailData, credentials: any): Promise<any> {
    try {
      // Implementation for Mailgun
      // This is a placeholder - implement according to Mailgun API
      if (!credentials.apiKey || !credentials.domain) {
        return 'Mailgun credentials missing apiKey or domain';
      }

      // Mailgun implementation would go here
      return 'Mailgun provider not implemented yet';
    } catch (error) {
      return `Mailgun -> Error: ${error.message}`;
    }
  }

  // Utility method to test provider connectivity
  async testProvider(providerName: string, userId: string): Promise<{ success: boolean; message: string }> {
    try {
      const credentials = await this.getProviderCredentials(providerName, userId);
      if (!credentials) {
        return { success: false, message: `No credentials found for ${providerName}` };
      }

      // Send a test email
      const testData: EmailData = {
        recipients: credentials.test_email || 'test@example.com',
        subject: `Test Email from ${providerName}`,
        content: `This is a test email sent via ${providerName} provider at ${new Date().toISOString()}`,
        contentType: 'text'
      };

      const result = await this.sendEmailWithProviders(testData, userId);
      return {
        success: result,
        message: result ? `Test email sent successfully via ${providerName}` : `Failed to send test email via ${providerName}`
      };
    } catch (error) {
      return {
        success: false,
        message: `Error testing ${providerName}: ${error.message}`
      };
    }
  }

  // Get available providers for a user
  async getAvailableProviders(userId: string): Promise<string[]> {
    const availableProviders: string[] = [];

    for (const provider of this.emailProviders) {
      const credentials = await this.getProviderCredentials(provider.name, userId);
      if (credentials) {
        availableProviders.push(provider.name);
      }
    }

    return availableProviders;
  }

  /**
   * Send team invitation email using SMTP
   */
  async sendInvitationEmail(options: {
    to: string;
    inviterName: string;
    organizationName: string;
    role: string;
    inviteLink: string;
    expiresAt: Date;
  }): Promise<boolean> {
    const { to, inviterName, organizationName, role, inviteLink, expiresAt } = options;

    const expiryDate = new Date(expiresAt).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const subject = `You've been invited to join ${organizationName} on CartFlow`;

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { text-align: center; margin-bottom: 30px; }
    .logo { font-size: 24px; font-weight: bold; color: #3b82f6; }
    .content { background: #f9fafb; padding: 30px; border-radius: 8px; }
    .button { display: inline-block; background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 500; margin: 20px 0; }
    .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #6b7280; }
    .role-badge { display: inline-block; background: #e0e7ff; color: #3730a3; padding: 4px 12px; border-radius: 4px; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">CartFlow</div>
    </div>
    <div class="content">
      <h2>You're Invited!</h2>
      <p>Hi there,</p>
      <p><strong>${inviterName}</strong> has invited you to join <strong>${organizationName}</strong> on CartFlow as a <span class="role-badge">${role}</span>.</p>
      <p>CartFlow helps teams manage their WooCommerce stores efficiently from a single dashboard.</p>
      <center>
        <a href="${inviteLink}" class="button">Accept Invitation</a>
      </center>
      <p style="font-size: 14px; color: #6b7280;">
        This invitation will expire on ${expiryDate}.<br>
        If you don't have a CartFlow account, you'll be able to create one when you accept the invitation.
      </p>
      <p style="font-size: 12px; color: #9ca3af;">
        If you weren't expecting this invitation, you can safely ignore this email.
      </p>
    </div>
    <div class="footer">
      <p>CartFlow - Multi-Store Management Platform</p>
    </div>
  </div>
</body>
</html>
    `.trim();

    // Use MailerService (SMTP) to send the email
    try {
      this.logger.log(`Sending invitation email to ${to} via SMTP`, 'EmailService');

      const result = await this.mailerService.sendMail({
        to: to,
        subject: subject,
        html: html,
      });

      if (result) {
        this.logger.log(`Invitation email sent successfully to ${to}`, 'EmailService');
        return true;
      } else {
        this.logger.error(`Failed to send invitation email to ${to}`, 'EmailService');
        return false;
      }
    } catch (error) {
      this.logger.error(`Failed to send invitation email: ${error.message}`, 'EmailService');
      // Log invitation details for manual handling
      this.logger.log(`Invitation email (fallback): To: ${to}, Link: ${inviteLink}`, 'EmailService');
      return false;
    }
  }
}



