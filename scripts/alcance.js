// Pinta no mapa as casas que o token selecionado alcança no turno, com as camadas de destaque nativas da grade.

import { MODULE_ID, config } from "./config.js";
import { gradeDoToken, gradeSuportada } from "./grade.js";
import { deslocamento, usadoNoTurno } from "./deslocamento.js";

const CAMADA = `${MODULE_ID}.alcance`;
const MAX_TOKENS = 4;
let ligadoPeloAtalho = true;
let agendado = null;

/** Liga ou desliga a pintura (atalho de teclado). */
export function alternarAlcance() {
  ligadoPeloAtalho = !ligadoPeloAtalho;
  atualizarAlcance();
  return ligadoPeloAtalho;
}

/** Redesenha no próximo quadro, juntando vários pedidos seguidos em um só. */
export function atualizarAlcance() {
  if (agendado) return;
  agendado = requestAnimationFrame(() => {
    agendado = null;
    try {
      desenhar();
    } catch (err) {
      console.error(`${MODULE_ID} | Falha ao pintar o alcance.`, err);
    }
  });
}

function camada() {
  const grid = canvas.interface?.grid;
  if (!grid) return null;
  if (!grid.getHighlightLayer(CAMADA)) grid.addHighlightLayer(CAMADA);
  grid.clearHighlightLayer(CAMADA);
  return grid;
}

function deveMostrar(token) {
  const modo = config("mostrarAlcance");
  if (modo === "nunca" || !ligadoPeloAtalho) return false;
  if (!token.document.isOwner || !token.visible) return false;
  if (modo === "combate" && !token.document.inCombat) return false;
  return gradeSuportada(token);
}

function desenhar() {
  if (!canvas?.ready) return;
  const grid = camada();
  if (!grid) return;
  const tokens = canvas.tokens.controlled.filter(deveMostrar).slice(0, MAX_TOKENS);
  if (!tokens.length) return;

  const { Color } = foundry.utils;
  const cor = Color.from(config("corAlcance") || "#3fa7ff");
  const corDobro = cor.mix(Color.from(0xffffff), 0.45);
  const dobro = config("mostrarDobro");
  const checarVisao = !game.user.isGM && canvas.visibility?.tokenVision;
  const size = canvas.grid.size;
  // casa → true se só entra com a Disparada (dobro). Uma casa normal de qualquer token vence.
  const casas = new Map();
  let ctxDesenho = null;

  for (const token of tokens) {
    const doc = token.document;
    const total = deslocamento(doc.actor, doc.movementAction);
    if (!total) continue;
    const orcamento = Math.max(0, total - usadoNoTurno(doc));
    const ctx = gradeDoToken(token);
    ctxDesenho ??= ctx;
    const origem = ctx.ancora(doc);
    if (origem < 0) continue;
    const alcance = ctx.grade.alcance(origem, dobro ? orcamento + total : orcamento);
    for (const [cel, custo] of alcance) {
      const extra = custo > orcamento + 1e-9;
      for (const casa of ctx.cobertas(cel)) {
        if (!casas.has(casa) || (casas.get(casa) && !extra)) casas.set(casa, extra);
      }
    }
  }

  for (const [casa, extra] of casas) {
    const ponto = ctxDesenho.topoEsquerdo(casa);
    const centro = { x: ponto.x + size / 2, y: ponto.y + size / 2 };
    if (checarVisao && !canvas.visibility.testVisibility(centro, { tolerance: size / 4 })) continue;
    grid.highlightPosition(CAMADA, {
      x: ponto.x, y: ponto.y,
      color: extra ? corDobro : cor,
      border: null,
      alpha: extra ? 0.15 : 0.28
    });
  }
}

/** Ganchos que pedem redesenho. */
export function registrarGanchosDoAlcance() {
  Hooks.on("controlToken", atualizarAlcance);
  Hooks.on("canvasReady", atualizarAlcance);
  Hooks.on("updateToken", (doc, mudancas) => {
    const relevante = ["x", "y", "elevation", "width", "height", "shape", "movementAction", "_movementHistory"]
      .some(campo => campo in mudancas);
    if (relevante && canvas.tokens.controlled.some(t => t.document === doc || t.document.id === doc.id)) atualizarAlcance();
  });
  for (const gancho of ["updateCombat", "deleteCombat", "createCombatant", "deleteCombatant", "updateActor"]) {
    Hooks.on(gancho, atualizarAlcance);
  }
}
