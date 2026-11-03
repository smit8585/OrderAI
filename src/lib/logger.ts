type Level = "info" | "warn" | "error";

function emit(level: Level, msg: string, meta?: Record<string, unknown>) {
  const line = JSON.stringify({ t: new Date().toISOString(), level, msg, ...meta });
  if (level === "error") console.error(line);
  else console.log(line);
}

export const log = {
  info: (msg: string, meta?: Record<string, unknown>) => emit("info", msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => emit("warn", msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => emit("error", msg, meta),
};

export function errMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
