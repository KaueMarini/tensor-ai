// Normalização de caminhos de iteração.
// Classification nodes devolvem "\Projeto\Iteration\Sprint 1";
// o campo System.IterationPath dos work items usa "Projeto\Sprint 1".

export function normalizeIterationPath(path: string | null | undefined): string | null {
  if (!path) return null;
  const parts = path.replace(/\//g, "\\").split("\\").filter(Boolean);
  if (parts.length >= 2 && parts[1]!.toLowerCase() === "iteration") parts.splice(1, 1);
  return parts.join("\\") || null;
}

/** Data ISO do DevOps ("2026-10-05T00:00:00Z") -> "2026-10-05". */
export function toDateOnly(value: string | null | undefined): string | null {
  if (!value) return null;
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  return m ? m[1]! : null;
}
