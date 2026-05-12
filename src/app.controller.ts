import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  // ⚠️  /init-database removed — it executed `prisma db push --accept-data-loss`
  // without authentication, giving any caller the ability to wipe production data.
  // Run migrations via CI/CD pipeline only: `npx prisma migrate deploy`
}
