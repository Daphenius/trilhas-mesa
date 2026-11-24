import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { makeCena } from "./fake-foundry.mjs";
import { invalidarGrades } from "../scripts/grade.js";
import { estenderRegua, TEMPLATE_ROTULO } from "../scripts/regua.js";

beforeEach(() => invalidarGrades());

class ReguaBase {
  static WAYPOINT_LABEL_TEMPLATE = "templates/hud/waypoint-label.hbs";
  constructor(token) { this.token = token; }
  _getWaypointLabelContext(waypoint) { return { units: "ft", distance: { total: String(waypoint.measurement.distance) } }; }
  _getSegmentStyle() { return { width: 4, color: 0xffffff, alpha: 1 }; }
  _getGridHighlightStyle() { return { color: 0xffffff, alpha: 0.5 }; }
}

const ponto = (custo, extra = {}) => ({
  action: "walk", stage: "planned", userId: "u1", next: null,
  measurement: { cost: custo, distance: custo }, ...extra
});

test("régua: último ponto mostra quanto falta", () => {
  makeCena({ colunas: 5, linhas: 5 });
  const Regua = estenderRegua(ReguaBase);
  assert.equal(Regua.WAYPOINT_LABEL_TEMPLATE, TEMPLATE_ROTULO);
  const r = new Regua({ actor: { system: {} } });
  const ctx = r._getWaypointLabelContext(ponto(15), {});
  assert.equal(ctx.trilhas.classe, "trilhas-sobra");
  assert.match(ctx.trilhas.texto, /Faltam.*"valor":"15"/);
});

test("régua: passou do deslocamento vira aviso e pinta de vermelho", () => {
  makeCena({ colunas: 5, linhas: 5 });
  const r = new (estenderRegua(ReguaBase))({ actor: { system: {} } });
  const ctx = r._getWaypointLabelContext(ponto(40), {});
  assert.equal(ctx.trilhas.classe, "trilhas-excede");
  assert.equal(r._getGridHighlightStyle(ponto(40)).color, 0xd9534f);
  assert.equal(r._getGridHighlightStyle(ponto(20)).color, 0xffffff);
});

test("régua: pontos do meio, de outro jogador ou sem deslocamento ficam como o Foundry fez", () => {
  const cena = makeCena({ colunas: 5, linhas: 5 });
  const r = new (estenderRegua(ReguaBase))({ actor: { system: {} } });
  assert.equal(r._getWaypointLabelContext(ponto(10, { next: {} }), {}).trilhas, undefined);
  assert.equal(r._getWaypointLabelContext(ponto(10, { userId: "outro" }), {}).trilhas, undefined);
  cena.settings.deslocamentoPadrao = 0;
  assert.equal(r._getWaypointLabelContext(ponto(10), {}).trilhas, undefined);
});

test("régua: sistema com modelo próprio mantém o modelo e recebe o texto junto da unidade", () => {
  makeCena({ colunas: 5, linhas: 5 });
  class ReguaSistema extends ReguaBase { static WAYPOINT_LABEL_TEMPLATE = "systems/x/rotulo.hbs"; }
  const Regua = estenderRegua(ReguaSistema);
  assert.equal(Regua.WAYPOINT_LABEL_TEMPLATE, "systems/x/rotulo.hbs");
  const ctx = new Regua({ actor: { system: {} } })._getWaypointLabelContext(ponto(5), {});
  assert.match(ctx.units, /^ft · /);
});

test("régua: no D&D 5e a cor fica com o sistema", () => {
  makeCena({ colunas: 5, linhas: 5 });
  game.system.id = "dnd5e";
  const r = new (estenderRegua(ReguaBase))({ actor: { system: { attributes: { movement: { speeds: { walk: 30 } } } } } });
  assert.equal(r._getGridHighlightStyle(ponto(40)).color, 0xffffff);
  assert.equal(r._getWaypointLabelContext(ponto(10), {}).trilhas.classe, "trilhas-sobra");
});

test("alcance: pinta só as casas que cabem no movimento e respeita paredes", async () => {
  const cena = makeCena({ colunas: 9, linhas: 9, paredes: [[500, 0, 500, 900]] });
  cena.settings.mostrarAlcance = "sempre";
  cena.settings.mostrarDobro = false;
  cena.settings.corAlcance = "#3fa7ff";
  cena.settings.deslocamentoPadrao = 10; // 2 casas
  const pintadas = [];
  canvas.interface = { grid: {
    getHighlightLayer: () => true, addHighlightLayer() {}, clearHighlightLayer() { pintadas.length = 0; },
    highlightPosition: (_n, o) => pintadas.push([o.y / 100, o.x / 100])
  } };
  canvas.visibility = { tokenVision: false };
  foundry.utils.Color = class { static from() { return new this(); } mix() { return this; } };
  globalThis.requestAnimationFrame = fn => { fn(); return 1; };
  const t = cena.token("a", 4, 4, { isOwner: true });
  t.visible = true;
  t.document.isOwner = true;
  canvas.tokens.controlled = [t];
  const { atualizarAlcance } = await import("../scripts/alcance.js");
  atualizarAlcance();
  // 5×5 em volta de (4,4), menos as colunas 5 e 6 (atrás da parede em x=500).
  assert.equal(pintadas.length, 5 * 3);
  assert.ok(pintadas.every(([, c]) => c <= 4));
});
