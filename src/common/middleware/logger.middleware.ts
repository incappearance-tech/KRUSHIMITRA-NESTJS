import { Injectable, NestMiddleware, Logger } from '@nestjs/common';

@Injectable()
export class LoggerMiddleware implements NestMiddleware {
  private logger = new Logger('HTTP');

  use(request: any, response: any, next: () => void): void {
    const { ip, method, url } = request;
    // Fastify/Middie raw request doesn't have .get(), use headers directly
    const userAgent = request.headers['user-agent'] || '';
    const startTime = Date.now();

    response.on('finish', () => {
      const { statusCode } = response;
      const duration = Date.now() - startTime;

      const logMessage = `${method} ${url} ${statusCode} ${duration}ms - ${userAgent} ${ip}`;

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
