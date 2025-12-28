import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { BusinessException } from './business.exception';
import { BusinessErrorResponse } from './business-error.codes';

@Catch()
export class BusinessErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger(BusinessErrorFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let errorResponse: Partial<BusinessErrorResponse>;

    if (exception instanceof BusinessException) {
      // Handle business exceptions
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse() as any;

      errorResponse = {
        statusCode: status,
        errorCode: exceptionResponse.errorCode,
        message: exceptionResponse.message,
        details: exceptionResponse.details,
        timestamp: new Date().toISOString(),
        path: request.url,
      };
    } else if (exception instanceof HttpException) {
      // Handle other HTTP exceptions
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      errorResponse = {
        statusCode: status,
        message: typeof exceptionResponse === 'string'
          ? exceptionResponse
          : (exceptionResponse as any).message || exception.message,
        timestamp: new Date().toISOString(),
        path: request.url,
      };
    } else {
      // Handle unknown errors
      this.logger.error('Unhandled exception:', exception);

      errorResponse = {
        statusCode: status,
        message: 'Internal server error',
        timestamp: new Date().toISOString(),
        path: request.url,
      };
    }

    response.status(status).json(errorResponse);
  }
}
