import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class LoggerMiddleware implements NestMiddleware {
    private logger = new Logger('HTTP');

    use(request: Request, response: Response, next: NextFunction): void {
        const { ip, method, originalUrl } = request;
        const userAgent = request.get('user-agent') || '';
        const startTime = Date.now();

        response.on('finish', () => {
            const { statusCode } = response;
            const duration = Date.now() - startTime;

            const logMessage = `${method} ${originalUrl} ${statusCode} ${duration}ms - ${userAgent} ${ip}`;

            if (statusCode >= 500) {
                this.logger.error(logMessage);
            } else if (statusCode >= 400) {
                this.logger.warn(logMessage);
            } else {
                this.logger.log(logMessage);
            }
        });

        next();
    }
}
