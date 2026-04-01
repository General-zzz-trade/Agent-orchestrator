import pino from "pino";

const isDev = process.env.NODE_ENV !== "production";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  transport: isDev ? { target: "pino-pretty", options: { colorize: true, translateTime: "HH:MM:ss" } } : undefined
});

// Legacy class-based Logger for compatibility with existing code
export class Logger {
  private readonly log = logger.child({});

  info(message: string): void {
    this.log.info(message);
  }

  error(message: string): void {
    this.log.error(message);
  }
}
