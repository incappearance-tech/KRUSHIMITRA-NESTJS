import { Module } from '@nestjs/common';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';
import { randomUUID } from 'crypto';

@Module({
    imports: [
        PinoLoggerModule.forRoot({
            pinoHttp: {
                genReqId: (req) => {
                    return req.headers['x-request-id'] || randomUUID();
                },
                transport:
                    process.env.NODE_ENV !== 'production'
                        ? { target: 'pino-pretty', options: { colorize: true } }
                        : undefined,
                level: process.env.NODE_ENV !== 'production' ? 'debug' : 'info',
                autoLogging: false,
            },
        }),
    ],
    exports: [PinoLoggerModule],
})
export class AppLoggerModule { }
