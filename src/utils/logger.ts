type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';

const formatLog = (level: LogLevel, message: string, meta?: unknown) => {
  const timestamp = new Date().toISOString();
  const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
  return `[${timestamp}] [${level}] ${message}${metaStr}`;
};

export const logger = {
  info: (message: string, meta?: unknown) => {
    console.log(formatLog('INFO', message, meta));
  },
  warn: (message: string, meta?: unknown) => {
    console.warn(formatLog('WARN', message, meta));
  },
  error: (message: string, meta?: unknown) => {
    console.error(formatLog('ERROR', message, meta));
  },
  debug: (message: string, meta?: unknown) => {
    if (process.env.NODE_ENV !== 'production') {
      console.debug(formatLog('DEBUG', message, meta));
    }
  },
};

