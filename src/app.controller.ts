import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { AppService } from './app.service';
import { Public } from './common/decorators/public.decorator';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  /**
   * Health check — used by Docker HEALTHCHECK, Render health probe, and load balancers.
   * @Public so JwtAuthGuard and SecurityGuard are bypassed.
   * Returns 200 with minimal payload so probes don't timeout.
   */
  @Get('health')
  @Public()
  @HttpCode(HttpStatus.OK)
  health(): { status: string; timestamp: string } {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  // ⚠️  /init-database removed — it executed `prisma db push --accept-data-loss`
  // without authentication, giving any caller the ability to wipe production data.
  // Run migrations via CI/CD pipeline only: `npx prisma migrate deploy`
}
