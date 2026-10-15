// Regras de calendário dos lembretes. Mesma lógica usada no app (app.js → proximoLembrete).

export type ConfigLembretes = {
  dias: number[];               // dias do mês; 31 = último dia
  hora: number;                 // hora de Brasília
  antecipar_fds: boolean;       // sábado/domingo → sexta anterior
  atraso_dia_semana: number | null;
};

export function ultimoDia(ano: number, mes: number) {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}
export function diaSemana(ano: number, mes: number, dia: number) {
  return new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay();
}

/** Dias deste mês em que cai um lembrete de repasse, já ajustados. */
export function diasEfetivos(ano: number, mes: number, cfg: ConfigLembretes): number[] {
  const ult = ultimoDia(ano, mes);
  const out = new Set<number>();
  for (const d of cfg.dias || []) {
    let alvo = Math.min(Math.max(1, d), ult);
    if (cfg.antecipar_fds) {
      const ws = diaSemana(ano, mes, alvo);
      const ajustado = ws === 6 ? alvo - 1 : ws === 0 ? alvo - 2 : alvo;
      if (ajustado >= 1) alvo = ajustado;
    }
    out.add(alvo);
  }
  return [...out].sort((a, b) => a - b);
}

export function ehDiaDeFechamento(ano: number, mes: number, dia: number, cfg: ConfigLembretes) {
  return diasEfetivos(ano, mes, cfg).includes(dia);
}
export function ehDiaDeAtraso(ano: number, mes: number, dia: number, cfg: ConfigLembretes) {
  return cfg.atraso_dia_semana != null && diaSemana(ano, mes, dia) === cfg.atraso_dia_semana;
}

/** Último dia do mês, antecipado para sexta se cair no fim de semana (revisão do mês). */
export function diaDaRevisao(ano: number, mes: number, antecipar = true) {
  let d = ultimoDia(ano, mes);
  if (antecipar) { const ws = diaSemana(ano, mes, d); d = ws === 6 ? d - 1 : ws === 0 ? d - 2 : d; }
  return d;
}

/** Data e hora de Brasília agora. */
export function agoraBrasilia(base = new Date()) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23",
    }).formatToParts(base).map((x) => [x.type, x.value]),
  );
  const ano = +p.year, mes = +p.month, dia = +p.day, hora = +p.hour % 24;
  return { ano, mes, dia, hora, ym: `${p.year}-${p.month}`, iso: `${p.year}-${p.month}-${p.day}` };
}
