import { config } from "./config.js";

/**
 * Deslocamento do ator para uma ação de movimento (andar, voar...), nas unidades da cena.
 * Ordem: atributo escolhido nas configurações → D&D 5e → deslocamento padrão das configurações.
 * Devolve 0 quando não há como saber (aí o módulo não mostra alcance nem "faltam").
 */
export function deslocamento(actor, acao = "walk") {
  if (!actor) return 0;
  const caminho = config("atributoDeslocamento")?.trim();
  if (caminho) {
    const valor = Number(foundry.utils.getProperty(actor, caminho));
    if (valor > 0) return valor;
  }
  const movimento = actor.system?.attributes?.movement;
  if (movimento && game.system?.id === "dnd5e") {
    const velocidades = movimento.speeds ?? movimento;
    const daAcao = Number(velocidades?.[acao]) || 0;
    const andar = Number(velocidades?.walk) || 0;
    // Como no D&D 5e: ações sem deslocamento próprio usam o de andar.
    const tipos = CONFIG.DND5E?.movementTypes;
    const usaAndar = !tipos?.[acao] || tipos[acao]?.walkFallback;
    const valor = usaAndar ? Math.max(daAcao, andar) : daAcao;
    if (valor > 0) return valor;
  }
  return Math.max(0, Number(config("deslocamentoPadrao")) || 0);
}

/** Quanto o token já andou no turno atual (só conta em combate). */
export function usadoNoTurno(tokenDoc) {
  if (!tokenDoc?.inCombat) return 0;
  let total = 0;
  for (const ponto of tokenDoc.movementHistory ?? []) {
    const custo = Number(ponto.cost);
    if (Number.isFinite(custo)) total += custo;
  }
  return total;
}

/** Movimento que ainda sobra neste turno, ou 0 se o deslocamento for desconhecido. */
export function restanteNoTurno(token, acao) {
  const doc = token.document ?? token;
  const total = deslocamento(doc.actor, acao ?? doc.movementAction);
  if (!total) return 0;
  return Math.max(0, total - usadoNoTurno(doc));
}
