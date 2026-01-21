import { Controller, Get } from '@nestjs/common';

@Controller()
export class HealthController {
  @Get('/')
  getHealth() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @Get('/health')
  getHealthCheck() {
    return {
      status: 'ok',
      service: '2ZPoint API',
      timestamp: new Date().toISOString(),
    };
  }
}
