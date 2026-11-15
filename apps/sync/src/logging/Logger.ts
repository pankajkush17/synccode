import { type Logger as PinoLogger, pino } from 'pino'

export type LogContext = Record<string, unknown>

export interface LoggerOptions {
  readonly level: string
  readonly name?: string
  readonly base?: LogContext
}

/**
 * Thin wrapper over Pino. Keeps the logging dependency in one file and gives
 * every class the same tiny surface: `child()` for context, four levels to log.
 */
export class Logger {
  private constructor(private readonly pino: PinoLogger) {}

  static create(options: LoggerOptions): Logger {
    return new Logger(
      pino({
        level: options.level,
        name: options.name ?? 'sync',
        base: options.base ?? {},
        timestamp: pino.stdTimeFunctions.isoTime,
        formatters: { level: (label) => ({ level: label }) },
        // Edit tokens ride on the WebSocket URL; make sure they can never reach a log line.
        redact: { paths: ['token', 'editToken', 'url', 'req.url'], censor: '[redacted]' },
      }),
    )
  }

  static silent(): Logger {
    return Logger.create({ level: 'silent' })
  }

  child(context: LogContext): Logger {
    return new Logger(this.pino.child(context))
  }

  debug(message: string, context?: LogContext): void {
    this.pino.debug(context ?? {}, message)
  }

  info(message: string, context?: LogContext): void {
    this.pino.info(context ?? {}, message)
  }

  warn(message: string, context?: LogContext): void {
    this.pino.warn(context ?? {}, message)
  }

  error(message: string, context?: LogContext & { err?: unknown }): void {
    this.pino.error(context ?? {}, message)
  }
}
