// Ponte entre a cena do Foundry e o motor: transforma paredes, Regiões e tokens em uma Grade.
// Tudo que é caro (teste de parede, terreno) é calculado sob demanda e guardado até a cena mudar.

import { Grade } from "./motor.js";
import { MODULE_ID } from "./config.js";

const caches = new Map();

/** Esquece tudo o que foi calculado (parede, porta, Região ou cena mudou). */
export function invalidarGrades() {
  caches.clear();
}

/** O módulo só trabalha em grade quadrada e com tokens de tamanho inteiro (1×1, 2×2...). */
export function gradeSuportada(token, largura, altura) {
  const grid = canvas?.grid;
  if (!grid?.isSquare) return false;
  const doc = token.document ?? token;
  const w = largura ?? doc.width, h = altura ?? doc.height;
  return Number.isInteger(w) && Number.isInteger(h) && w >= 1 && h >= 1;
}

/** Limites da área da cena (sem a borda de fora), em casas. */
function limitesDaCena() {
  const grid = canvas.grid;
  const rect = canvas.dimensions.sceneRect;
  const size = grid.size;
  const i0 = Math.floor(rect.y / size), j0 = Math.floor(rect.x / size);
  const i1 = Math.ceil((rect.y + rect.height) / size), j1 = Math.ceil((rect.x + rect.width) / size);
  return { i0, j0, altura: i1 - i0, largura: j1 - j0, size };
}

/** Regiões da cena com algum comportamento que pode mudar o custo do movimento. */
function regioesDeTerreno(scene) {
  const lista = [];
  // Só interessam comportamentos que mudam o terreno (o tipo base não muda nada).
  const padrao = foundry.data.regionBehaviors?.RegionBehaviorType?.prototype?._getTerrainEffects;
  for (const region of scene.regions ?? []) {
    const comportamentos = region.behaviors.filter(b => !b.disabled
      && typeof b.system?._getTerrainEffects === "function" && b.system._getTerrainEffects !== padrao);
    if (comportamentos.length) lista.push({ region, comportamentos });
  }
  return lista;
}

/**
 * Monta (ou reaproveita) a grade de um token para uma ação de movimento.
 * @param {Token} token  O token (placeable)
 * @param {object} [opcoes]
 * @param {string} [opcoes.acao]        Ação de movimento (walk, fly...)
 * @param {number} [opcoes.elevacao]
 * @param {number} [opcoes.largura]     Tamanho do token em casas
 * @param {number} [opcoes.altura]
 * @param {number} [opcoes.forma]
 * @param {boolean} [opcoes.evitarTokens] Tratar casas com outros tokens como bloqueadas
 */
export function gradeDoToken(token, opcoes = {}) {
  const doc = token.document;
  const scene = doc.parent;
  const acao = opcoes.acao ?? doc.movementAction;
  const elevacao = opcoes.elevacao ?? doc.elevation;
  const w = opcoes.largura ?? doc.width, h = opcoes.altura ?? doc.height;
  const forma = opcoes.forma ?? doc.shape;
  const level = opcoes.level ?? doc.level;
  const lim = limitesDaCena();
  const { i0, j0, largura, altura, size } = lim;
  const total = largura * altura;

  const chave = [scene.id, doc.id, acao, elevacao, w, h, forma, level, largura, altura, i0, j0, canvas.grid.diagonals].join("|");
  let cache = caches.get(chave);
  if (!cache) {
    cache = { custo: new Float32Array(total).fill(NaN), passagem: new Uint8Array(total * 8) };
    caches.set(chave, cache);
  }

  const regioes = regioesDeTerreno(scene);
  const TerrainData = CONFIG.Token.movement?.TerrainData;
  const actionConfig = CONFIG.Token.movement?.actions?.[acao] ?? {};
  const segmento = { width: w, height: h, shape: forma, level, action: acao, preview: false };
  let funcaoCusto;
  try {
    funcaoCusto = token._getMovementCostFunction?.({});
  } catch (err) {
    console.warn(`${MODULE_ID} | Não foi possível ler a função de custo do token.`, err);
  }

  const topoEsquerdo = cel => {
    const l = Math.floor(cel / largura), c = cel - l * largura;
    return canvas.grid.getTopLeftPoint({ i: l + i0, j: c + j0 });
  };
  const centro = cel => {
    const p = topoEsquerdo(cel);
    return { x: p.x + (w * size) / 2, y: p.y + (h * size) / 2, elevation: elevacao };
  };

  const terrenoEm = ponto => {
    if (!regioes.length || !TerrainData) return null;
    const efeitos = [];
    for (const { region, comportamentos } of regioes) {
      let dentro = false;
      try { dentro = region.testPoint(ponto); } catch { dentro = false; }
      if (!dentro) continue;
      for (const b of comportamentos) {
        try {
          const lista = b.system._getTerrainEffects(doc, segmento, {});
          if (lista?.length) efeitos.push(...lista);
        } catch (err) {
          console.warn(`${MODULE_ID} | Comportamento de Região ignorado (${b.type}).`, err);
        }
      }
    }
    return efeitos.length ? TerrainData.resolveTerrainEffects(efeitos, {}) : null;
  };

  const calcularCusto = cel => {
    const l = Math.floor(cel / largura), c = cel - l * largura;
    // O token inteiro precisa caber dentro da cena.
    if (l + h > altura || c + w > largura) return Infinity;
    const terrain = terrenoEm(centro(cel));
    const offset = { i: l + i0, j: c + j0 };
    if (typeof funcaoCusto === "function") {
      const custo = funcaoCusto(offset, offset, 1, { width: w, height: h, shape: forma, action: acao, actionConfig, teleport: false, terrain });
      return Number.isFinite(custo) || custo === Infinity ? custo : 1;
    }
    const dificuldade = terrain?.difficulty;
    return dificuldade === undefined || dificuldade === null ? 1 : dificuldade;
  };

  let ocupadas = null;
  if (opcoes.evitarTokens) ocupadas = casasOcupadas(token, lim, w, h);

  const custo = cel => {
    if (ocupadas?.[cel]) return Infinity;
    let valor = cache.custo[cel];
    if (Number.isNaN(valor)) {
      valor = calcularCusto(cel);
      cache.custo[cel] = valor;
    }
    return valor;
  };

  const livre = (de, para, direcao) => {
    const k = de * 8 + direcao;
    const salvo = cache.passagem[k];
    if (salvo) return salvo === 1;
    let bate = false;
    try {
      // O raio passa 1 pixel de cada ponta: um token grande com o centro em cima de uma parede
      // (atravessado nela) conta como bloqueado, e o trajeto não passa "raspando" pela ponta da parede.
      const a = centro(de), b = centro(para);
      const dx = b.x - a.x, dy = b.y - a.y, n = Math.hypot(dx, dy) || 1;
      const origem = { ...a, x: a.x - dx / n, y: a.y - dy / n };
      const destino = { ...b, x: b.x + dx / n, y: b.y + dy / n };
      bate = !!token.checkCollision(destino, { origin: origem, type: "move", mode: "any" });
    } catch (err) {
      console.warn(`${MODULE_ID} | Falha ao testar parede.`, err);
    }
    cache.passagem[k] = bate ? 2 : 1;
    return !bate;
  };

  const grade = new Grade({
    largura, altura,
    distancia: canvas.grid.distance,
    diagonais: canvas.grid.diagonals,
    custo, livre,
    custoMinimo: regioes.length ? 0 : 1
  });

  /** Casa (âncora do canto superior esquerdo) onde está uma posição {x, y} de token, ou -1. */
  const ancora = pos => {
    const o = canvas.grid.getOffset({ x: pos.x + size / 2, y: pos.y + size / 2 });
    const l = o.i - i0, c = o.j - j0;
    if (l < 0 || c < 0 || l >= altura || c >= largura) return -1;
    return l * largura + c;
  };

  /** Casas cobertas pelo token quando a âncora está em `cel` (para pintar tokens grandes). */
  const cobertas = cel => {
    const l = Math.floor(cel / largura), c = cel - l * largura;
    const lista = [];
    for (let dl = 0; dl < h; dl++) for (let dc = 0; dc < w; dc++) {
      if (l + dl < altura && c + dc < largura) lista.push((l + dl) * largura + c + dc);
    }
    return lista;
  };

  return { grade, ancora, topoEsquerdo, centro, cobertas, largura, altura };
}

/** Marca as âncoras em que o token encostaria em outro token. */
function casasOcupadas(token, { i0, j0, largura, altura, size }, w, h) {
  const ocupado = new Uint8Array(largura * altura);
  const marcadas = new Uint8Array(largura * altura);
  for (const outro of canvas.tokens.placeables) {
    if (outro === token || outro.document.id === token.document.id) continue;
    const d = outro.document;
    const o = canvas.grid.getOffset({ x: d.x + size / 2, y: d.y + size / 2 });
    const ow = Math.max(1, Math.ceil(d.width)), oh = Math.max(1, Math.ceil(d.height));
    for (let dl = 0; dl < oh; dl++) for (let dc = 0; dc < ow; dc++) {
      const l = o.i - i0 + dl, c = o.j - j0 + dc;
      if (l >= 0 && c >= 0 && l < altura && c < largura) marcadas[l * largura + c] = 1;
    }
  }
  // Uma âncora fica ocupada se qualquer casa que o token cobriria ali estiver marcada.
  for (let l = 0; l < altura; l++) for (let c = 0; c < largura; c++) {
    if (!marcadas[l * largura + c]) continue;
    for (let dl = 0; dl < h; dl++) for (let dc = 0; dc < w; dc++) {
      const al = l - dl, ac = c - dc;
      if (al >= 0 && ac >= 0) ocupado[al * largura + ac] = 1;
    }
  }
  return ocupado;
}
