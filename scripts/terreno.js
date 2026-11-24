// Comportamento de Região "Terreno intransponível": o custo de entrar vira infinito.
// Funciona pelo mesmo caminho do "Modificar custo de movimento" do Foundry, então a régua,
// o arrasto e o move() nativos já respeitam, além do próprio módulo.

import { MODULE_ID } from "./config.js";

export const TIPO_INTRANSPONIVEL = `${MODULE_ID}.intransponivel`;

export function registrarIntransponivel() {
  const Base = foundry.data.regionBehaviors?.RegionBehaviorType;
  if (!Base) return;
  const { SetField, StringField } = foundry.data.fields;

  class IntransponivelBehaviorType extends Base {
    static LOCALIZATION_PREFIXES = ["TRILHAS.Intransponivel"];

    static defineSchema() {
      return {
        acoes: new SetField(new StringField({
          blank: false,
          choices: () => Object.fromEntries(
            Object.entries(CONFIG.Token.movement?.actions ?? {}).map(([id, acao]) => [id, acao.label ?? id])
          )
        }))
      };
    }

    /** Sem ações marcadas, bloqueia todas. Com ações marcadas (ex.: andar, nadar), as outras passam (ex.: voar). */
    _getTerrainEffects(token, segment) {
      const acoes = this.acoes;
      if (acoes?.size && !acoes.has(segment?.action)) return [];
      return [{ name: "difficulty", difficulty: Infinity }];
    }
  }

  CONFIG.RegionBehavior.dataModels[TIPO_INTRANSPONIVEL] = IntransponivelBehaviorType;
  CONFIG.RegionBehavior.typeIcons ??= {};
  CONFIG.RegionBehavior.typeIcons[TIPO_INTRANSPONIVEL] = "fa-solid fa-road-barrier";
}
