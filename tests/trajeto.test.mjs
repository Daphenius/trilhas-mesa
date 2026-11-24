import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { makeCena } from "./fake-foundry.mjs";
import { planejarTrajeto } from "../scripts/caminho.js";
import { invalidarGrades } from "../scripts/grade.js";
import { estenderToken } from "../scripts/token.js";

beforeEach(() => invalidarGrades());

const S = 100;
/** Confere que nenhum trecho entre waypoints atravessa parede (centro a centro). */
function semParede(cena, t, pontos) {
  const meio = p => ({ x: p.x + (t.document.width * S) / 2, y: p.y + (t.document.height * S) / 2 });
  for (let k = 1; k < pontos.length; k++) {
    const a = meio(pontos[k - 1]), b = meio(pontos[k]);
    for (const [x1, y1, x2, y2] of cena.paredes) {
      assert.ok(!cena.cruza(a, b, { x: x1, y: y1 }, { x: x2, y: y2 }), `trecho ${k} atravessa parede`);
    }
  }
}
const casa = p => [p.y / S, p.x / S];

// Parede vertical em x = 300 da linha 0 até a linha 4; a passagem fica na linha 5.
const PAREDE = [[300, 0, 300, 500]];

test("arrasto atrás de uma parede: contorna pela passagem", () => {
  const cena = makeCena({ colunas: 8, linhas: 7, paredes: PAREDE });
  const t = cena.token("a", 1, 1);
  const pontos = planejarTrajeto(t, [cena.ponto(t, 1, 1), cena.ponto(t, 1, 5)]);
  assert.ok(pontos, "devia mudar o trajeto");
  assert.deepEqual(casa(pontos.at(-1)), [1, 5]);
  assert.ok(pontos.some(p => casa(p)[0] >= 4), "tem que descer até a passagem");
  semParede(cena, t, pontos);
  assert.ok(pontos.slice(1, -1).every(p => p.explicit === false && p.checkpoint === false));
  assert.equal(pontos.at(-1).explicit, true, "o destino original continua como o jogador marcou");
});

test("passo de uma casa (teclado) não é desviado", () => {
  const cena = makeCena({ colunas: 8, linhas: 7, paredes: PAREDE });
  const t = cena.token("a", 1, 2);
  assert.equal(planejarTrajeto(t, [cena.ponto(t, 1, 2), cena.ponto(t, 1, 3)]), null);
});

test("teletransporte não é desviado", () => {
  const cena = makeCena({ colunas: 8, linhas: 7, paredes: PAREDE });
  const t = cena.token("a", 1, 1);
  assert.equal(planejarTrajeto(t, [cena.ponto(t, 1, 1), cena.ponto(t, 1, 5, { action: "blink" })]), null);
});

test("caminho livre em linha reta continua com 2 pontos", () => {
  const cena = makeCena({ colunas: 8, linhas: 7 });
  const t = cena.token("a", 1, 1);
  assert.equal(planejarTrajeto(t, [cena.ponto(t, 1, 1), cena.ponto(t, 1, 6)]), null);
});

test("vários waypoints do jogador: cada trecho é planejado e os pontos marcados ficam", () => {
  const cena = makeCena({ colunas: 8, linhas: 7, paredes: PAREDE });
  const t = cena.token("a", 1, 1);
  const marcados = [cena.ponto(t, 1, 1), cena.ponto(t, 1, 5), cena.ponto(t, 3, 1)];
  const pontos = planejarTrajeto(t, marcados);
  assert.ok(pontos.includes(marcados[1]) && pontos.includes(marcados[2]));
  semParede(cena, t, pontos);
});

test("destino fechado: o destino original fica no fim para a régua marcar o resto como inalcançável", () => {
  // Caixa fechada em volta da casa (1,5)
  const paredes = [[500, 100, 600, 100], [500, 200, 600, 200], [500, 100, 500, 200], [600, 100, 600, 200]];
  const cena = makeCena({ colunas: 8, linhas: 7, paredes });
  const t = cena.token("a", 1, 1);
  const pontos = planejarTrajeto(t, [cena.ponto(t, 1, 1), cena.ponto(t, 1, 5)]);
  const final = pontos ?? [];
  assert.deepEqual(casa(final.at(-1) ?? cena.ponto(t, 1, 5)), [1, 5]);
});

test("NPC com orçamento: para quando acaba o movimento", () => {
  const cena = makeCena({ colunas: 12, linhas: 3 });
  const t = cena.token("a", 1, 0);
  const pontos = planejarTrajeto(t, [cena.ponto(t, 1, 0), cena.ponto(t, 1, 10)], { orcamento: 30 });
  assert.deepEqual(casa(pontos.at(-1)), [1, 6], "30 pés = 6 casas");
});

test("NPC desvia de outro token no caminho", () => {
  const cena = makeCena({ colunas: 7, linhas: 3 });
  const t = cena.token("a", 1, 0);
  cena.token("b", 1, 3);
  const pontos = planejarTrajeto(t, [cena.ponto(t, 1, 0), cena.ponto(t, 1, 6)], { evitarTokens: true });
  assert.ok(pontos, "devia desviar");
  // Nenhum ponto dentro da casa ocupada, e os trechos não passam pelo centro dela.
  assert.ok(!pontos.some(p => casa(p)[0] === 1 && casa(p)[1] === 3));
  assert.ok(pontos.some(p => casa(p)[0] !== 1), "sai da linha 1 para contornar");
});

test("arrasto do jogador não desvia de tokens (só o NPC)", () => {
  const cena = makeCena({ colunas: 7, linhas: 3 });
  const t = cena.token("a", 1, 0);
  cena.token("b", 1, 3);
  assert.equal(planejarTrajeto(t, [cena.ponto(t, 1, 0), cena.ponto(t, 1, 6)]), null);
});

test("Região intransponível: o caminho contorna", () => {
  const casas = [[0, 3], [1, 3], [2, 3], [3, 3]];
  const cena = makeCena({ colunas: 7, linhas: 5, regioes: [{ casas, dificuldade: Infinity }] });
  const t = cena.token("a", 1, 0);
  const pontos = planejarTrajeto(t, [cena.ponto(t, 1, 0), cena.ponto(t, 1, 6)]);
  assert.ok(pontos.some(p => casa(p)[0] === 4), "passa pela linha 4, fora da Região");
});

test("Região que bloqueia só quem anda: voando passa reto", () => {
  const casas = [[0, 3], [1, 3], [2, 3], [3, 3]];
  const cena = makeCena({ colunas: 7, linhas: 5, regioes: [{ casas, dificuldade: Infinity, acoes: ["walk"] }] });
  const t = cena.token("a", 1, 0);
  const voo = planejarTrajeto(t, [cena.ponto(t, 1, 0, { action: "fly" }), cena.ponto(t, 1, 6, { action: "fly" })]);
  assert.equal(voo, null);
});

test("terreno difícil: contorna quando sai mais barato", () => {
  const casas = [[1, 2], [1, 3], [1, 4]];
  const cena = makeCena({ colunas: 7, linhas: 3, regioes: [{ casas, dificuldade: 2 }] });
  const t = cena.token("a", 1, 0);
  const pontos = planejarTrajeto(t, [cena.ponto(t, 1, 0), cena.ponto(t, 1, 6)]);
  assert.ok(pontos, "devia contornar");
  const dificil = new Set(casas.map(c => c.join(",")));
  assert.ok(pontos.every(p => !dificil.has(casa(p).join(","))), "nenhum ponto no difícil");
});

test("token 2×2 passa só por onde cabe", () => {
  // Parede vertical em x=300 com passagem de 1 casa (linha 3) e outra de 2 casas (linhas 5-6).
  const paredes = [[300, 0, 300, 300], [300, 400, 300, 500]];
  const cena = makeCena({ colunas: 8, linhas: 7, paredes });
  const t = cena.token("g", 0, 0, { width: 2, height: 2 });
  const pontos = planejarTrajeto(t, [cena.ponto(t, 0, 0), cena.ponto(t, 0, 5)]);
  assert.ok(pontos);
  semParede(cena, t, pontos);
});

test("findMovementPath estendido entrega o trajeto novo ao Foundry e tira a opção do módulo", async () => {
  const cena = makeCena({ colunas: 8, linhas: 7, paredes: PAREDE });
  const Classe = estenderToken(cena.TokenBase);
  const t = new Classe(cena.token("a", 1, 1).document);
  const job = t.findMovementPath([cena.ponto(t, 1, 1), cena.ponto(t, 1, 5)], { preview: true, "trilhas-mesa": { forcar: true } });
  const caminho = await job.promise;
  assert.ok(caminho.length > 2);
  assert.deepEqual(t.recebido.options, { preview: true });
});

test("com a opção de desviar desligada, o arrasto segue o Foundry", async () => {
  const cena = makeCena({ colunas: 8, linhas: 7, paredes: PAREDE });
  cena.settings.desviarAoArrastar = false;
  const Classe = estenderToken(cena.TokenBase);
  const t = new Classe(cena.token("a", 1, 1).document);
  const original = [cena.ponto(t, 1, 1), cena.ponto(t, 1, 5)];
  t.findMovementPath(original, {});
  assert.equal(t.recebido.waypoints, original);
});

test("se o cálculo falhar, o Foundry recebe os waypoints originais", () => {
  const cena = makeCena({ colunas: 8, linhas: 7, paredes: PAREDE });
  const Classe = estenderToken(class extends cena.TokenBase { checkCollision() { throw new Error("x"); } });
  const t = new Classe(cena.token("a", 1, 1).document);
  const original = [cena.ponto(t, 1, 1), cena.ponto(t, 1, 5)];
  const avisos = console.warn, erros = console.error;
  console.warn = () => {}; console.error = () => {};
  try { t.findMovementPath(original, {}); } finally { console.warn = avisos; console.error = erros; }
  assert.ok(Array.isArray(t.recebido.waypoints));
});

test("cache: o segundo cálculo na mesma cena quase não testa parede de novo", () => {
  const cena = makeCena({ colunas: 30, linhas: 30, paredes: PAREDE });
  const t = cena.token("a", 1, 1);
  planejarTrajeto(t, [cena.ponto(t, 1, 1), cena.ponto(t, 1, 5)]);
  const primeira = cena.colisoes.n;
  planejarTrajeto(t, [cena.ponto(t, 1, 1), cena.ponto(t, 1, 5)]);
  assert.equal(cena.colisoes.n, primeira);
});
