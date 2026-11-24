// Mestre: o token selecionado anda sozinho até o ponto embaixo do cursor, desviando de paredes.

import { MODULE_ID, config, t } from "./config.js";
import { gradeSuportada } from "./grade.js";
import { restanteNoTurno } from "./deslocamento.js";

let emAndamento = false;

export async function moverAteCursor() {
  if (!game.user.isGM || !canvas?.ready || emAndamento) return;
  const tokens = canvas.tokens.controlled;
  if (!tokens.length) {
    ui.notifications.warn(t("Npc.SemToken"));
    return;
  }
  const cursor = canvas.mousePosition;
  if (!cursor) return;
  emAndamento = true;
  try {
    // Um de cada vez: o segundo já desvia do primeiro na posição nova.
    for (const token of tokens) await moverToken(token, cursor);
  } finally {
    emAndamento = false;
  }
}

async function moverToken(token, cursor) {
  const doc = token.document;
  if (!gradeSuportada(token)) {
    ui.notifications.warn(t("Npc.GradeNaoSuportada", { nome: doc.name }));
    return;
  }
  const size = canvas.grid.size;
  const alvo = token.getSnappedPosition({ x: cursor.x - (doc.width * size) / 2, y: cursor.y - (doc.height * size) / 2 });
  if (alvo.x === doc.x && alvo.y === doc.y) return;

  let orcamento = Infinity;
  if (config("npcLimitarTurno") && doc.inCombat) {
    const restante = restanteNoTurno(token);
    if (restante > 0) orcamento = restante;
    else if (restante === 0 && doc.actor) {
      ui.notifications.info(t("Npc.SemMovimento", { nome: doc.name }));
      return;
    }
  }

  const base = {
    elevation: doc.elevation, width: doc.width, height: doc.height, shape: doc.shape,
    action: doc.movementAction, snapped: true, explicit: true, checkpoint: true
  };
  if (doc.level !== undefined) base.level = doc.level;
  const origem = { ...base, x: doc.x, y: doc.y };
  const destino = { ...base, x: Math.round(alvo.x), y: Math.round(alvo.y) };

  const job = token.findMovementPath([origem, destino], {
    [MODULE_ID]: { forcar: true, evitarTokens: config("npcEvitarTokens"), orcamento }
  });
  const trajeto = await job.promise;
  if (!trajeto || trajeto.length < 2) {
    ui.notifications.warn(t("Npc.SemCaminho", { nome: doc.name }));
    return;
  }
  const passos = trajeto.slice(1).map(({ x, y, elevation, width, height, shape, action, snapped, explicit, checkpoint, level }) => {
    const ponto = { x, y, elevation, width, height, shape, action, snapped, explicit, checkpoint };
    if (level !== undefined) ponto.level = level;
    return ponto;
  });
  await doc.move(passos, { showRuler: true });
}
