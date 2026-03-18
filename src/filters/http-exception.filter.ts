import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let validationErrors: string[] | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const errorResponse = exception.getResponse();
      if (typeof errorResponse === 'string') {
        message = errorResponse;
      } else {
        const errObj = errorResponse as any;
        message = errObj.message || message;
        if (Array.isArray(errObj.message)) {
          validationErrors = errObj.message;
          message = 'Validation failed';
        }
      }
    } else if (exception instanceof Error) {
      // Log full stack trace internally but don't expose to client
      this.logger.error(
        `Error on ${request.method} ${request.url}`,
        exception.stack,
      );
      // In production, hide internal error details from clients
      if (process.env.NODE_ENV === 'production') {
        message = 'Internal server error';
      } else {
        message = exception.message;
      }
    }

    this.logger.error(
      `${request.method} ${request.url} - Status: ${status} - Error: ${typeof exception === 'object' && exception !== null && 'message' in exception ? (exception as Error).message : message}`,
    );

    response.status(status).json({
      statusCode: status,
      message,
      ...(validationErrors ? { errors: validationErrors } : {}),
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
