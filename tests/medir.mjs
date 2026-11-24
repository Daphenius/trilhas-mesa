// Mede o motor em JS puro num mapa grande: `npm run medir`.
// Não usa o Foundry; as paredes e o terreno são aleatórios, só para dar trabalho ao motor.
import { Grade, DIAGONAIS } from "../scripts/motor.js";

function mapaAleatorio(lado, semente = 7) {
  let s = semente;
  const r = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  const custos = new Float32Array(lado * lado).map(() => { const v = r(); return v < 0.12 ? Infinity : v < 0.3 ? 2 : 1; });
  custos[0] = 1; custos[lado * lado - 1] = 1;
  const paredes = new Uint8Array(lado * lado * 8).map(() => (r() < 0.05 ? 1 : 0));
  return new Grade({
    largura: lado, altura: lado, distancia: 5, diagonais: DIAGONAIS.ALTERNATING_1,
    custo: c => custos[c], livre: (de, _para, d) => !paredes[de * 8 + d]
  });
}

function medir(nome, fn, vezes = 20) {
  fn();
  const inicio = performance.now();
  for (let k = 0; k < vezes; k++) fn();
  const ms = (performance.now() - inicio) / vezes;
  console.log(`${nome.padEnd(48)} ${ms.toFixed(2)} ms`);
}

for (const lado of [100, 200, 300]) {
  const g = mapaAleatorio(lado);
  const meio = g.celula(lado >> 1, lado >> 1);
  medir(`${lado}×${lado}: alcance de 30 pés`, () => g.alcance(meio, 30));
  medir(`${lado}×${lado}: alcance de 60 pés (dobro)`, () => g.alcance(meio, 60));
  // O destino destas duas pode cair numa casa bloqueada; o limite é o mesmo que o módulo usa no arrasto.
  const alvo = g.celula((lado >> 1) + 10, (lado >> 1) + 3);
  medir(`${lado}×${lado}: caminho de 10 casas (sem limite)`, () => g.caminho(meio, alvo));
  medir(`${lado}×${lado}: caminho de 10 casas (limite do módulo)`, () => g.caminho(meio, alvo, { limite: (10 * 4 + 20) * 5 }));
  medir(`${lado}×${lado}: caminho de canto a canto`, () => g.caminho(0, lado * lado - 1), 5);
}
