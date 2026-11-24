// Imitação mínima das partes do Foundry que grade.js, caminho.js e token.js usam.
// Serve para testar a lógica; não prova nada sobre o comportamento dentro do Foundry.

const SIZE = 100;

/** Testa se os segmentos AB e CD se cruzam. */
function cruza(a, b, c, d) {
  const det = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const d1 = det(c, d, a), d2 = det(c, d, b), d3 = det(a, b, c), d4 = det(a, b, d);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/**
 * Cria uma cena falsa.
 * @param {object} o
 * @param {number} o.colunas
 * @param {number} o.linhas
 * @param {number[][]} [o.paredes]  [[x1,y1,x2,y2], ...] em pixels
 * @param {object[]} [o.regioes]    [{ casas: [[linha, coluna], ...], dificuldade }]
 */
export function makeCena({ colunas, linhas, paredes = [], regioes = [], diagonais = 0 }) {
  const settings = {
    desviarAoArrastar: true, atributoDeslocamento: "", deslocamentoPadrao: 30,
    npcLimitarTurno: true, npcEvitarTokens: true, mostrarRestante: true, colorirRegua: true
  };
  const colisoes = { n: 0 };
  globalThis.game = {
    settings: { get: (_m, k) => settings[k] },
    i18n: { lang: "pt-BR", localize: k => k, format: (k, d) => `${k} ${JSON.stringify(d)}` },
    system: { id: "generico" },
    user: { id: "u1", isGM: true }
  };
  globalThis.foundry = {
    utils: { getProperty: (obj, path) => path.split(".").reduce((o, k) => o?.[k], obj) },
    data: { regionBehaviors: { RegionBehaviorType: class { _getTerrainEffects() { return []; } } } }
  };
  class TerrainData {
    constructor(difficulty) { this.difficulty = difficulty; }
    static resolveTerrainEffects(efeitos) {
      const d = efeitos.filter(e => e.name === "difficulty").reduce((m, e) => Math.max(m, e.difficulty), 1);
      return new TerrainData(d);
    }
  }
  globalThis.CONFIG = {
    Token: {
      movement: {
        TerrainData,
        actions: { walk: { label: "Andar" }, fly: { label: "Voar" }, blink: { label: "Teleporte", teleport: true } }
      }
    }
  };
  const BehaviorBase = foundry.data.regionBehaviors.RegionBehaviorType;
  const scene = {
    id: "cena",
    regions: regioes.map(({ casas, dificuldade, acoes }) => {
      const set = new Set(casas.map(([l, c]) => `${l},${c}`));
      const system = new (class extends BehaviorBase {
        _getTerrainEffects(_token, segmento) {
          if (acoes && !acoes.includes(segmento.action)) return [];
          return [{ name: "difficulty", difficulty: dificuldade }];
        }
      })();
      return {
        testPoint: p => set.has(`${Math.floor(p.y / SIZE)},${Math.floor(p.x / SIZE)}`),
        behaviors: [{ disabled: false, type: "teste", system }]
      };
    })
  };
  const tokens = [];
  globalThis.canvas = {
    ready: true,
    grid: {
      isSquare: true, size: SIZE, distance: 5, units: "ft", diagonals: diagonais,
      getOffset: ({ x, y }) => ({ i: Math.floor(y / SIZE), j: Math.floor(x / SIZE) }),
      getTopLeftPoint: ({ i, j }) => ({ x: j * SIZE, y: i * SIZE })
    },
    dimensions: { sceneRect: { x: 0, y: 0, width: colunas * SIZE, height: linhas * SIZE } },
    tokens: { placeables: tokens, controlled: [] }
  };

  class TokenBase {
    constructor(doc) { this.document = doc; this.recebido = null; }
    checkCollision(destino, { origin }) {
      colisoes.n++;
      return paredes.some(([x1, y1, x2, y2]) => cruza(origin, destino, { x: x1, y: y1 }, { x: x2, y: y2 }));
    }
    findMovementPath(waypoints, options) {
      this.recebido = { waypoints, options };
      return { result: waypoints, promise: Promise.resolve(waypoints), cancel() {} };
    }
  }

  function token(id, linha, coluna, extra = {}) {
    const doc = {
      id, name: id, parent: scene, x: coluna * SIZE, y: linha * SIZE, elevation: 0,
      width: 1, height: 1, shape: 0, level: "l1", movementAction: "walk", inCombat: false, movementHistory: [],
      actor: { system: {} }, ...extra
    };
    const t = new (globalThis.__TokenClasse ?? TokenBase)(doc);
    tokens.push(t);
    return t;
  }

  const ponto = (t, linha, coluna, extra = {}) => ({
    x: coluna * SIZE, y: linha * SIZE, elevation: 0, width: t.document.width, height: t.document.height,
    shape: 0, action: "walk", snapped: true, explicit: true, checkpoint: true, ...extra
  });

  return { scene, settings, token, ponto, TokenBase, colisoes, SIZE, cruza, paredes };
}
