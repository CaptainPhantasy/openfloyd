/**
 * OPEN-FLOYD Structured Logger
 * Wraps pino for consistent, JSON-formatted logging across the framework.
 */

import { pino, type Logger as PinoLogger } from 'pino';

const LOG_LEVEL = process.env['LOG_LEVEL'] ?? 'info';
const IS_DEV = process.env['NODE_ENV'] !== 'production';

export const logger = pino({
  level: LOG_LEVEL,
  transport: IS_DEV
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      }
    : undefined,
  base: {
    service: 'openfloyd',
    version: process.env['npm_package_version'] ?? '0.1.0',
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  serializers: {
    err: pino.stdSerializers.err,
    error: pino.stdSerializers.err,
  },
});

export function createLogger(component: string): PinoLogger {
  return logger.child({ component });
}

export type Logger = PinoLogger;
