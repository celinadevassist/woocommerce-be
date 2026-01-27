import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { writeFileSync } from 'fs';

export default (app) => {
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('2Zpoint System')
      .setDescription(
        `
## 2Zpoint System API Documentation

Welcome to the 2Zpoint System API. This RESTful API provides comprehensive endpoints for managing e-commerce operations, user management, and content organization.

### API Version
**Current Version:** 1.0

### Base URL
All API endpoints are prefixed with \`/api\`

Example: \`http://localhost:3041/api/en/users\`

### Authentication
This API uses **JWT Bearer Token** authentication. To access protected endpoints:

1. Obtain a JWT token by calling the authentication endpoints (sign-in/sign-up)
2. Include the token in the Authorization header for all authenticated requests:
   \`\`\`
   Authorization: Bearer <your-jwt-token>
   \`\`\`
3. Use the "Authorize" button at the top of this page to set your token for all requests

**Note:** Authentication tokens persist in this UI after page refresh for your convenience.

### Bilingual Support
Most endpoints support bilingual routes with a \`:lang\` parameter:
- \`en\` - English
- \`ar\` - Arabic

Example: \`/api/en/customers\` or \`/api/ar/customers\`

### Response Format
All responses follow a consistent JSON structure with appropriate HTTP status codes:
- \`200\` - Success
- \`201\` - Created
- \`400\` - Bad Request (validation errors)
- \`401\` - Unauthorized (missing or invalid token)
- \`403\` - Forbidden (insufficient permissions)
- \`404\` - Not Found
- \`500\` - Internal Server Error

### Rate Limiting
- Request timeout: 30 seconds
- Maximum request body size: 50MB (configurable via MAX_REQUEST_SIZE env variable)

### Scopes & Permissions
The API uses scope-based authorization. Each role has specific scopes like:
- \`*:*\` - Full access to all resources
- \`feature:*\` - All actions on a specific feature
- \`feature:action\` - Specific action on a feature (e.g., \`user:read\`, \`idea:create\`)

### Support
For API support and questions, please contact the development team.
        `.trim(),
      )
      .setVersion('1.0')
      .addBearerAuth()
      .build(),
  );
  SwaggerModule.setup('api/', app, document, {
    swaggerOptions: {
      // Expansion control
      docExpansion: 'none', // 'none' | 'list' | 'full'
      defaultModelsExpandDepth: -1, // -1 hides models section
      defaultModelExpandDepth: 1, // model detail expand level

      // Authentication
      persistAuthorization: true, // keeps auth token after refresh

      // UI Features
      filter: true, // enables search box
      showRequestDuration: true, // shows request time
      tryItOutEnabled: true, // enables "Try it out" button
      displayOperationId: false, // shows operationId
      displayRequestDuration: true, // shows request duration
      deepLinking: true, // enables deep linking

      // Sorting
      operationsSorter: 'alpha', // 'alpha' | 'method' | function
      tagsSorter: 'alpha', // 'alpha' | function

      // Validation
      validatorUrl: null, // null disables validation

      // Layout customization
      showExtensions: false, // shows x- vendor extensions
      showCommonExtensions: false, // shows common extensions

      // Request configuration
      requestTimeout: 30000, // 30 seconds timeout
      supportedSubmitMethods: [
        'get',
        'put',
        'post',
        'delete',
        'options',
        'head',
        'patch',
      ],

      // Other useful options
      syntaxHighlight: {
        activate: true,
        theme: 'arta', // 'agate' | 'arta' | 'monokai' | 'nord' | 'obsidian'
      },
      onComplete: () => {
        console.log('Swagger UI loaded');
      },
    },

    // NestJS specific options
    explorer: true, // enables API explorer
    customSiteTitle: '2Zpoint API Documentation',
  });
  writeFileSync('./swagger.json', JSON.stringify(document));
};
