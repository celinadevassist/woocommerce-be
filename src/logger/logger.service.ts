import { ConsoleLogger } from '@nestjs/common';
import axios from 'axios';

export class LoggerService extends ConsoleLogger {
  async error(message: string, type) {
    if (!type) super.error(message);
    // await axios.post(
    // `https://script.google.com/macros/s/AKfycbwrXM5WgERyB8p5rj3LP4jrD4U4M6MU45LyT-t9KeAu_IwM7XZhuaBY/exec`,
    // {
    //   date: `${new Date().toLocaleString()}`,
    //   message,
    //   type: type || 'Back-End: system error',
    // }, { params: { action: 'systemErrors' }});
  }
}
