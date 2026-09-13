// Development-only logger. Never call this with form values, file contents, or any applicant
// data — it exists for wiring/debugging (e.g. "which step failed to render"), not data
// inspection. It is a no-op in production builds.

type LogArgs = Array<string | number | boolean | null | undefined>;

export const devLog = {
  info(message: string, ...args: LogArgs): void {
    if (import.meta.env.DEV) console.info(`[app] ${message}`, ...args);
  },
  warn(message: string, ...args: LogArgs): void {
    if (import.meta.env.DEV) console.warn(`[app] ${message}`, ...args);
  },
  error(message: string, ...args: LogArgs): void {
    if (import.meta.env.DEV) console.error(`[app] ${message}`, ...args);
  },
};
