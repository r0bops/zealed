// Minimal structured logger that redacts anything that could be a secret, at any depth.
// Defense in depth: code paths that handle plaintext must not log it in the first place.
const SENSITIVE = /^(code|pin|link|lpa|phone|phone_?number|redemption_?info|barcode_?value|secret.*|.*_?key|authorization|cookie|token|seed|backup|plaintext)$/i;

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[DEPTH]";
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = SENSITIVE.test(k) ? "[REDACTED]" : redact(v, depth + 1);
    return out;
  }
  return value;
}

type Level = "debug" | "info" | "warn" | "error";

function emit(level: Level, msg: string, fields?: Record<string, unknown>) {
  const line = JSON.stringify({ t: new Date().toISOString(), level, msg, ...(fields ? (redact(fields) as object) : {}) });
  if (level === "error" || level === "warn") console.error(line);
  else console.log(line);
}

export const log = {
  debug: (msg: string, f?: Record<string, unknown>) => process.env.LOG_DEBUG && emit("debug", msg, f),
  info: (msg: string, f?: Record<string, unknown>) => emit("info", msg, f),
  warn: (msg: string, f?: Record<string, unknown>) => emit("warn", msg, f),
  error: (msg: string, f?: Record<string, unknown>) => emit("error", msg, f),
};

/** Errors from HTTP clients can embed response bodies (= redemption codes). Keep only safe fields. */
export function safeError(err: unknown): { name: string; message: string } {
  if (err instanceof Error) return { name: "Error", message: "Operation failed" };
  return { name: "Error", message: "non-error thrown" };
}
