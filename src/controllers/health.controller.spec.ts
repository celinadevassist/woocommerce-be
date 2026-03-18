import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { getConnectionToken } from '@nestjs/mongoose';

describe('HealthController', () => {
  let controller: HealthController;
  let mockConnection: any;

  beforeEach(async () => {
    mockConnection = { readyState: 1 };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: getConnectionToken(), useValue: mockConnection },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  describe('getHealth', () => {
    it('should return ok status', () => {
      const result = controller.getHealth();
      expect(result.status).toBe('ok');
      expect(result).toHaveProperty('timestamp');
    });
  });

  describe('getHealthCheck', () => {
    it('should return ok when database is connected', async () => {
      mockConnection.readyState = 1;
      const result = await controller.getHealthCheck();

      expect(result.status).toBe('ok');
      expect(result.service).toBe('CartFlow API');
      expect(result.database.status).toBe('connected');
      expect(result).toHaveProperty('uptime');
      expect(result).toHaveProperty('memory');
      expect(result.memory).toHaveProperty('rss');
      expect(result.memory).toHaveProperty('heapUsed');
    });

    it('should return degraded when database is disconnected', async () => {
      mockConnection.readyState = 0;
      const result = await controller.getHealthCheck();

      expect(result.status).toBe('degraded');
      expect(result.database.status).toBe('disconnected');
    });

    it('should return degraded when database is connecting', async () => {
      mockConnection.readyState = 2;
      const result = await controller.getHealthCheck();

      expect(result.status).toBe('degraded');
      expect(result.database.status).toBe('connecting');
    });

    it('should include memory usage info', async () => {
      const result = await controller.getHealthCheck();

      expect(result.memory.rss).toMatch(/\d+MB/);
      expect(result.memory.heapUsed).toMatch(/\d+MB/);
      expect(result.memory.heapTotal).toMatch(/\d+MB/);
    });

    it('should include environment info', async () => {
      const result = await controller.getHealthCheck();
      expect(result).toHaveProperty('environment');
      expect(result).toHaveProperty('version');
    });
  });
});
