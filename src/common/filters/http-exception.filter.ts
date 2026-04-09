import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import * as Sentry from '@sentry/node';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<any>();
    const request = ctx.getRequest<any>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    // Log the exception for observability
    if (status >= 500) {
      this.logger.error(
        `[${request.method}] ${request.url} - Error: ${exception instanceof Error ? exception.message : 'Unknown'}`,
        exception instanceof Error ? exception.stack : undefined,
      );
      Sentry.captureException(exception);
    } else {
      this.logger.warn(
        `[${request.method}] ${request.url} - Status: ${status} - Message: ${typeof exception === 'object' && exception !== null && 'message' in exception ? (exception as any).message : exception}`,
      );
    }

    const exceptionResponse =
      exception instanceof HttpException
        ? exception.getResponse()
        : 'Internal server error';

    const message =
      typeof exceptionResponse === 'object'
        ? (exceptionResponse as any).message || (exceptionResponse as any).error
        : exceptionResponse;

    const responseBody = {
      success: false,
      statusCode: status,
      message: Array.isArray(message) ? message[0] : message,
      data: null,
      path: request.url,
      timestamp: new Date().toISOString(),
      encrypted: false,
      version: '1.0',
      error: exceptionResponse,
    };

    // Fastify/Express/Raw Response handling
    if (typeof response.code === 'function') {
      // Fastify
      response.code(status).send(responseBody);
    } else if (typeof response.status === 'function' && typeof response.json === 'function') {
      // Express
      response.status(status).json(responseBody);
    } else {
      // Raw Node Response or other fallback
      response.statusCode = status;
      if (typeof response.setHeader === 'function') {
        response.setHeader('Content-Type', 'application/json');
      }
      const body = JSON.stringify(responseBody);
      if (typeof response.send === 'function') {
        response.send(body);
      } else {
        response.end(body);
      }
    }
  }
}
