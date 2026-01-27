/**
 * @deprecated This enum is deprecated. Use BusinessErrorCode from 'src/shared/exceptions/business-error.codes' instead.
 *
 * The new error handling system provides:
 * - Numeric error codes for better client-side handling
 * - Specific exception classes (ResourceNotFoundException, ValidationException, etc.)
 * - Actionable guidance in error responses
 *
 * See docs/ERROR_HANDLING.md for migration guide.
 *
 * Error codes used throughout the application
 */
export enum ErrorCodes {
  // Question related errors
  QUESTION_NOT_FOUND = 'QUESTION_NOT_FOUND',
  NOT_ALLOWED_TO_SEE_QUESTION = 'Access denied: This content is for our community members only.',

  // User related errors
  USER_NOT_FOUND = 'USER_NOT_FOUND',
  USER_EMAIL_ALREADY_EXISTS = 'USER_EMAIL_ALREADY_EXISTS',
  NOT_AUTHORIZED = 'NOT_AUTHORIZED',
  LAST_ADMIN_REMOVAL = 'LAST_ADMIN_REMOVAL',

  // Zoom related errors
  ZOOM_NOT_FOUND = 'ZOOM_NOT_FOUND',
  ZOOM_ALREADY_EXISTS = 'ZOOM_ALREADY_EXISTS',
  ZOOM_ACCESS_DENIED = 'ZOOM_ACCESS_DENIED',
  ZOOM_MEETING_DATE_TOO_FAR = 'Meeting date must be within 7 days from today',
  ZOOM_ACTIVE_MEETING_EXISTS = 'An active Zoom meeting already exists for this session. Please complete or cancel the existing meeting before creating a new one.',

  // Generic errors
  UNAUTHORIZED = 'Access denied: This content is for our community members only.',
  BAD_REQUEST = 'BAD_REQUEST',
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
  ENTITY_NOT_FOUND = 'ENTITY_NOT_FOUND',

  ADMIN_DELETION_NOT_ALLOWED = 'ADMIN_DELETION_NOT_ALLOWED',
}
