import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const dataCurta = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", timeZone: "UTC" });
const hora = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

export function formatData(iso: string | null | undefined): string {
  if (!iso) return "—";
  return dataCurta.format(new Date(iso)).replace(".", "");
}

export function formatHora(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  return hora.format(typeof iso === "string" ? new Date(iso) : iso);
}

export function formatHoras(h: number | null | undefined): string {
  if (h === null || h === undefined) return "—";
  return `${Number.isInteger(h) ? h : h.toFixed(1).replace(".", ",")}h`;
}

export function tempoRelativo(iso: string | null | undefined, agora = Date.now()): string {
  if (!iso) return "nunca";
  const s = Math.round((agora - new Date(iso).getTime()) / 1000);
  if (s < 10) return "agora";
  if (s < 60) return `há ${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `há ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `há ${h}h`;
  return `há ${Math.round(h / 24)}d`;
}

const AVATAR_CORES = ["bg-teal-600", "bg-sky-600", "bg-violet-600", "bg-amber-600", "bg-rose-600", "bg-emerald-600"];
export function hashTexto(texto: string): number {
  let h = 0;
  for (const c of texto) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

export { normalizarNome } from "@shared/nomes";

export function iniciais(nome: string): string {
  return nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

export function corAvatar(nome: string): string {
  return AVATAR_CORES[hashTexto(nome) % AVATAR_CORES.length]!;
}
