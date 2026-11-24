import { MODULE_ID, config, t } from "./config.js";
import { deslocamento } from "./deslocamento.js";

const TEMPLATE_DO_FOUNDRY = "templates/hud/waypoint-label.hbs";
export const TEMPLATE_ROTULO = `modules/${MODULE_ID}/templates/rotulo-waypoint.hbs`;

const COR_EXCEDE = 0xd9534f;

/** Formata um número de distância como o Foundry faz na régua. */
function formatar(valor) {
  const arredondado = Math.round(valor * 100) / 100;
  return arredondado.toLocaleString(game.i18n.lang);
}

/**
 * Estende a régua do token em uso (do Foundry ou do sistema, ex.: TokenRuler5e).
 * Acrescenta "faltam X" no último ponto e, fora do D&D 5e (que já faz isso), pinta de vermelho o que passa do deslocamento.
 */
export function estenderRegua(Base) {
  // Só troca o modelo do rótulo se o sistema não tiver um próprio, para não apagar o que ele mostra.
  const templateNativo = !Base.WAYPOINT_LABEL_TEMPLATE || Base.WAYPOINT_LABEL_TEMPLATE === TEMPLATE_DO_FOUNDRY;

  return class ReguaTrilhas extends Base {
    static WAYPOINT_LABEL_TEMPLATE = templateNativo ? TEMPLATE_ROTULO : Base.WAYPOINT_LABEL_TEMPLATE;

    /** Deslocamento total do token para a ação do ponto, só para quem está planejando o movimento. */
    #deslocamentoPara(waypoint) {
      if (waypoint.stage && waypoint.stage !== "planned") return 0;
      if (waypoint.userId && waypoint.userId !== game.user.id) return 0;
      if (CONFIG.Token.movement?.actions?.[waypoint.action]?.teleport) return 0;
      return deslocamento(this.token?.actor, waypoint.action);
    }

    _getWaypointLabelContext(waypoint, state) {
      const contexto = super._getWaypointLabelContext(waypoint, state);
      if (!contexto || waypoint.next || !config("mostrarRestante")) return contexto;
      const total = this.#deslocamentoPara(waypoint);
      const custo = waypoint.measurement?.cost;
      if (!total || !Number.isFinite(custo)) return contexto;
      const restante = total - custo;
      const unidades = canvas.grid.units;
      const texto = restante >= 0
        ? t("Regua.Faltam", { valor: formatar(restante), unidades })
        : t("Regua.Excede", { valor: formatar(-restante), unidades });
      contexto.trilhas = { texto, classe: restante >= 0 ? "trilhas-sobra" : "trilhas-excede" };
      // Se o sistema tem modelo próprio, o texto vai junto da unidade, que todo modelo mostra.
      if (!templateNativo) {
        if (contexto.cost) contexto.cost.units = `${contexto.cost.units ?? unidades} · ${texto}`;
        else contexto.units = `${contexto.units ?? unidades} · ${texto}`;
      }
      return contexto;
    }

    #corPorDeslocamento(waypoint, estilo) {
      if (game.system?.id === "dnd5e" || !config("colorirRegua")) return estilo;
      const total = this.#deslocamentoPara(waypoint);
      const custo = waypoint.measurement?.cost;
      if (!total || !(custo > total)) return estilo;
      return { ...estilo, color: COR_EXCEDE };
    }

    _getSegmentStyle(waypoint) {
      return this.#corPorDeslocamento(waypoint, super._getSegmentStyle(waypoint));
    }

    _getGridHighlightStyle(waypoint, offset) {
      return this.#corPorDeslocamento(waypoint, super._getGridHighlightStyle(waypoint, offset));
    }
  };
}
