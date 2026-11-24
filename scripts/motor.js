// Motor de busca do Trilhas da Mesa: alcance (Dijkstra) e caminho (A*) numa grade quadrada.
// Não conhece o Foundry. Recebe a grade como números e duas funções:
//   custo(celula)       → multiplicador de custo ao entrar na casa (1 normal, 2 difícil, Infinity bloqueada)
//   livre(origem, dest) → false quando uma parede ou porta fechada fica entre as duas casas
// As casas são números: celula = linha * largura + coluna.

/** Mesmos valores de CONST.GRID_DIAGONALS do Foundry. */
export const DIAGONAIS = Object.freeze({
  EQUIDISTANT: 0,   // diagonal custa 1 casa
  EXACT: 1,         // diagonal custa √2
  APPROXIMATE: 2,   // diagonal custa 1,5
  RECTILINEAR: 3,   // diagonal custa 2
  ALTERNATING_1: 4, // 1ª diagonal custa 1, 2ª custa 2 (5/10/5)
  ALTERNATING_2: 5, // 1ª diagonal custa 2, 2ª custa 1 (10/5/10)
  ILLEGAL: 6        // sem diagonais
});

// Vizinhos: 4 ortogonais e depois 4 diagonais. A ordem é usada no cache de passagens (0..7).
export const DIRECOES = Object.freeze([
  [-1, 0], [0, 1], [1, 0], [0, -1],
  [-1, 1], [1, 1], [1, -1], [-1, -1]
]);

const alternada = modo => modo === DIAGONAIS.ALTERNATING_1 || modo === DIAGONAIS.ALTERNATING_2;

/**
 * Custo base de um passo diagonal, em casas, dado quantas diagonais já foram feitas (paridade).
 * Devolve [custo, nova paridade].
 */
export function passoDiagonal(modo, paridade) {
  switch (modo) {
    case DIAGONAIS.EXACT: return [Math.SQRT2, 0];
    case DIAGONAIS.APPROXIMATE: return [1.5, 0];
    case DIAGONAIS.RECTILINEAR: return [2, 0];
    case DIAGONAIS.ALTERNATING_1: return [paridade ? 2 : 1, paridade ^ 1];
    case DIAGONAIS.ALTERNATING_2: return [paridade ? 1 : 2, paridade ^ 1];
    default: return [1, 0];
  }
}

/** Fila de prioridade (heap binário) de estados com chave numérica. */
class Fila {
  constructor() { this.chaves = []; this.itens = []; }
  get tamanho() { return this.itens.length; }
  inserir(item, chave) {
    const { chaves, itens } = this;
    let i = itens.length;
    itens.push(item); chaves.push(chave);
    while (i > 0) {
      const pai = (i - 1) >> 1;
      if (chaves[pai] <= chave) break;
      itens[i] = itens[pai]; chaves[i] = chaves[pai];
      i = pai;
    }
    itens[i] = item; chaves[i] = chave;
  }
  retirar() {
    const { chaves, itens } = this;
    const topo = itens[0];
    const ultimoItem = itens.pop(), ultimaChave = chaves.pop();
    const n = itens.length;
    if (n) {
      let i = 0;
      for (;;) {
        let filho = 2 * i + 1;
        if (filho >= n) break;
        if (filho + 1 < n && chaves[filho + 1] < chaves[filho]) filho++;
        if (chaves[filho] >= ultimaChave) break;
        itens[i] = itens[filho]; chaves[i] = chaves[filho];
        i = filho;
      }
      itens[i] = ultimoItem; chaves[i] = ultimaChave;
    }
    return topo;
  }
}

const EPS = 1e-9;

// Memória reaproveitada entre buscas: em vez de limpar arrays grandes a cada movimento do mouse,
// cada busca ganha um número de "geração" e só vale o que foi escrito nela.
const memoria = { tamanho: 0, geracao: 0 };
function reservar(n) {
  if (memoria.tamanho < n || memoria.geracao >= 0xfffffff0) {
    memoria.tamanho = Math.max(n, memoria.tamanho);
    const t = memoria.tamanho;
    memoria.busca = new Float64Array(t);
    memoria.real = new Float64Array(t);
    memoria.veioDe = new Int32Array(t);
    memoria.direcaoDe = new Int8Array(t);
    memoria.tocado = new Uint32Array(t);
    memoria.fechado = new Uint32Array(t);
    memoria.geracao = 0;
  }
  memoria.geracao++;
  return memoria;
}

export class Grade {
  /**
   * @param {object} opcoes
   * @param {number} opcoes.largura      Colunas
   * @param {number} opcoes.altura       Linhas
   * @param {number} [opcoes.distancia]  Distância de uma casa (ex.: 5 pés)
   * @param {number} [opcoes.diagonais]  Regra de diagonais (DIAGONAIS)
   * @param {(celula:number)=>number} [opcoes.custo]  Multiplicador ao entrar na casa
   * @param {(de:number, para:number, direcao:number)=>boolean} [opcoes.livre]  Passagem sem parede
   * @param {number} [opcoes.custoMinimo] Menor multiplicador possível no mapa (para o A* não errar)
   */
  constructor({ largura, altura, distancia = 1, diagonais = DIAGONAIS.EQUIDISTANT, custo, livre, custoMinimo = 1 }) {
    if (!(largura > 0 && altura > 0)) throw new Error("Grade sem tamanho");
    this.largura = largura;
    this.altura = altura;
    this.total = largura * altura;
    this.distancia = distancia;
    this.diagonais = diagonais;
    this.custo = custo ?? (() => 1);
    this.livre = livre ?? (() => true);
    this.custoMinimo = Math.max(0, Math.min(1, custoMinimo));
    this.paridades = alternada(diagonais) ? 2 : 1;
  }

  celula(linha, coluna) {
    if (linha < 0 || coluna < 0 || linha >= this.altura || coluna >= this.largura) return -1;
    return linha * this.largura + coluna;
  }

  posicao(celula) {
    return { linha: Math.floor(celula / this.largura), coluna: celula % this.largura };
  }

  /** Visita os vizinhos de um estado, chamando visitar(celula, paridade, custoDoPasso, direcao). */
  #vizinhos(celula, paridade, visitar) {
    const { largura, altura, diagonais } = this;
    const linha = Math.floor(celula / largura), coluna = celula - linha * largura;
    const n = diagonais === DIAGONAIS.ILLEGAL ? 4 : 8;
    for (let d = 0; d < n; d++) {
      const [dl, dc] = DIRECOES[d];
      const l = linha + dl, c = coluna + dc;
      if (l < 0 || c < 0 || l >= altura || c >= largura) continue;
      const destino = l * largura + c;
      const fator = this.custo(destino);
      if (!(fator < Infinity) || fator < 0 || Number.isNaN(fator)) continue;
      if (!this.livre(celula, destino, d)) continue;
      let base = 1, novaParidade = paridade;
      if (d >= 4) [base, novaParidade] = passoDiagonal(diagonais, paridade);
      visitar(destino, novaParidade, base * this.distancia * fator, d);
    }
  }

  /**
   * Estimativa otimista do custo até o destino: o custo em campo aberto, sem terreno.
   * Nas regras alternadas depende da paridade, senão o A* poderia errar o caminho mais barato.
   */
  #estimativa(celula, destino, paridade = 0) {
    const { largura, diagonais } = this;
    const dl = Math.abs(Math.floor(celula / largura) - Math.floor(destino / largura));
    const dc = Math.abs((celula % largura) - (destino % largura));
    const menor = Math.min(dl, dc), maior = Math.max(dl, dc);
    let casas;
    switch (diagonais) {
      case DIAGONAIS.EXACT: casas = maior - menor + menor * Math.SQRT2; break;
      case DIAGONAIS.APPROXIMATE: casas = maior - menor + menor * 1.5; break;
      case DIAGONAIS.RECTILINEAR:
      case DIAGONAIS.ILLEGAL: casas = dl + dc; break;
      case DIAGONAIS.ALTERNATING_1:
        casas = maior + (paridade ? Math.ceil(menor / 2) : Math.floor(menor / 2)); break;
      case DIAGONAIS.ALTERNATING_2:
        casas = maior + (paridade ? Math.floor(menor / 2) : Math.ceil(menor / 2)); break;
      default: casas = maior;
    }
    return casas * this.distancia * this.custoMinimo;
  }

  /**
   * Casas alcançáveis a partir da origem gastando no máximo `orcamento`.
   * @returns {Map<number, number>} casa → menor custo para chegar nela (a origem entra com 0)
   */
  alcance(origem, orcamento) {
    const resultado = new Map();
    if (origem < 0 || origem >= this.total || !(orcamento >= 0)) return resultado;
    const P = this.paridades;
    const melhor = new Float64Array(this.total * P).fill(Infinity);
    const fila = new Fila();
    melhor[origem * P] = 0;
    fila.inserir(origem * P, 0);
    while (fila.tamanho) {
      const estado = fila.retirar();
      const g = melhor[estado];
      const celula = Math.floor(estado / P), paridade = estado % P;
      if (!resultado.has(celula) || resultado.get(celula) > g) resultado.set(celula, g);
      this.#vizinhos(celula, paridade, (destino, novaParidade, passo) => {
        const custo = g + passo;
        if (custo > orcamento + EPS) return;
        const novo = destino * P + novaParidade;
        if (custo + EPS < melhor[novo]) {
          melhor[novo] = custo;
          fila.inserir(novo, custo);
        }
      });
    }
    return resultado;
  }

  /**
   * Melhor caminho da origem ao destino (A*).
   * Se o destino não tiver acesso, devolve o caminho até a casa alcançável mais perto dele.
   * @param {object} [opcoes]
   * @param {number} [opcoes.limite]  Não explora caminhos que certamente custam mais que isto.
   *                                  Evita varrer o mapa inteiro quando o destino está fechado.
   * @returns {{celulas:number[], custos:number[], custo:number, completo:boolean}}
   *          custos[k] é o custo acumulado até celulas[k]
   */
  caminho(origem, destino, { limite = Infinity } = {}) {
    const vazio = { celulas: [], custos: [], custo: 0, completo: false };
    if (origem < 0 || origem >= this.total || destino < 0 || destino >= this.total) return vazio;
    if (origem === destino) return { celulas: [origem], custos: [0], custo: 0, completo: true };
    const P = this.paridades;
    // `busca` é o custo real mais um desempate minúsculo: entre caminhos de mesmo custo, prefere
    // menos diagonais e menos curvas (trajeto mais reto, como uma pessoa arrastaria).
    // `real` guarda só o custo de verdade, que é o que volta.
    const m = reservar(this.total * P);
    const { busca, real, veioDe, direcaoDe, tocado, fechado } = m;
    const ger = m.geracao;
    const desempateDiagonal = 1e-9 * this.distancia, desempateCurva = 2e-9 * this.distancia;
    const fila = new Fila();
    const inicio = origem * P;
    busca[inicio] = 0; real[inicio] = 0; veioDe[inicio] = -1; direcaoDe[inicio] = -1; tocado[inicio] = ger;
    fila.inserir(inicio, this.#estimativa(origem, destino));
    let final = -1;
    let maisPerto = inicio, menorDistancia = this.#distanciaPura(origem, destino), custoMaisPerto = 0;
    while (fila.tamanho) {
      const estado = fila.retirar();
      if (fechado[estado] === ger) continue;
      fechado[estado] = ger;
      const celula = Math.floor(estado / P), paridade = estado % P;
      if (celula === destino) { final = estado; break; }
      const g = busca[estado], gReal = real[estado], direcaoAnterior = direcaoDe[estado];
      const h = this.#distanciaPura(celula, destino);
      if (h < menorDistancia - EPS || (Math.abs(h - menorDistancia) <= EPS && gReal < custoMaisPerto)) {
        maisPerto = estado; menorDistancia = h; custoMaisPerto = gReal;
      }
      this.#vizinhos(celula, paridade, (vizinho, novaParidade, passo, direcao) => {
        const novo = vizinho * P + novaParidade;
        if (fechado[novo] === ger) return;
        let extra = direcao >= 4 ? desempateDiagonal : 0;
        if (direcaoAnterior >= 0 && direcaoAnterior !== direcao) extra += desempateCurva;
        const custo = g + passo + extra;
        if (limite < Infinity && gReal + passo + this.#estimativa(vizinho, destino, novaParidade) > limite + EPS) return;
        if (tocado[novo] !== ger || custo < busca[novo]) {
          tocado[novo] = ger;
          busca[novo] = custo;
          real[novo] = gReal + passo;
          veioDe[novo] = estado;
          direcaoDe[novo] = direcao;
          fila.inserir(novo, custo + this.#estimativa(vizinho, destino, novaParidade));
        }
      });
    }
    const completo = final >= 0;
    let estado = completo ? final : maisPerto;
    const celulas = [], custos = [];
    while (estado >= 0) {
      celulas.push(Math.floor(estado / P));
      custos.push(real[estado]);
      estado = veioDe[estado];
    }
    celulas.reverse(); custos.reverse();
    return { celulas, custos, custo: custos[custos.length - 1], completo };
  }

  /** Distância em casas (sem custo de terreno), usada para achar a casa mais perto do destino. */
  #distanciaPura(celula, destino) {
    const { largura } = this;
    const dl = Math.abs(Math.floor(celula / largura) - Math.floor(destino / largura));
    const dc = Math.abs((celula % largura) - (destino % largura));
    return Math.hypot(dl, dc);
  }
}

/**
 * Corta um caminho no ponto em que o custo acumulado passa do orçamento.
 * Devolve um caminho novo, com pelo menos a casa de origem.
 */
export function cortarCaminho(caminho, orcamento) {
  const { celulas, custos } = caminho;
  let fim = 0;
  while (fim + 1 < celulas.length && custos[fim + 1] <= orcamento + EPS) fim++;
  const cortado = fim + 1 < celulas.length;
  return {
    celulas: celulas.slice(0, fim + 1),
    custos: custos.slice(0, fim + 1),
    custo: custos[fim] ?? 0,
    completo: caminho.completo && !cortado
  };
}

/**
 * Junta passos na mesma direção em um só trecho, para o Foundry receber poucos waypoints.
 * Devolve os índices (dentro de `celulas`) das casas que ficam como waypoint, sempre com a primeira e a última.
 */
export function pontosDeVirada(celulas, largura) {
  if (celulas.length <= 2) return celulas.map((_, i) => i);
  const indices = [0];
  const direcao = (a, b) => {
    const dl = Math.floor(b / largura) - Math.floor(a / largura);
    const dc = (b % largura) - (a % largura);
    return `${dl},${dc}`;
  };
  let atual = direcao(celulas[0], celulas[1]);
  for (let k = 1; k < celulas.length - 1; k++) {
    const proxima = direcao(celulas[k], celulas[k + 1]);
    if (proxima !== atual) { indices.push(k); atual = proxima; }
  }
  indices.push(celulas.length - 1);
  return indices;
}
