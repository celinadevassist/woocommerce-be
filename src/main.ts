import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { developmentConfig, config } from './config.manager';
import { LoggerService } from './logger/logger.service';
import { json, urlencoded } from 'express';
import { BusinessErrorFilter } from './shared/exceptions';
import { AllExceptionsFilter } from './filters/http-exception.filter';

async function bootstrap() {
  const logger = new LoggerService('Bootstrap');

  const app = await NestFactory.create(AppModule, {
    bodyParser: false, // Disable automatic body parsing to handle it manually
    logger,
  });
  app.setGlobalPrefix('api');
  developmentConfig(app);

  // Security headers middleware
  app.use((req: any, res: any, next: any) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains',
    );
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.removeHeader('X-Powered-By');
    next();
  });

  // Configure request size limits
  const maxRequestSize = process.env.MAX_REQUEST_SIZE || '50mb';

  // Custom body parser that preserves raw body for webhooks
  app.use((req: any, res: any, next: any) => {
    // Skip body parsing for webhook endpoints to preserve raw body
    if (req.url.includes('/webhooks/')) {
      let rawBody = '';
      req.on('data', (chunk: any) => {
        rawBody += chunk.toString();
      });
      req.on('end', () => {
        req.rawBody = rawBody;
        try {
          req.body = JSON.parse(rawBody);
        } catch (e) {
          req.body = {};
        }
        next();
      });
    } else {
      // Use standard parsing for other endpoints
      json({ limit: maxRequestSize })(req, res, () => {
        urlencoded({ extended: true, limit: maxRequestSize })(req, res, next);
      });
    }
  });

  // Apply global error filters
  app.useGlobalFilters(new AllExceptionsFilter(), new BusinessErrorFilter());

  app.useLogger(logger);

  // Validate required environment variables
  const requiredEnvVars = ['DB_URI', 'JWT_SECRET'];
  const missing = requiredEnvVars.filter((v) => !process.env[v]);
  if (missing.length > 0) {
    logger.error(
      `Missing required environment variables: ${missing.join(', ')}`,
    );
    process.exit(1);
  }

  const port = process.env.PORT || config.server.port;
  await app.listen(port);
  logger.log(`Application running on port ${port}`);
}
bootstrap();
