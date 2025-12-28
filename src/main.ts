import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { developmentConfig, config } from './config.manager';
import { LoggerService } from './logger/logger.service';
import { json, urlencoded } from 'express';
import { BusinessErrorFilter } from './shared/exceptions';
import { AllExceptionsFilter } from './filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bodyParser: false // Disable automatic body parsing to handle it manually
  });
  app.setGlobalPrefix('api');
  developmentConfig(app);

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

  app.useLogger(new LoggerService());
  const port = process.env.PORT || config.server.port;
  await app.listen(port);
}
bootstrap();
