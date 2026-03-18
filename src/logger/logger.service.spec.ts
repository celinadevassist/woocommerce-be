import { LoggerService } from './logger.service';
import * as fs from 'fs';
import * as path from 'path';

describe('LoggerService', () => {
  let service: LoggerService;
  const logDir = path.resolve(process.cwd(), 'logs');

  beforeEach(() => {
    service = new LoggerService('TestContext');
  });

  afterEach(() => {
    service.onApplicationShutdown();
  });

  afterAll(() => {
    // Clean up test log files
    try {
      const files = fs.readdirSync(logDir);
      for (const file of files) {
        if (file.endsWith('.log')) {
          fs.unlinkSync(path.join(logDir, file));
        }
      }
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should create logs directory', () => {
    expect(fs.existsSync(logDir)).toBe(true);
  });

  it('should write info logs to application.log', (done) => {
    service.log('Test info message', 'TestCtx');

    // Wait for write stream to flush
    setTimeout(() => {
      const content = fs.readFileSync(
        path.join(logDir, 'application.log'),
        'utf-8',
      );
      expect(content).toContain('Test info message');

      const lines = content.trim().split('\n');
      const lastLine = JSON.parse(lines[lines.length - 1]);
      expect(lastLine.level).toBe('info');
      expect(lastLine.message).toBe('Test info message');
      expect(lastLine).toHaveProperty('timestamp');
      expect(lastLine).toHaveProperty('pid');
      done();
    }, 100);
  });

  it('should write error logs to both error.log and application.log', (done) => {
    service.error('Test error message', 'stack trace here', 'ErrorCtx');

    setTimeout(() => {
      const errorContent = fs.readFileSync(
        path.join(logDir, 'error.log'),
        'utf-8',
      );
      const appContent = fs.readFileSync(
        path.join(logDir, 'application.log'),
        'utf-8',
      );

      expect(errorContent).toContain('Test error message');
      expect(appContent).toContain('Test error message');

      const lines = errorContent.trim().split('\n');
      const lastLine = JSON.parse(lines[lines.length - 1]);
      expect(lastLine.level).toBe('error');
      expect(lastLine.trace).toBe('stack trace here');
      done();
    }, 100);
  });

  it('should write debug logs to debug.log', (done) => {
    service.debug('Test debug message', 'DebugCtx');

    setTimeout(() => {
      const content = fs.readFileSync(
        path.join(logDir, 'debug.log'),
        'utf-8',
      );
      expect(content).toContain('Test debug message');
      done();
    }, 100);
  });

  it('should format logs as valid JSON', (done) => {
    service.log('JSON format test');

    setTimeout(() => {
      const content = fs.readFileSync(
        path.join(logDir, 'application.log'),
        'utf-8',
      );
      const lines = content.trim().split('\n');
      const lastLine = lines[lines.length - 1];

      expect(() => JSON.parse(lastLine)).not.toThrow();

      const parsed = JSON.parse(lastLine);
      expect(parsed).toHaveProperty('timestamp');
      expect(parsed).toHaveProperty('level');
      expect(parsed).toHaveProperty('context');
      expect(parsed).toHaveProperty('message');
      expect(parsed).toHaveProperty('pid');
      done();
    }, 100);
  });

  it('should write warning logs to application.log', (done) => {
    service.warn('Test warning');

    setTimeout(() => {
      const content = fs.readFileSync(
        path.join(logDir, 'application.log'),
        'utf-8',
      );
      expect(content).toContain('Test warning');

      const lines = content.trim().split('\n');
      const lastLine = JSON.parse(lines[lines.length - 1]);
      expect(lastLine.level).toBe('warning');
      done();
    }, 100);
  });
});
