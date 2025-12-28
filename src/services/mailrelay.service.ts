import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
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
  fromName?: string;
  replyTo?: string;
  cc?: string | string[];
  bcc?: string | string[];
  tags?: string[];
}

@Injectable()
export class MailrelayService {
  private readonly logger = new Logger(MailrelayService.name);
  private readonly templatesPath: string;
  private readonly apiUrl: string;
  private readonly authToken: string;
  private readonly defaultFrom: string;
  private readonly defaultFromName: string;

  constructor(private configService: ConfigService) {
    this.apiUrl = this.configService.get<string>('MAILRELAY_API_URL', 'https://example.ipzmarketing.com/api/v1/send_emails');
    this.authToken = this.configService.get<string>('MAILRELAY_AUTH_TOKEN');
    this.defaultFrom = this.configService.get<string>('EMAIL_FROM', 'noreply@yourdomain.com');
    this.defaultFromName = this.configService.get<string>('EMAIL_FROM_NAME', '2ZPoint');
    
    // Set templates path - check if we're in development or production
    const isDevelopment = this.configService.get<string>('NODE_ENV') === 'development';
    if (isDevelopment) {
      // In development, use src folder
      this.templatesPath = path.join(process.cwd(), 'src/templates/emails');
    } else {
      // In production, templates are copied to the app root
      this.templatesPath = path.join(process.cwd(), 'templates/emails');
    }
    
    this.logger.log('🚀 Mailrelay Service Initialized');
    this.logger.log(`   API URL: ${this.apiUrl}`);
    this.logger.log(`   Default From: ${this.defaultFrom} (${this.defaultFromName})`);
    this.logger.log(`   Templates Path: ${this.templatesPath}`);
    
    if (!this.authToken) {
      this.logger.warn('❌ Mailrelay auth token not configured. Email sending will fail.');
    } else {
      this.logger.log(`   Auth Token: ${this.authToken.substring(0, 10)}... (${this.authToken.length} chars)`);
    }
  }

  async sendMail(options: EmailOptions): Promise<boolean> {
    try {
      this.logger.log('\n🚀 [SEND MAIL] Starting email send process');
      this.logger.log('='.repeat(60));
      
      const from = options.from || this.defaultFrom;
      const fromName = options.fromName || this.defaultFromName;
      
      // Debug logging
      this.logger.log('📧 [STEP 1] Email Configuration:');
      this.logger.log(`   To: ${Array.isArray(options.to) ? options.to.join(', ') : options.to}`);
      this.logger.log(`   From: ${from} (${fromName})`);
      this.logger.log(`   Subject: ${options.subject}`);
      this.logger.log(`   Template: ${options.template || 'No template (using HTML/Text directly)'}`);
      this.logger.log(`   Has HTML: ${!!options.html}`);
      this.logger.log(`   Has Text: ${!!options.text}`);
      this.logger.log(`   Has Context: ${!!options.context}`);
      this.logger.log(`   Attachments: ${options.attachments?.length || 0}`);
      
      let html = options.html;
      let text = options.text;
      
      // Render template if provided
      if (options.template && !html) {
        this.logger.log('\n📝 [STEP 2] Rendering Template:');
        this.logger.log(`   Template Name: ${options.template}`);
        this.logger.log(`   Context Keys: ${options.context ? Object.keys(options.context).join(', ') : 'none'}`);
        
        html = await this.renderTemplate(options.template, options.context);
        this.logger.log(`   ✅ Template rendered successfully (${(html.length / 1024).toFixed(2)} KB)`);
        
        // Auto-generate text version if not provided
        if (!text) {
          text = this.htmlToText(html);
          this.logger.log(`   📄 Text version generated (${(text.length / 1024).toFixed(2)} KB)`);
        }
      } else {
        this.logger.log('\n📝 [STEP 2] Using provided HTML/Text (no template rendering)');
      }

      // Prepare recipients
      this.logger.log('\n👥 [STEP 3] Preparing Recipients:');
      const recipients = Array.isArray(options.to) ? options.to : [options.to];
      this.logger.log(`   Raw recipients: ${JSON.stringify(recipients)}`);
      
      const toList = recipients.map(email => {
        if (typeof email === 'string') {
          return { email: email, name: '' };
        } else {
          return { 
            email: (email as any).email || email, 
            name: (email as any).name || '' 
          };
        }
      });
      this.logger.log(`   Formatted recipients: ${JSON.stringify(toList)}`);

      // Prepare attachments if any
      this.logger.log('\n📎 [STEP 4] Preparing Attachments:');
      const attachments = await this.prepareAttachments(options.attachments);

      // Build request payload
      this.logger.log('\n📦 [STEP 5] Building Payload:');
      const payload = {
        from: {
          email: from,
          name: fromName
        },
        to: toList,
        subject: options.subject,
        html_part: html,
        text_part: text,
        text_part_auto: !text && html ? true : false,
        headers: options.replyTo ? { 'Reply-To': options.replyTo } : {},
        smtp_tags: options.tags || [],
        attachments: attachments
      };
      
      this.logger.log(`   From: ${payload.from.email} (${payload.from.name})`);
      this.logger.log(`   To: ${payload.to.map(t => t.email).join(', ')}`);
      this.logger.log(`   Subject: ${payload.subject}`);
      this.logger.log(`   HTML Size: ${html ? (html.length / 1024).toFixed(2) + ' KB' : 'none'}`);
      this.logger.log(`   Text Size: ${text ? (text.length / 1024).toFixed(2) + ' KB' : 'none'}`);
      this.logger.log(`   Tags: ${payload.smtp_tags.join(', ') || 'none'}`);
      this.logger.log(`   Attachments: ${payload.attachments.length}`);

      // Add CC if provided
      if (options.cc) {
        const ccList = Array.isArray(options.cc) ? options.cc : [options.cc];
        payload['cc'] = ccList.map(email => {
          if (typeof email === 'string') {
            return { email: email, name: '' };
          } else {
            return { 
              email: (email as any).email || email, 
              name: (email as any).name || '' 
            };
          }
        });
      }

      // Add BCC if provided
      if (options.bcc) {
        const bccList = Array.isArray(options.bcc) ? options.bcc : [options.bcc];
        payload['bcc'] = bccList.map(email => {
          if (typeof email === 'string') {
            return { email: email, name: '' };
          } else {
            return { 
              email: (email as any).email || email, 
              name: (email as any).name || '' 
            };
          }
        });
      }

      // Send email via Mailrelay API
      this.logger.log('\n🌐 [STEP 6] Sending to Mailrelay API:');
      const payloadString = JSON.stringify(payload);
      const payloadSizeBytes = Buffer.byteLength(payloadString, 'utf8');
      const payloadSizeKB = (payloadSizeBytes / 1024).toFixed(2);
      
      this.logger.log(`   API URL: ${this.apiUrl}`);
      this.logger.log(`   Auth Token: ${this.authToken ? this.authToken.substring(0, 10) + '...' : 'NOT SET'}`);
      this.logger.log(`   Payload size: ${payloadSizeKB} KB (${payloadSizeBytes} bytes)`);
      this.logger.log(`   Timeout: 30 seconds`);
      
      this.logger.log('\n📤 [STEP 7] Making HTTP Request...');
      const startTime = Date.now();
      
      const response = await axios.post(this.apiUrl, payload, {
        headers: {
          'Content-Type': 'application/json',
          'x-auth-token': this.authToken
        },
        timeout: 30000 // 30 seconds timeout
      });
      
      const requestTime = Date.now() - startTime;

      this.logger.log('\n📨 [STEP 8] Mailrelay Response:');
      this.logger.log(`   Status Code: ${response.status}`);
      this.logger.log(`   Request Time: ${requestTime}ms`);
      this.logger.log(`   Response Headers: ${JSON.stringify(response.headers)}`);
      this.logger.log(`   Response Data: ${JSON.stringify(response.data, null, 2)}`);
      
      this.logger.log('\n🔍 [STEP 9] Processing Response:');
      if (response.status === 200 || response.status === 201) {
        this.logger.log('   ✅ SUCCESS: Email accepted by Mailrelay');
        this.logger.log(`   Recipients: ${recipients.join(', ')}`);
        this.logger.log(`   Message ID: ${response.data.message_id || response.data.id || 'not provided'}`);
        this.logger.log('='.repeat(60));
        this.logger.log('✅ EMAIL SENT SUCCESSFULLY!');
        this.logger.log('='.repeat(60));
        return true;
      } else if (response.status === 422) {
        this.logger.error('   ❌ VALIDATION ERROR (422) from Mailrelay');
        this.logger.error(`   Full error response: ${JSON.stringify(response.data, null, 2)}`);
        if (response.data.errors) {
          this.logger.error('   Field errors:');
          Object.keys(response.data.errors).forEach(field => {
            this.logger.error(`     - ${field}: ${response.data.errors[field].join(', ')}`);
          });
        }
        this.logger.error('='.repeat(60));
        this.logger.error('❌ EMAIL FAILED - VALIDATION ERROR');
        this.logger.error('='.repeat(60));
        return false;
      } else {
        this.logger.error(`   ⚠️ UNEXPECTED STATUS: ${response.status}`);
        this.logger.error(`   Response: ${JSON.stringify(response.data, null, 2)}`);
        this.logger.error('='.repeat(60));
        this.logger.error('❌ EMAIL FAILED - UNEXPECTED STATUS');
        this.logger.error('='.repeat(60));
        return false;
      }
    } catch (error) {
      this.logger.error('\n🚨 [ERROR] Email sending failed!');
      this.logger.error('='.repeat(60));
      
      if (error.response) {
        this.logger.error('❌ HTTP Error Response:');
        this.logger.error(`   Status Code: ${error.response.status}`);
        this.logger.error(`   Status Text: ${error.response.statusText}`);
        this.logger.error(`   Response Data: ${JSON.stringify(error.response.data, null, 2)}`);
        this.logger.error(`   Response Headers: ${JSON.stringify(error.response.headers)}`);
        
        if (error.response.status === 401) {
          this.logger.error('   🔒 AUTHENTICATION ERROR: Check your MAILRELAY_AUTH_TOKEN');
        } else if (error.response.status === 422) {
          this.logger.error('   📝 VALIDATION ERROR: Check email addresses and payload format');
        } else if (error.response.status === 500) {
          this.logger.error('   🔥 SERVER ERROR: Mailrelay API is having issues');
        }
      } else if (error.request) {
        this.logger.error('❌ Network/Connection Error:');
        this.logger.error('   No response received from Mailrelay API');
        this.logger.error(`   Request URL: ${this.apiUrl}`);
        this.logger.error(`   Error Message: ${error.message}`);
        this.logger.error('   Possible causes:');
        this.logger.error('     - Network connectivity issues');
        this.logger.error('     - API URL is incorrect');
        this.logger.error('     - Firewall blocking the request');
        this.logger.error('     - DNS resolution issues');
      } else {
        this.logger.error('❌ Application Error:');
        this.logger.error(`   Error Message: ${error.message}`);
        this.logger.error(`   Error Type: ${error.constructor.name}`);
        this.logger.error(`   Stack Trace:\n${error.stack}`);
      }
      
      this.logger.error('='.repeat(60));
      this.logger.error('❌ EMAIL SENDING FAILED');
      this.logger.error('='.repeat(60));
      return false;
    }
  }

  private async renderTemplate(templateName: string, context: any): Promise<string> {
    try {
      const templatePath = path.join(this.templatesPath, `${templateName}.hbs`);
      
      // Check if template exists
      if (!fs.existsSync(templatePath)) {
        this.logger.error(`❌ Template not found: ${templatePath}`);
        this.logger.log(`   Looking in: ${this.templatesPath}`);
        this.logger.log(`   Available files: ${fs.existsSync(this.templatesPath) ? fs.readdirSync(this.templatesPath).join(', ') : 'Directory not found'}`);
        throw new Error(`Email template not found: ${templateName}`);
      }
      
      const templateContent = fs.readFileSync(templatePath, 'utf-8');
      const template = handlebars.compile(templateContent);
      return template(context);
    } catch (error) {
      this.logger.error(`Failed to render template ${templateName}:`, error.message);
      throw error;
    }
  }

  private async prepareAttachments(attachments?: any[]): Promise<any[]> {
    if (!attachments || attachments.length === 0) {
      this.logger.debug(`   No attachments to prepare`);
      return [];
    }

    this.logger.log(`   📎 Preparing ${attachments.length} attachment(s)...`);
    const preparedAttachments = [];

    for (const attachment of attachments) {
      try {
        let content: string;
        const attachmentName = attachment.filename || attachment.file_name || 'attachment';
        this.logger.debug(`     Processing: ${attachmentName}`);
        
        // If attachment has a path, read the file
        if (attachment.path) {
          this.logger.debug(`       Reading file from: ${attachment.path}`);
          
          if (!fs.existsSync(attachment.path)) {
            this.logger.error(`       ❌ File not found: ${attachment.path}`);
            continue;
          }
          
          const fileContent = fs.readFileSync(attachment.path);
          const fileSizeKB = (fileContent.length / 1024).toFixed(2);
          this.logger.debug(`       File size: ${fileSizeKB} KB`);
          
          content = fileContent.toString('base64');
          this.logger.debug(`       Base64 encoded size: ${(content.length / 1024).toFixed(2)} KB`);
        } else if (attachment.content) {
          // If content is already provided
          if (Buffer.isBuffer(attachment.content)) {
            content = attachment.content.toString('base64');
            this.logger.debug(`       Using provided buffer content`);
          } else {
            content = attachment.content;
            this.logger.debug(`       Using provided string content`);
          }
        } else {
          this.logger.warn(`       ⚠️ No content or path for attachment: ${attachmentName}`);
          continue; // Skip if no content
        }

        const preparedAttachment = {
          content: content,
          file_name: attachmentName,
          content_type: attachment.contentType || attachment.content_type || 'application/pdf',
          content_id: attachment.cid || attachment.content_id || ''
        };
        
        preparedAttachments.push(preparedAttachment);
        this.logger.debug(`       ✅ Attachment prepared: ${attachmentName} (${preparedAttachment.content_type})`);
      } catch (error) {
        this.logger.error(`     ❌ Failed to prepare attachment:`, error);
        this.logger.error(`       Error: ${error.message}`);
      }
    }

    this.logger.log(`   ✅ Prepared ${preparedAttachments.length} attachment(s)`);
    return preparedAttachments;
  }

  private htmlToText(html: string): string {
    // Simple HTML to text conversion
    return html
      .replace(/<style[^>]*>.*?<\/style>/gi, '')
      .replace(/<script[^>]*>.*?<\/script>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  async sendVerificationEmail(email: string, token: string, userName?: string): Promise<boolean> {
    const verificationUrl = `${this.configService.get('EMAIL_VERIFICATION_URL')}?token=${token}`;
    
    return this.sendMail({
      to: email,
      subject: 'Verify Your Email - 2ZPoint',
      template: 'email-verification',
      context: {
        userName: userName || 'User',
        verificationUrl,
        appName: '2ZPoint',
      },
      tags: ['verification', 'signup']
    });
  }

  async sendPasswordResetEmail(email: string, token: string, userName?: string): Promise<boolean> {
    const resetUrl = `${this.configService.get('PASSWORD_RESET_URL')}?token=${token}`;
    
    return this.sendMail({
      to: email,
      subject: 'Reset Your Password - 2ZPoint',
      template: 'password-reset',
      context: {
        userName: userName || 'User',
        resetUrl,
        appName: '2ZPoint',
        expiresIn: '1 hour',
      },
      tags: ['password-reset']
    });
  }

  async sendWelcomeEmail(email: string, userName: string): Promise<boolean> {
    return this.sendMail({
      to: email,
      subject: 'Welcome to 2ZPoint!',
      template: 'welcome',
      context: {
        userName,
        appName: '2ZPoint',
        loginUrl: this.configService.get('APP_URL'),
      },
      tags: ['welcome', 'onboarding']
    });
  }

  async sendInvoiceEmail(email: string, invoiceData: any): Promise<boolean> {
    this.logger.log('🔍 [INVOICE EMAIL] Starting sendInvoiceEmail function');
    this.logger.log(`   📧 Recipient: ${email}`);
    this.logger.log(`   📄 Invoice Number: ${invoiceData.invoiceNumber}`);
    this.logger.log(`   💰 Total Amount: ${invoiceData.currency} ${invoiceData.total}`);
    this.logger.log(`   📎 Attachments: ${invoiceData.attachments?.length || 0} file(s)`);
    
    if (invoiceData.attachments?.length > 0) {
      invoiceData.attachments.forEach((att, index) => {
        this.logger.log(`     Attachment ${index + 1}: ${att.filename || att.file_name || 'unknown'} at ${att.path || 'no path'}`);
        if (att.path && !require('fs').existsSync(att.path)) {
          this.logger.error(`     ⚠️ WARNING: Attachment file does not exist: ${att.path}`);
        }
      });
    }
    
    const context = {
      ...invoiceData,
      appName: 'BrandBanda',
    };
    
    this.logger.log('   📝 Context keys:', Object.keys(context).join(', '));
    
    const result = await this.sendMail({
      to: email,
      subject: `Invoice #${invoiceData.invoiceNumber} - BrandBanda`,
      template: 'invoice',
      context,
      attachments: invoiceData.attachments || [],
      tags: ['invoice', 'billing']
    });
    
    this.logger.log(`   ✉️ [INVOICE EMAIL] Result: ${result ? '✅ SUCCESS' : '❌ FAILED'}`);
    return result;
  }

  async sendSubscriptionEmail(email: string, subscriptionData: any): Promise<boolean> {
    return this.sendMail({
      to: email,
      subject: `Subscription ${subscriptionData.type} - 2ZPoint`,
      template: 'subscription',
      context: {
        ...subscriptionData,
        appName: '2ZPoint',
      },
      tags: ['subscription']
    });
  }

  async sendProjectInvitationEmail(email: string, invitationData: any): Promise<boolean> {
    return this.sendMail({
      to: email,
      subject: `You've been invited to join ${invitationData.projectName}`,
      template: 'project-invitation',
      context: {
        ...invitationData,
        appName: '2ZPoint',
      },
      tags: ['invitation', 'project']
    });
  }

  async testConnection(): Promise<boolean> {
    try {
      // Send a test request to verify the API credentials
      const testPayload = {
        from: { email: this.defaultFrom, name: this.defaultFromName },
        to: [{ email: 'test@example.com', name: 'Test' }],
        subject: 'Test',
        text_part: 'Test',
        smtp_tags: ['test']
      };

      // We'll use a dry-run or validate endpoint if available
      // For now, we'll just check if we can reach the API
      const response = await axios.post(this.apiUrl, testPayload, {
        headers: {
          'Content-Type': 'application/json',
          'x-auth-token': this.authToken
        },
        timeout: 5000,
        validateStatus: () => true // Don't throw on any status
      });

      // Check if auth token is valid (usually returns 401 if invalid)
      if (response.status === 401) {
        this.logger.error('Mailrelay authentication failed');
        return false;
      }

      return true;
    } catch (error) {
      this.logger.error('Mailrelay connection test failed:', error.message);
      return false;
    }
  }
}