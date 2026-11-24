import { test } from "node:test";
import assert from "node:assert/strict";
import { Grade, DIAGONAIS, cortarCaminho, pontosDeVirada } from "../scripts/motor.js";

// Desenho de mapa: "." livre, "#" bloqueado, "d" difícil (custo 2).
function mapa(linhas, opcoes = {}) {
  const altura = linhas.length, largura = linhas[0].length;
  const custo = cel => {
    const ch = linhas[Math.floor(cel / largura)][cel % largura];
    return ch === "#" ? Infinity : ch === "d" ? 2 : 1;
  };
  return new Grade({ largura, altura, distancia: 5, custo, ...opcoes });
}
const cel = (g, l, c) => g.celula(l, c);

test("campo aberto: diagonal custa o mesmo que reto (5/5/5)", () => {
  const g = mapa(Array(10).fill(".........."));
  const r = g.caminho(cel(g, 0, 0), cel(g, 6, 3));
  assert.equal(r.completo, true);
  assert.equal(r.custo, 30);
});

test("parede com uma passagem: o caminho passa pela brecha", () => {
  const g = mapa([
    ".....",
    "####.",
    ".....",
  ]);
  const r = g.caminho(cel(g, 0, 0), cel(g, 2, 0));
  assert.equal(r.completo, true);
  assert.ok(r.celulas.includes(cel(g, 1, 4)), "tem que passar pela brecha");
  assert.equal(r.custo, 40); // 4 casas até a brecha (com diagonais) + 4 de volta
});

test("terreno difícil: contorna quando sai mais barato", () => {
  const g = mapa([
    ".....",
    ".ddd.",
    ".....",
  ], { diagonais: DIAGONAIS.ILLEGAL });
  const r = g.caminho(cel(g, 1, 0), cel(g, 1, 4));
  // Reto pelo difícil: 10+10+10+5 = 35. Contornando: 1 acima, 4 para o lado, 1 abaixo = 30.
  assert.equal(r.custo, 30);
  assert.ok(!r.celulas.includes(cel(g, 1, 2)));
});

test("terreno difícil sem saída barata: atravessa pagando o dobro", () => {
  const g = mapa([
    "#####",
    ".ddd.",
    "#####",
  ], { diagonais: DIAGONAIS.ILLEGAL });
  const r = g.caminho(cel(g, 1, 0), cel(g, 1, 4));
  assert.equal(r.custo, 10 + 10 + 10 + 5);
});

test("regra 5/10/5: diagonais alternam o custo", () => {
  const g = mapa(Array(6).fill("......"), { diagonais: DIAGONAIS.ALTERNATING_1 });
  assert.equal(g.caminho(cel(g, 0, 0), cel(g, 1, 1)).custo, 5);
  assert.equal(g.caminho(cel(g, 0, 0), cel(g, 2, 2)).custo, 15);
  assert.equal(g.caminho(cel(g, 0, 0), cel(g, 3, 3)).custo, 20);
  assert.equal(g.caminho(cel(g, 0, 0), cel(g, 4, 4)).custo, 30);
});

test("regra 10/5/10", () => {
  const g = mapa(Array(6).fill("......"), { diagonais: DIAGONAIS.ALTERNATING_2 });
  assert.equal(g.caminho(cel(g, 0, 0), cel(g, 1, 1)).custo, 10);
  assert.equal(g.caminho(cel(g, 0, 0), cel(g, 2, 2)).custo, 15);
});

test("diagonal exata e aproximada", () => {
  const exata = mapa(Array(4).fill("...."), { diagonais: DIAGONAIS.EXACT });
  assert.ok(Math.abs(exata.caminho(0, exata.celula(2, 2)).custo - 10 * Math.SQRT2) < 1e-9);
  const aprox = mapa(Array(4).fill("...."), { diagonais: DIAGONAIS.APPROXIMATE });
  assert.equal(aprox.caminho(0, aprox.celula(2, 2)).custo, 15);
});

test("sem diagonais: só movimentos retos", () => {
  const g = mapa(Array(5).fill("....."), { diagonais: DIAGONAIS.ILLEGAL });
  assert.equal(g.caminho(cel(g, 0, 0), cel(g, 3, 2)).custo, 25);
});

test("destino cercado: devolve o caminho até a casa mais perto", () => {
  const g = mapa([
    ".....",
    "..###",
    "..#.#",
    "..###",
  ]);
  const r = g.caminho(cel(g, 0, 0), cel(g, 2, 3));
  assert.equal(r.completo, false);
  const ultima = g.posicao(r.celulas.at(-1));
  assert.ok(Math.hypot(ultima.linha - 2, ultima.coluna - 3) <= 2 + 1e-9, `parou longe: ${JSON.stringify(ultima)}`);
});

test("destino cercado com terreno mais barato que o normal (custoMinimo 0)", () => {
  const g = mapa([
    ".....",
    "..###",
    "..#.#",
    "..###",
  ], { custoMinimo: 0 });
  const r = g.caminho(cel(g, 0, 0), cel(g, 2, 3));
  assert.equal(r.completo, false);
  assert.ok(r.celulas.length > 1, "tem que andar até perto do destino");
});

test("parede entre casas (livre) bloqueia só aquela passagem e só naquele sentido", () => {
  // Parede de mão única entre (0,0) e (0,1): de 0 para 1 não passa; o contrário passa.
  const g = new Grade({
    largura: 2, altura: 1, distancia: 5,
    livre: (de, para) => !(de === 0 && para === 1)
  });
  assert.equal(g.caminho(0, 1).completo, false);
  assert.equal(g.caminho(1, 0).completo, true);
});

test("alcance: 30 pés em campo aberto 5/5/5 = quadrado 13×13", () => {
  const g = mapa(Array(21).fill(".".repeat(21)));
  const alcance = g.alcance(g.celula(10, 10), 30);
  assert.equal(alcance.size, 169);
  assert.equal(alcance.get(g.celula(10, 10)), 0);
  assert.equal(alcance.get(g.celula(4, 4)), 30);
});

test("alcance: 30 pés na regra 5/10/5", () => {
  const g = mapa(Array(21).fill(".".repeat(21)), { diagonais: DIAGONAIS.ALTERNATING_1 });
  const alcance = g.alcance(g.celula(10, 10), 30);
  let esperado = 0;
  for (let dl = -10; dl <= 10; dl++) for (let dc = -10; dc <= 10; dc++) {
    const menor = Math.min(Math.abs(dl), Math.abs(dc)), maior = Math.max(Math.abs(dl), Math.abs(dc));
    if ((maior + Math.floor(menor / 2)) * 5 <= 30) esperado++;
  }
  assert.equal(alcance.size, esperado);
});

test("alcance para no terreno difícil e nas paredes", () => {
  const g = mapa([
    "......",
    ".####.",
    ".#..d.",
    ".#....",
  ]);
  const alcance = g.alcance(g.celula(2, 2), 5);
  assert.ok(alcance.has(g.celula(2, 3)));
  assert.ok(!alcance.has(g.celula(2, 4)), "difícil custa 10, não cabe em 5");
  assert.ok(!alcance.has(g.celula(1, 2)), "parede");
});

test("A* e Dijkstra concordam em mapas aleatórios", () => {
  let semente = 42;
  const aleatorio = () => (semente = (semente * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (const diagonais of [0, 1, 2, 3, 4, 5, 6]) {
    for (let rodada = 0; rodada < 6; rodada++) {
      const largura = 18, altura = 14;
      const custos = Array.from({ length: largura * altura }, () => {
        const r = aleatorio();
        return r < 0.18 ? Infinity : r < 0.35 ? 2 : r < 0.4 ? 3 : r < 0.45 ? 0.5 : 1;
      });
      const paredes = new Set();
      for (let k = 0; k < 60; k++) paredes.add(`${Math.floor(aleatorio() * largura * altura)}:${Math.floor(aleatorio() * 8)}`);
      const g = new Grade({
        largura, altura, distancia: 5, diagonais, custoMinimo: 0.5,
        custo: c => custos[c],
        livre: (de, para, d) => !paredes.has(`${de}:${d}`)
      });
      custos[0] = 1;
      const alcance = g.alcance(0, Infinity);
      for (let k = 0; k < 25; k++) {
        const destino = Math.floor(aleatorio() * largura * altura);
        const r = g.caminho(0, destino);
        if (alcance.has(destino)) {
          assert.equal(r.completo, true, `modo ${diagonais}: devia chegar em ${destino}`);
          assert.ok(Math.abs(r.custo - alcance.get(destino)) < 1e-6, `modo ${diagonais}: ${r.custo} ≠ ${alcance.get(destino)}`);
        } else {
          assert.equal(r.completo, false, `modo ${diagonais}: ${destino} é inalcançável`);
        }
      }
    }
  }
});

test("cortarCaminho para no orçamento", () => {
  const caminho = { celulas: [1, 2, 3, 4], custos: [0, 5, 15, 20], custo: 20, completo: true };
  const cortado = cortarCaminho(caminho, 15);
  assert.deepEqual(cortado.celulas, [1, 2, 3]);
  assert.equal(cortado.completo, false);
  assert.equal(cortarCaminho(caminho, 99).completo, true);
  assert.deepEqual(cortarCaminho(caminho, 0).celulas, [1]);
});

test("pontosDeVirada junta trechos retos", () => {
  const largura = 10;
  // (0,0)→(0,1)→(0,2)→(1,3)→(2,4)→(2,5)
  const celulas = [0, 1, 2, 13, 24, 25];
  assert.deepEqual(pontosDeVirada(celulas, largura), [0, 2, 4, 5]);
  assert.deepEqual(pontosDeVirada([7], largura), [0]);
});

test("limite: destino fechado não faz varrer o mapa inteiro", () => {
  let testes = 0;
  const lado = 200;
  const g = new Grade({
    largura: lado, altura: lado, distancia: 5,
    custo: c => (c === lado * 10 + 10 ? Infinity : 1),
    livre: () => { testes++; return true; }
  });
  const r = g.caminho(g.celula(5, 5), g.celula(10, 10), { limite: 200 });
  assert.equal(r.completo, false);
  assert.ok(testes < 20000, `testou ${testes} passagens`);
  const ultima = g.posicao(r.celulas.at(-1));
  assert.ok(Math.max(Math.abs(ultima.linha - 10), Math.abs(ultima.coluna - 10)) === 1);
});

test("limite folgado não muda o caminho ótimo", () => {
  const g = mapa([
    ".....",
    "####.",
    ".....",
  ]);
  assert.equal(g.caminho(g.celula(0, 0), g.celula(2, 0), { limite: 1000 }).custo, 40);
});
