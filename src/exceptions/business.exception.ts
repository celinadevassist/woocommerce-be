import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCodes } from 'src/constants/error-codes';

/**
 * Custom exception for business logic errors
 * Extends HttpException to provide HTTP response capabilities
 */
export class BusinessException extends HttpException {
  private readonly errorCode: ErrorCodes;

  constructor(errorCode: ErrorCodes, statusCode: HttpStatus = HttpStatus.BAD_REQUEST) {
    // Pass the error code as the message and the status code
    super(errorCode, statusCode);
    this.errorCode = errorCode;
  }

  /**
   * Gets the error code associated with this exception
   */
  getErrorCode(): ErrorCodes {
    return this.errorCode;
  }
} 