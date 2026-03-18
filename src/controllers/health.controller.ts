import { Controller, Get } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';

@Controller()
export class HealthController {
  private readonly startTime = Date.now();

  constructor(@InjectConnection() private readonly connection: Connection) {}

  @Get('/')
  getHealth() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @Get('/health')
  async getHealthCheck() {
    const dbState = this.connection.readyState;
    const dbStates = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting',
    };

    const uptimeMs = Date.now() - this.startTime;
    const memUsage = process.memoryUsage();

    return {
      status: dbState === 1 ? 'ok' : 'degraded',
      service: 'CartFlow API',
      timestamp: new Date().toISOString(),
      uptime: `${Math.floor(uptimeMs / 1000)}s`,
      database: {
        status: dbStates[dbState] || 'unknown',
      },
      memory: {
        rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`,
        heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
        heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
      },
      version: process.env.npm_package_version || '0.0.1',
      environment: process.env.NODE_ENV || 'development',
    };
  }
}
