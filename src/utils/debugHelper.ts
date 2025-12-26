// Debug Helper для Telegram WebApp
// Показывает ошибки прямо в UI, т.к. консоль недоступна
import * as Sentry from '@sentry/vue';

interface DebugLog {
  timestamp: Date;
  level: 'info' | 'warn' | 'error';
  message: string;
  details?: any;
}

class DebugHelper {
  private logs: DebugLog[] = [];
  private maxLogs = 50;
  public showDebugPanel = false;

  log(level: 'info' | 'warn' | 'error', message: string, details?: any) {
    const log: DebugLog = {
      timestamp: new Date(),
      level,
      message,
      details,
    };

    this.logs.unshift(log);
    if (this.logs.length > this.maxLogs) {
      this.logs.pop();
    }

    // Дублируем в console
    console[level](message, details);

    // Отправляем ошибки в Sentry
    if (level === 'error') {
      Sentry.captureException(new Error(message), {
        extra: { details },
      });
    }
  }

  getLogs() {
    return this.logs;
  }

  clear() {
    this.logs = [];
  }
}

export const debugHelper = new DebugHelper();

// Перехватываем глобальные ошибки
window.addEventListener('error', (event) => {
  debugHelper.log('error', `Global Error: ${event.message}`, {
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
  });
});

window.addEventListener('unhandledrejection', (event) => {
  debugHelper.log('error', `Unhandled Promise: ${event.reason}`, event.reason);
});

