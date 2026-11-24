# Trilhas da Mesa

## Sobre como este módulo foi feito
Sei que parte da comunidade não gosta de módulos produzidos com IA, então prefiro ser transparente: este foi desenvolvido com ajuda de IA. Não sou programador.

Tudo começou quando um amigo me disse: “cara, ficou muito mais simples, é só fazer uma macro do que você quer”. Fiz a macro para a minha mesa, fui adaptando conforme a necessidade dos jogos e, no fim, ela virou um módulo. Uso nas minhas próprias sessões e resolvi compartilhar caso seja útil para mais alguém.

Se encontrar bugs ou tiver sugestões, abra uma [issue](https://github.com/Daphenius/trilhas-mesa/issues). Todo retorno é bem-vindo.

---

**Versão 0.1.0** · Foundry VTT 14 · Qualquer sistema (automático no D&D 5e) · Português e English · Licença MIT · Testado no Foundry VTT e no sistema D&D 5e

Módulo para Foundry VTT 14 (não funciona em versões anteriores). Calcula caminhos e alcance de movimento em grade quadrada, usando o movimento nativo do Foundry: a régua, o custo de terreno das Regiões e o bloqueio por paredes continuam sendo do próprio Foundry. O módulo só acrescenta o que o Foundry não faz.

## Instalação
No Foundry: *Módulos complementares* → *Instalar módulo* → cole o link do manifesto no campo de baixo:

```
https://github.com/Daphenius/trilhas-mesa/releases/latest/download/module.json
```

## O que faz
- **Arrastar desviando de paredes:** ao arrastar um token para trás de uma parede, o trajeto contorna pela passagem em vez de parar na parede. A régua nativa mostra o trajeto e o custo. Portas fechadas e terreno intransponível também são contornados; terreno difícil é evitado quando o desvio sai mais barato. Passos de uma casa (teclado) e teletransporte não são desviados.
- **Alcance do turno:** ao selecionar um token, pinta as casas que ele alcança com o movimento que sobra no turno, contando paredes, portas e terreno. Por padrão só em combate. Opção de mostrar também o dobro (Disparada) num tom mais claro. Para jogadores, só aparecem casas que o token enxerga.
- **"Faltam X" na régua:** ao arrastar, o último ponto da régua mostra quanto movimento sobra (ou quanto passou). Fora do D&D 5e, o trecho que passa do deslocamento fica vermelho (o D&D 5e já colore a régua sozinho).
- **NPC anda sozinho (Mestre):** selecione um ou mais tokens, pare o cursor no destino e aperte **Alt+M**. Cada token anda pelo melhor caminho, desviando de paredes e de outros tokens. Em combate, para quando acaba o movimento do turno.
- **Terreno intransponível por Região:** novo comportamento de Região *Terreno intransponível*. Dá para escolher quais movimentos ele bloqueia (ex.: só Andar, para um abismo que voadores atravessam). Como usa o mesmo caminho do *Modificar custo de movimento* do Foundry, a régua e o movimento nativos também respeitam.
- **Terreno difícil:** use o comportamento nativo *Modificar custo de movimento* do Foundry (ou o terreno difícil do D&D 5e). O módulo lê o custo pelo próprio Foundry, então segue as regras do sistema.

## Atalhos
| Atalho | O que faz |
|---|---|
| Alt+M | Mestre: tokens selecionados andam até o cursor |
| Alt+R | Liga/desliga a pintura do alcance |

Os dois podem ser trocados em Configurações > Configurar controles.

## Configurações
- **Desviar de paredes ao arrastar** (mundo, ligado).
- **Pintar o alcance do turno**: só em combate, sempre ou nunca (cada usuário).
- **Mostrar também o dobro**, **Cor do alcance**, **Mostrar quanto falta na régua** (cada usuário).
- **Régua vermelha quando passar do deslocamento** (mundo; ignorada no D&D 5e).
- **Atributo de deslocamento**: caminho na ficha (ex.: `system.attributes.speed.value`). Em branco, automático no D&D 5e.
- **Deslocamento padrão**: usado quando a ficha não informa. 0 desliga alcance e "faltam" para esses tokens.
- **Caminho automático para no fim do turno** e **desvia de tokens** (mundo, ligados).

## Como funciona por dentro
- O Foundry 14 deixa o `Token#findMovementPath` como ponto para busca de caminho. O módulo estende a classe de Token em uso (do Foundry ou do sistema) e só troca esse método. O trajeto calculado volta para o próprio Foundry, que mede, aplica terreno e confere paredes de novo.
- A régua é estendida da mesma forma (`CONFIG.Token.rulerClass`). Se o sistema tem um modelo próprio de rótulo, ele é mantido.
- A busca é A* (caminho) e Dijkstra (alcance) em JavaScript puro, sobre uma grade montada sob demanda com a colisão nativa (`Token#checkCollision`) e o terreno das Regiões (`_getTerrainEffects` + `TerrainData`). O resultado fica guardado até uma parede, porta ou Região mudar.
- Respeita a regra de diagonais da cena (5/5/5, 5/10/5, exata etc.).
- Tokens grandes usam o centro, como o Foundry.

## Limites desta versão
- Só grade quadrada e tokens de tamanho inteiro (1×1, 2×2...). Grade hexagonal e mapa sem grade seguem o movimento normal do Foundry.
- O "faltam X" e o alcance precisam do deslocamento do ator: automático no D&D 5e; em outros sistemas, informe o atributo ou um deslocamento padrão.

## Desempenho
Medido em JS puro com `npm run medir` (mapa aleatório com paredes e terreno difícil):

| Mapa | Alcance de 30 pés | Caminho de 10 casas | Canto a canto |
|---|---|---|---|
| 100×100 | ~0,5 ms | ~0,1 ms | ~2 ms |
| 200×200 | ~0,4 ms | ~0,1 ms | ~9 ms |
| 300×300 | ~0,6 ms | ~2 ms | ~18 ms |

Por isso não há motor em Rust/WASM: em JS já cabe com folga num quadro (16 ms). A primeira busca numa cena também testa as paredes, e esse tempo depende do Foundry; depois fica guardado.

## Testes
`npm test` roda 42 testes com Node, sem o Foundry: motor (custos, regras de diagonal, A* contra Dijkstra em mapas aleatórios), trajeto (paredes, portas, Regiões, tokens, orçamento do turno, tokens 2×2), régua e alcance. Eles usam uma imitação mínima do Foundry e não substituem o teste dentro do jogo.
