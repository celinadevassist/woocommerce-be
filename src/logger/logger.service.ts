import { ConsoleLogger, LogLevel } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

export class LoggerService extends ConsoleLogger {
  private logDir: string;
  private streams: Record<string, fs.WriteStream> = {};
  private maxFileSize = 10 * 1024 * 1024; // 10MB

  constructor(context?: string) {
    super(context || 'Application');
    this.logDir = path.resolve(process.cwd(), 'logs');
    this.ensureLogDir();
    this.initStreams();
  }

  private ensureLogDir() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  private initStreams() {
    const files = ['application.log', 'error.log', 'debug.log'];
    for (const file of files) {
      const filePath = path.join(this.logDir, file);
      this.streams[file] = fs.createWriteStream(filePath, { flags: 'a' });
    }
  }

  private formatJson(level: string, message: string, context?: string, trace?: string) {
    return JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      context: context || this.context || 'Application',
      message,
      ...(trace ? { trace } : {}),
      pid: process.pid,
    }) + '\n';
  }

  private writeToFile(filename: string, entry: string) {
    const stream = this.streams[filename];
    if (stream && !stream.destroyed) {
      stream.write(entry);
      this.rotateIfNeeded(filename);
    }
  }

  private rotateIfNeeded(filename: string) {
    const filePath = path.join(this.logDir, filename);
    try {
      const stats = fs.statSync(filePath);
      if (stats.size > this.maxFileSize) {
        const stream = this.streams[filename];
        if (stream) stream.end();
        const rotated = filePath + '.' + Date.now();
        fs.renameSync(filePath, rotated);
        this.streams[filename] = fs.createWriteStream(filePath, { flags: 'a' });
        // Keep only last 5 rotated files
        this.cleanOldRotations(filename);
      }
    } catch {
      // File may not exist yet
    }
  }

  private cleanOldRotations(filename: string) {
    try {
      const base = path.join(this.logDir, filename);
      const files = fs.readdirSync(this.logDir)
        .filter(f => f.startsWith(filename + '.'))
        .sort()
        .reverse();
      for (const f of files.slice(5)) {
        fs.unlinkSync(path.join(this.logDir, f));
      }
    } catch {
      // Ignore cleanup errors
    }
  }

  log(message: string, context?: string) {
    super.log(message, context);
    const entry = this.formatJson('info', message, context);
    this.writeToFile('application.log', entry);
  }

  error(message: string, trace?: string, context?: string) {
    super.error(message, trace, context);
    const entry = this.formatJson('error', message, context, trace);
    this.writeToFile('error.log', entry);
    this.writeToFile('application.log', entry);
  }

  warn(message: string, context?: string) {
    super.warn(message, context);
    const entry = this.formatJson('warning', message, context);
    this.writeToFile('application.log', entry);
  }

  debug(message: string, context?: string) {
    super.debug(message, context);
    const entry = this.formatJson('debug', message, context);
    this.writeToFile('debug.log', entry);
  }

  verbose(message: string, context?: string) {
    super.verbose(message, context);
    const entry = this.formatJson('debug', message, context);
    this.writeToFile('debug.log', entry);
  }

  onApplicationShutdown() {
    for (const stream of Object.values(this.streams)) {
      if (stream && !stream.destroyed) stream.end();
    }
  }
}
