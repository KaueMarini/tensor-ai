// Log estruturado (uma linha JSON por evento), legível nos logs das Edge Functions.
// LGPD: todo extra passa pelo sanitizador (e-mails mascarados, nomes de pessoa ocultos).

import { sanitizarLog } from "./privacidade.ts";

export type LogLevel = "info" | "warn" | "error";

export function log(level: LogLevel, msg: string, extra: Record<string, unknown> = {}): void {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, msg, ...sanitizarLog(extra) });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
