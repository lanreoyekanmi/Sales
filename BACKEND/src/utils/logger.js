// Structured, safe-by-construction logging. Only pass request/application metadata in `meta`
// (requestId, applicationId, statusCode, field names, error codes) — never full applicant
// records, addresses, income figures, loan history contents, or raw error messages/stacks
// from the database driver, since those can embed submitted PII.
function write(level, message, meta = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...meta,
  };
  const line = JSON.stringify(entry);
  if (level === "error" || level === "warn") {
    console.error(line);
  } else {
    console.log(line);
  }
}

const logger = {
  info: (message, meta) => write("info", message, meta),
  warn: (message, meta) => write("warn", message, meta),
  error: (message, meta) => write("error", message, meta),
};

export default logger;
