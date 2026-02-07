import {
    ExceptionFilter,
    Catch,
    ArgumentsHost,
    HttpException,
    HttpStatus,
    Logger,
} from '@nestjs/common';
import { Response, Request } from 'express';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
    private readonly logger = new Logger(GlobalExceptionFilter.name);

    catch(exception: unknown, host: ArgumentsHost) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse<Response>();
        const request = ctx.getRequest<Request>();

        const status =
            exception instanceof HttpException
                ? exception.getStatus()
                : HttpStatus.INTERNAL_SERVER_ERROR;

        // Log the exception for observability
        if (status >= 500) {
            this.logger.error(
                `[${request.method}] ${request.url} - Error: ${exception instanceof Error ? exception.message : 'Unknown'}`,
                exception instanceof Error ? exception.stack : undefined
            );
        } else {
            this.logger.warn(`[${request.method}] ${request.url} - Status: ${status} - Message: ${typeof exception === 'object' && exception !== null && 'message' in exception ? (exception as any).message : exception}`);
        }

        const exceptionResponse =
            exception instanceof HttpException
                ? exception.getResponse()
                : 'Internal server error';

        const message = typeof exceptionResponse === 'object'
            ? (exceptionResponse as any).message || (exceptionResponse as any).error
            : exceptionResponse;

        response.status(status).json({
            success: false,
            statusCode: status,
            message: Array.isArray(message) ? message[0] : message, // Take first error if array (validation)
            data: null,
            path: request.url,
            timestamp: new Date().toISOString(),
            encrypted: false,
            version: '1.0',
        });
    }
}
