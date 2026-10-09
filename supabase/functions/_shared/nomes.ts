// Nomes de pessoas como chegam do Azure DevOps ("KAUÊ NEBOT MARINI") viram "Kauê Nebot Marini".
// Usado pelo front e pelo agente, para o nome ser igual na tela e nas sugestões.

const MINUSCULAS = new Set(["da", "de", "do", "das", "dos", "e"]);

export function normalizarNome(nome: string): string {
  if (nome !== nome.toUpperCase()) return nome;
  return nome
    .toLowerCase()
    .split(/\s+/)
    .map((p, i) => (i > 0 && MINUSCULAS.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(" ");
}
