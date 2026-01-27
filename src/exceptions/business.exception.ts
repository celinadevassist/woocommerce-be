import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCodes } from 'src/constants/error-codes';

/**
 * @deprecated This class is deprecated. Use BusinessException from 'src/shared/exceptions/business.exception' instead.
 *
 * The new BusinessException provides:
 * - Numeric error codes (BusinessErrorCode enum)
 * - Descriptive error messages
 * - Actionable guidance in details.action field
 * - Better type safety and extensibility
 *
 * Migration example:
 * OLD: throw new BusinessException(ErrorCodes.INTERNAL_SERVER_ERROR, HttpStatus.INTERNAL_SERVER_ERROR);
 * NEW: throw new SystemErrorException('operation name', error?.message);
 *
 * Custom exception for business logic errors
 * Extends HttpException to provide HTTP response capabilities
 */
export class BusinessException extends HttpException {
  private readonly errorCode: ErrorCodes;

  constructor(
    errorCode: ErrorCodes,
    statusCode: HttpStatus = HttpStatus.BAD_REQUEST,
  ) {
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
