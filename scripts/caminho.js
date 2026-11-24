// Transforma os waypoints que o Foundry pede (arrasto, NPC) em um trajeto que desvia de paredes.
// O resultado volta para o próprio Foundry (findMovementPath nativo), que mede, aplica terreno e confere paredes.

import { cortarCaminho, pontosDeVirada } from "./motor.js";
import { gradeDoToken, gradeSuportada } from "./grade.js";

/** Distância em casas (maior eixo) entre duas posições de token. */
function casasEntre(a, b) {
  const size = canvas.grid.size;
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) / size;
}

/**
 * Planeja o trajeto pelos waypoints.
 * @param {Token} token
 * @param {object[]} waypoints  Waypoints do Foundry (x, y no canto superior esquerdo do token)
 * @param {object} [opcoes]
 * @param {boolean} [opcoes.evitarTokens]  Desviar de outros tokens
 * @param {number} [opcoes.orcamento]      Parar quando o custo passar disto (ex.: movimento do turno)
 * @returns {object[]|null}  Waypoints novos, ou null se nada mudou
 */
export function planejarTrajeto(token, waypoints, { evitarTokens = false, orcamento = Infinity } = {}) {
  if (!Array.isArray(waypoints) || waypoints.length < 2) return null;
  const acoes = CONFIG.Token.movement?.actions ?? {};
  const saida = [waypoints[0]];
  let mudou = false;
  let gasto = 0;

  for (let k = 1; k < waypoints.length; k++) {
    const de = saida[saida.length - 1];
    const para = waypoints[k];
    const largura = para.width ?? de.width, altura = para.height ?? de.height;

    // Teletransporte, passo de uma casa (teclado) ou grade não suportada: segue como o Foundry faria.
    const simples = acoes[para.action]?.teleport
      || !gradeSuportada(token, largura, altura)
      || casasEntre(de, para) <= 1;
    if (simples) { saida.push(para); continue; }

    const ctx = gradeDoToken(token, {
      acao: para.action, elevacao: de.elevation, largura, altura, forma: para.shape ?? de.shape,
      level: para.level ?? de.level, evitarTokens
    });
    const origem = ctx.ancora(de), destino = ctx.ancora(para);
    if (origem < 0 || destino < 0 || origem === destino) { saida.push(para); continue; }

    // Desvios de até 4× a distância reta (+20 casas) bastam para contornar prédios e terreno difícil;
    // além disso o destino quase certamente está fechado, e não vale varrer o mapa a cada movimento do mouse.
    const casasReta = Math.ceil(casasEntre(de, para));
    const limite = (casasReta * 4 + 20) * canvas.grid.distance;
    let rota = ctx.grade.caminho(origem, destino, { limite });
    const restante = orcamento - gasto;
    const limitado = Number.isFinite(orcamento);
    if (limitado) rota = cortarCaminho(rota, restante);
    if (rota.celulas.length < 1) { saida.push(para); continue; }

    const indices = pontosDeVirada(rota.celulas, ctx.largura);
    const ultimoIntermediario = rota.completo ? indices.length - 1 : indices.length;
    for (let n = 1; n < ultimoIntermediario; n++) {
      const cel = rota.celulas[indices[n]];
      const ponto = ctx.topoEsquerdo(cel);
      saida.push({
        ...para,
        x: Math.round(ponto.x), y: Math.round(ponto.y),
        elevation: de.elevation,
        snapped: true, explicit: false, checkpoint: false
      });
      mudou = true;
    }

    if (rota.completo) {
      saida.push(para);
      gasto += rota.custo;
      continue;
    }
    // Não chegou: com orçamento, para onde o movimento acabou; sem orçamento, deixa o destino para o
    // Foundry mostrar até onde dá para ir (a régua marca o resto como inalcançável).
    if (limitado) {
      mudou = true;
      break;
    }
    saida.push(para);
  }
  return mudou || saida.length !== waypoints.length ? saida : null;
}
