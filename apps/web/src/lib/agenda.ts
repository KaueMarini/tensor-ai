export type TipoEvento = "sprint" | "feriado" | "ausencia" | "entrega";

export interface EventoAgenda {
  id: string;
  tipo: TipoEvento;
  inicio: string;
  fim: string;
  texto: string;
  detalhe?: string;
  ausenciaIds?: number[];
  feriadoId?: number;
  projetoId?: string;
  subtexto?: string;
}

export interface Celula {
  data: string;
  dia: number;
  doMes: boolean;
  diaUtil: boolean;
}

export interface EventoDoDia {
  id: string;
  tipo: TipoEvento;
  texto: string;
  detalhe: string;
}

const DIA_MS = 86_400_000;
const p2 = (n: number) => String(n).padStart(2, "0");

export function iso(ano: number, mes0: number, dia: number): string {
  const d = new Date(Date.UTC(ano, mes0, dia));
  return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}`;
}

const utc = (data: string) => Date.parse(`${data.slice(0, 10)}T00:00:00Z`);

export function somarDias(data: string, n: number): string {
  const d = new Date(utc(data) + n * DIA_MS);
  return iso(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export function hojeLocal(agora = new Date()): string {
  return `${agora.getFullYear()}-${p2(agora.getMonth() + 1)}-${p2(agora.getDate())}`;
}

export function ehDiaUtil(data: string): boolean {
  const s = new Date(utc(data)).getUTCDay();
  return s !== 0 && s !== 6;
}

export function lerMes(v: string | undefined): { ano: number; mes0: number } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(v ?? "");
  if (!m) return null;
  const mes = Number(m[2]);
  return mes >= 1 && mes <= 12 ? { ano: Number(m[1]), mes0: mes - 1 } : null;
}

export const chaveMes = (ano: number, mes0: number) => `${ano}-${p2(mes0 + 1)}`;

export function mesVizinho(ano: number, mes0: number, delta: number) {
  const d = new Date(Date.UTC(ano, mes0 + delta, 1));
  return { ano: d.getUTCFullYear(), mes0: d.getUTCMonth() };
}

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
export const nomeMes = (ano: number, mes0: number) => `${MESES[mes0]} de ${ano}`;

export function celulasDoMes(ano: number, mes0: number): Celula[] {
  const primeiro = iso(ano, mes0, 1);
  const inicio = somarDias(primeiro, -new Date(utc(primeiro)).getUTCDay());
  return Array.from({ length: 42 }, (_, i) => {
    const data = somarDias(inicio, i);
    const d = new Date(utc(data));
    return { data, dia: d.getUTCDate(), doMes: d.getUTCMonth() === mes0, diaUtil: ehDiaUtil(data) };
  });
}

export function agruparAusencias<T extends { id: number; pessoaId: string; tipo: string; inicio: string; fim: string }>(
  ausencias: T[],
): (T & { ids: number[] })[] {
  const ordenadas = [...ausencias].sort(
    (a, b) => a.pessoaId.localeCompare(b.pessoaId) || a.tipo.localeCompare(b.tipo) || a.inicio.localeCompare(b.inicio),
  );
  const out: (T & { ids: number[] })[] = [];
  for (const a of ordenadas) {
    const ult = out.at(-1);
    if (ult && ult.pessoaId === a.pessoaId && ult.tipo === a.tipo && a.inicio <= somarDias(ult.fim, 1)) {
      if (a.fim > ult.fim) ult.fim = a.fim;
      ult.ids.push(a.id);
    } else {
      out.push({ ...a, ids: [a.id] });
    }
  }
  return out;
}

const PRIORIDADE: Record<TipoEvento, number> = { feriado: 0, sprint: 1, entrega: 2, ausencia: 3 };

export function eventosPorDia(celulas: Celula[], eventos: EventoAgenda[]): Map<string, EventoDoDia[]> {
  const mapa = new Map<string, EventoDoDia[]>(celulas.map((c) => [c.data, []]));
  const primeiro = celulas[0]?.data ?? "";
  const ultimo = celulas.at(-1)?.data ?? "";
  const por = (data: string, e: EventoAgenda, texto: string) => {
    const lista = mapa.get(data);
    if (lista) lista.push({ id: `${e.id}:${data}`, tipo: e.tipo, texto, detalhe: e.detalhe ?? texto });
  };
  for (const e of eventos) {
    if (e.fim < primeiro || e.inicio > ultimo) continue;
    if (e.tipo === "sprint") {
      por(e.inicio, e, `Início · ${e.texto}`);
      if (e.fim !== e.inicio) por(e.fim, e, `Fim · ${e.texto}`);
    } else if (e.tipo === "ausencia" || e.inicio !== e.fim) {
      for (let d = e.inicio < primeiro ? primeiro : e.inicio; d <= e.fim && d <= ultimo; d = somarDias(d, 1)) {
        if (ehDiaUtil(d)) por(d, e, e.texto);
      }
    } else {
      por(e.inicio, e, e.texto);
    }
  }
  for (const lista of mapa.values()) {
    lista.sort((a, b) => PRIORIDADE[a.tipo] - PRIORIDADE[b.tipo] || a.texto.localeCompare(b.texto, "pt-BR"));
  }
  return mapa;
}

export function proximosEventos(eventos: EventoAgenda[], hoje: string, limite = 9): EventoAgenda[] {
  return eventos
    .filter((e) => e.fim >= hoje)
    .sort((a, b) => a.inicio.localeCompare(b.inicio) || PRIORIDADE[a.tipo] - PRIORIDADE[b.tipo] || a.texto.localeCompare(b.texto, "pt-BR"))
    .slice(0, limite);
}

const ddmm = (data: string) => `${data.slice(8, 10)}/${data.slice(5, 7)}`;

export function rotuloData(e: Pick<EventoAgenda, "inicio" | "fim">): string {
  return e.inicio === e.fim ? ddmm(e.inicio) : `${ddmm(e.inicio)}–${ddmm(e.fim)}`;
}
