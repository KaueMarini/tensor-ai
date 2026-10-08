// Últimos projetos abertos (por navegador). Com muitos projetos, a sidebar mostra só estes.

import { useSyncExternalStore } from "react";

const CHAVE = "projetos_recentes";
const MAX = 5;
const EVENTO = "projetos-recentes";

let cache: string[] | null = null;

function ler(): string[] {
  if (cache) return cache;
  try {
    const v = JSON.parse(localStorage.getItem(CHAVE) ?? "[]");
    cache = Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, MAX) : [];
  } catch {
    cache = [];
  }
  return cache;
}

export function registrarRecente(id: string) {
  const atual = ler();
  if (atual[0] === id) return;
  cache = [id, ...atual.filter((x) => x !== id)].slice(0, MAX);
  try {
    localStorage.setItem(CHAVE, JSON.stringify(cache));
  } catch {
    // sem storage (modo privado): a lista vale só para esta aba
  }
  window.dispatchEvent(new Event(EVENTO));
}

export function esquecerRecente(id: string) {
  cache = ler().filter((x) => x !== id);
  try {
    localStorage.setItem(CHAVE, JSON.stringify(cache));
  } catch {
    // idem
  }
  window.dispatchEvent(new Event(EVENTO));
}

function assinar(cb: () => void) {
  window.addEventListener(EVENTO, cb);
  return () => window.removeEventListener(EVENTO, cb);
}

export function useRecentes(): string[] {
  return useSyncExternalStore(assinar, ler, () => []);
}
