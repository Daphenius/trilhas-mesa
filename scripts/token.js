import { MODULE_ID, config } from "./config.js";
import { planejarTrajeto } from "./caminho.js";

/**
 * Estende a classe de Token em uso (do Foundry ou do sistema, ex.: Token5e).
 * Substitui só o findMovementPath, que é o ponto que o Foundry deixa para busca de caminho:
 * o arrasto, o planMovement e o NPC passam por aqui. O resto continua nativo.
 */
export function estenderToken(Base) {
  return class TokenTrilhas extends Base {
    findMovementPath(waypoints, options = {}) {
      const { [MODULE_ID]: extra, ...resto } = options ?? {};
      const usar = extra?.forcar || config("desviarAoArrastar");
      if (usar) {
        try {
          const novos = planejarTrajeto(this, waypoints, extra ?? {});
          if (novos) waypoints = novos;
        } catch (err) {
          console.error(`${MODULE_ID} | Falha ao calcular o caminho; usando o movimento normal do Foundry.`, err);
        }
      }
      return super.findMovementPath(waypoints, resto);
    }
  };
}
