# Changelog

## v0.1.0

Primeira versão, para testar na mesa.

### Adicionado
- **Arrastar desviando de paredes:** o trajeto do arrasto contorna paredes, portas fechadas e terreno intransponível, e evita terreno difícil quando o desvio sai mais barato. Usa o `findMovementPath` nativo do Foundry 14.
- **Alcance do turno pintado** ao selecionar um token (só em combate, sempre ou nunca), com opção de mostrar o dobro.
- **"Faltam X" na régua** do token e trecho vermelho quando passa do deslocamento (fora do D&D 5e, que já faz isso).
- **NPC anda sozinho até o cursor** (Mestre, Alt+M), desviando de paredes e tokens e parando no fim do movimento do turno.
- **Comportamento de Região "Terreno intransponível"**, com escolha de quais movimentos bloqueia.
- Português e inglês.

### Testes
- 42 testes com Node (motor, trajeto, régua e alcance) e `npm run medir` para medir o motor em mapas de 100×100 a 300×300.
