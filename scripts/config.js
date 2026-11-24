export const MODULE_ID = "trilhas-mesa";

/** Lê uma configuração do módulo. */
export function config(chave) {
  return game.settings.get(MODULE_ID, chave);
}

/** Texto traduzido do módulo (chaves em lang/*.json, prefixo TRILHAS). */
export function t(chave, dados) {
  const completa = `TRILHAS.${chave}`;
  return dados ? game.i18n.format(completa, dados) : game.i18n.localize(completa);
}

/**
 * Registra as configurações. `aoMudar` é chamado quando algo que afeta o desenho muda.
 */
export function registrarConfiguracoes(aoMudar) {
  const registrar = (chave, dados) => game.settings.register(MODULE_ID, chave, {
    name: `TRILHAS.Settings.${chave}.Name`,
    hint: `TRILHAS.Settings.${chave}.Hint`,
    config: true,
    ...dados
  });

  registrar("desviarAoArrastar", { scope: "world", type: Boolean, default: true });
  registrar("mostrarAlcance", {
    scope: "client",
    type: String,
    default: "combate",
    choices: {
      combate: "TRILHAS.Settings.mostrarAlcance.combate",
      sempre: "TRILHAS.Settings.mostrarAlcance.sempre",
      nunca: "TRILHAS.Settings.mostrarAlcance.nunca"
    },
    onChange: aoMudar
  });
  registrar("mostrarDobro", { scope: "client", type: Boolean, default: false, onChange: aoMudar });
  registrar("corAlcance", { scope: "client", type: String, default: "#3fa7ff", onChange: aoMudar });
  registrar("mostrarRestante", { scope: "client", type: Boolean, default: true });
  registrar("colorirRegua", { scope: "world", type: Boolean, default: true });
  registrar("atributoDeslocamento", { scope: "world", type: String, default: "", onChange: aoMudar });
  registrar("deslocamentoPadrao", { scope: "world", type: Number, default: 0, onChange: aoMudar });
  registrar("npcLimitarTurno", { scope: "world", type: Boolean, default: true });
  registrar("npcEvitarTokens", { scope: "world", type: Boolean, default: true });
}
