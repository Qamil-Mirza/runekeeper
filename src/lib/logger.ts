import pino from "pino";

const logger = pino({
  level:
    process.env.LOG_LEVEL ||
    (process.env.NODE_ENV === "production" ? "info" : "debug"),
  ...(process.env.NODE_ENV !== "production" && {
    transport: { target: "pino-pretty", options: { colorize: true } },
  }),
  base: { service: "runekeeper" },
});

export function createLogger(module: string) {
  return logger.child({ module });
}

export default logger;
