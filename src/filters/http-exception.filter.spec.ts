import { AllExceptionsFilter } from './http-exception.filter';
import {
  HttpException,
  HttpStatus,
  ArgumentsHost,
} from '@nestjs/common';

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;
  let mockResponse: any;
  let mockRequest: any;
  let mockHost: ArgumentsHost;

  beforeEach(() => {
    filter = new AllExceptionsFilter();
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    mockRequest = {
      method: 'GET',
      url: '/test',
    };
    mockHost = {
      switchToHttp: () => ({
        getResponse: () => mockResponse,
        getRequest: () => mockRequest,
      }),
    } as any;
  });

  it('should handle HttpException with string response', () => {
    const exception = new HttpException('Not Found', HttpStatus.NOT_FOUND);

    filter.catch(exception, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.NOT_FOUND,
        message: 'Not Found',
        path: '/test',
      }),
    );
  });

  it('should handle HttpException with object response', () => {
    const exception = new HttpException(
      { message: 'Validation error', statusCode: 400 },
      HttpStatus.BAD_REQUEST,
    );

    filter.catch(exception, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Validation error',
      }),
    );
  });

  it('should handle validation errors (array messages)', () => {
    const exception = new HttpException(
      { message: ['email must be valid', 'password is required'] },
      HttpStatus.BAD_REQUEST,
    );

    filter.catch(exception, mockHost);

    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Validation failed',
        errors: ['email must be valid', 'password is required'],
      }),
    );
  });

  it('should hide internal error details in production', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    const exception = new Error('Database connection failed: password wrong');

    filter.catch(exception, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Internal server error',
      }),
    );

    // Should NOT expose the actual error message
    const responseBody = mockResponse.json.mock.calls[0][0];
    expect(responseBody.message).not.toContain('Database connection failed');

    process.env.NODE_ENV = originalEnv;
  });

  it('should show error details in development', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    const exception = new Error('Detailed error message');

    filter.catch(exception, mockHost);

    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Detailed error message',
      }),
    );

    process.env.NODE_ENV = originalEnv;
  });

  it('should return 500 for unknown exceptions', () => {
    filter.catch('something went wrong', mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  });

  it('should include timestamp in response', () => {
    const exception = new HttpException('test', HttpStatus.BAD_REQUEST);

    filter.catch(exception, mockHost);

    const response = mockResponse.json.mock.calls[0][0];
    expect(response).toHaveProperty('timestamp');
    expect(new Date(response.timestamp).getTime()).not.toBeNaN();
  });

  it('should include path in response', () => {
    mockRequest.url = '/api/en/orders';
    const exception = new HttpException('test', HttpStatus.BAD_REQUEST);

    filter.catch(exception, mockHost);

    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/api/en/orders' }),
    );
  });
});
