
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { writeFileSync } from 'fs';

export default (app) => {
    const document = SwaggerModule.createDocument(app, new DocumentBuilder()
        .setTitle('2Zpoint System')
        .setDescription('')
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
            supportedSubmitMethods: ['get', 'put', 'post', 'delete', 'options', 'head', 'patch'],

            // Other useful options
            syntaxHighlight: {
                activate: true,
                theme: 'arta' // 'agate' | 'arta' | 'monokai' | 'nord' | 'obsidian'
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
