import * as dotenv from 'dotenv';
dotenv.config();
import setUpSwagger from './swagger.config';

import * as DEFAULT from './config/default.json';

import * as TEST from './config/test.json';
import * as DEVELOPMENT from './config/development.json';
import * as STAGING from './config/staging.json';
import * as PRODUCTION from './config/production.json';
import { SwaggerModule } from '@nestjs/swagger';

const configObj = {
  test: TEST,
  development: DEVELOPMENT,
  staging: STAGING,
  production: PRODUCTION,
};

export const config = configObj[process.env.NODE_ENV] || DEFAULT;
export const developmentConfig = (app) => {
    // Enable CORS with desired options
  // Enable CORS for all environments
  const allowedOrigins = process.env.FRONTEND_URL
    ? process.env.FRONTEND_URL.split(',').map(url => url.trim())
    : null; // Will allow any localhost when null

  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, Postman, server-to-server)
      if (!origin) {
        return callback(null, true);
      }

      // If FRONTEND_URL is set, check against allowed origins
      if (allowedOrigins && Array.isArray(allowedOrigins)) {
        const isAllowed = allowedOrigins.some(allowedUrl => {
          const domain = allowedUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
          return origin.includes(domain);
        });
        if (isAllowed) {
          return callback(null, true);
        }
      }

      // Allow any localhost origin for development
      if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
        return callback(null, true);
      }

      // Log blocked origins for debugging
      console.log(`[CORS] Blocked origin: ${origin}`);
      console.log(`[CORS] Allowed origins: ${JSON.stringify(allowedOrigins)}`);

      // Block other origins
      callback(new Error('Not allowed by CORS'));
    },
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: 'Content-Type, Authorization, ziina-signature',
    credentials: true,
  });
  // app.enableCors({
  //   origin: '*',
  //   methods: 'GET, POST, PATCH, PUT, DELETE',
  //   allowedHeaders: 'Content-Type, Authorization'
  // });
  
  if (process.env.NODE_ENV !== 'development' && process.env.NODE_ENV !== 'test' && process.env.NODE_ENV !== 'default') {
    return;
  }
  const document = SwaggerModule.createDocument(app, config);

  // Serve raw JSON at /swagger-json
  app.use('/swagger-json', (req, res) => {
    res.json(document);
  });

  setUpSwagger(app);

};