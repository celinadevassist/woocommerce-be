# EmailService Usage Guide

## Overview

The EmailService provides a robust email sending solution with multiple provider support and automatic failover. It integrates with the MetadataModule to store provider credentials securely.

## Features

- ✅ Multiple email provider support (currently ERPNext, with SendGrid/Mailgun templates)
- ✅ Automatic failover between providers
- ✅ Credentials stored in MetadataModule
- ✅ Backward compatibility with existing code
- ✅ Provider testing utilities
- ✅ Comprehensive error handling and logging

## Setup

### 1. Configure Provider Credentials

First, create metadata for your email providers via the MetadataModule API:

```bash
POST /en/metadata
{
  "userId": "60d21b4667d0d8992e610c85",
  "forModule": "Email_Marketing",
  "meta": {
    "erpnext_email": {
      "baseUrl": "https://erpnext-marketing.sys-track-overview.site",
      "token": "de668493e4344b0:38d508b26d63eba",
      "communication_doctype": "User",
      "communication_name": "Administrator",
      "default_sender": "support@2zpoint.com",
      "test_email": "test@example.com"
    }
  }
}
```

### 2. Import and Inject the Service

```typescript
import { EmailService, EmailData } from '../services/email.service';

@Injectable()
export class YourService {
  constructor(
    private readonly emailService: EmailService
  ) {}
}
```

## Usage Examples

### 1. Legacy Method (Backward Compatibility)

```typescript
// For existing code that uses the old signature
const result = await this.emailService.sendEmail(
  'user@example.com',
  'Welcome!',
  'Welcome to our platform!'
);
// Returns: { message: string }
```

### 2. New Method with Provider Support

```typescript
// Using the new method with provider selection
const emailData: EmailData = {
  recipients: 'user@example.com', // or ['user1@example.com', 'user2@example.com']
  subject: 'Welcome to our platform!',
  content: 'Thank you for joining us...',
  contentType: 'text', // or 'html'
  sender: 'support@yourcompany.com' // optional
};

const success = await this.emailService.sendEmailWithProviders(emailData, userId);
// Returns: boolean
```

### 3. Test Provider Connectivity

```typescript
const testResult = await this.emailService.testProvider('ERPNext Email', userId);
console.log(testResult);
// Returns: { success: boolean, message: string }
```

### 4. Get Available Providers

```typescript
const providers = await this.emailService.getAvailableProviders(userId);
console.log(providers); // ['ERPNext Email']
```

## Provider Configuration Examples

### ERPNext Provider

```json
{
  "erpnext_email": {
    "baseUrl": "https://your-erpnext-instance.com",
    "token": "api_key:api_secret",
    "communication_doctype": "User",
    "communication_name": "Administrator",
    "default_sender": "noreply@yourcompany.com",
    "test_email": "test@yourcompany.com"
  }
}
```

### SendGrid Provider (Template - Not Implemented)

```json
{
  "sendgrid": {
    "apiKey": "SG.your_api_key_here",
    "default_sender": "noreply@yourcompany.com",
    "test_email": "test@yourcompany.com"
  }
}
```

### Multiple Providers (Automatic Failover)

```json
{
  "erpnext_email": {
    "baseUrl": "https://your-erpnext-instance.com",
    "token": "api_key:api_secret",
    "communication_doctype": "User",
    "communication_name": "Administrator",
    "default_sender": "noreply@yourcompany.com"
  },
  "sendgrid": {
    "apiKey": "SG.your_api_key_here",
    "default_sender": "noreply@yourcompany.com"
  },
  "default_provider": {
    "baseUrl": "https://your-erpnext-instance.com",
    "token": "api_key:api_secret",
    "communication_doctype": "User",
    "communication_name": "Administrator",
    "default_sender": "noreply@yourcompany.com"
  }
}
```

## Error Handling

The service automatically:
- Tries each provider in order until one succeeds
- Logs detailed error messages for debugging
- Returns boolean success status for new methods
- Returns error messages for legacy methods

## Adding New Providers

To add a new email provider:

1. Add the provider to the `emailProviders` array in the constructor
2. Implement the provider method following the pattern:

```typescript
async sendEmail_YourProvider(data: EmailData, credentials: any): Promise<any> {
  try {
    // Validate credentials
    if (!credentials.requiredField) {
      return 'YourProvider credentials missing requiredField';
    }

    // Implement API call
    const response = await axios.post(/* your API call */);

    // Handle response
    if (response.status === 200) {
      return true;
    } else {
      return `YourProvider -> HTTP ${response.status}: ${response.statusText}`;
    }
  } catch (error) {
    return `YourProvider -> Error: ${error.message}`;
  }
}
```

## Integration with Other Modules

The service is already registered in:
- AuthModule (for password reset emails)
- Can be added to any module that needs email functionality

Simply import and inject the EmailService in your module's providers array. 