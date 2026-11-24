import { MODULE_ID, registrarConfiguracoes, t } from "./config.js";
import { estenderToken } from "./token.js";
import { estenderRegua, TEMPLATE_ROTULO } from "./regua.js";
import { invalidarGrades } from "./grade.js";
import { alternarAlcance, atualizarAlcance, registrarGanchosDoAlcance } from "./alcance.js";
import { moverAteCursor } from "./npc.js";
import { registrarIntransponivel } from "./terreno.js";

Hooks.once("init", () => {
  registrarConfiguracoes(atualizarAlcance);
  registrarIntransponivel();

  game.keybindings.register(MODULE_ID, "moverAteCursor", {
    name: "TRILHAS.Atalhos.moverAteCursor.Name",
    hint: "TRILHAS.Atalhos.moverAteCursor.Hint",
    editable: [{ key: "KeyM", modifiers: ["Alt"] }],
    restricted: true,
    onDown: () => { moverAteCursor(); return true; }
  });
  game.keybindings.register(MODULE_ID, "alternarAlcance", {
    name: "TRILHAS.Atalhos.alternarAlcance.Name",
    hint: "TRILHAS.Atalhos.alternarAlcance.Hint",
    editable: [{ key: "KeyR", modifiers: ["Alt"] }],
    onDown: () => {
      const ligado = alternarAlcance();
      ui.notifications.info(t(ligado ? "Alcance.Ligado" : "Alcance.Desligado"));
      return true;
    }
  });

  foundry.applications.handlebars.loadTemplates([TEMPLATE_ROTULO]);
});

// No setup o sistema (ex.: D&D 5e) já trocou as classes de Token e régua; estendemos as dele.
Hooks.once("setup", () => {
  CONFIG.Token.objectClass = estenderToken(CONFIG.Token.objectClass);
  CONFIG.Token.rulerClass = estenderRegua(CONFIG.Token.rulerClass);
});

Hooks.once("ready", () => {
  registrarGanchosDoAlcance();

  // Paredes, portas e Regiões mudam o mapa: o que foi calculado deixa de valer.
  const mudouOMapa = () => { invalidarGrades(); atualizarAlcance(); };
  for (const doc of ["Wall", "Region", "RegionBehavior"]) {
    for (const acao of ["create", "update", "delete"]) Hooks.on(`${acao}${doc}`, mudouOMapa);
  }
  Hooks.on("updateScene", (scene, mudancas) => {
    if ("grid" in mudancas || "width" in mudancas || "height" in mudancas || "padding" in mudancas) mudouOMapa();
  });
  Hooks.on("canvasReady", invalidarGrades);
  Hooks.on("updateToken", (doc, mudancas) => {
    // Custo pode depender do ator ou do tamanho; casas ocupadas são recalculadas a cada pedido.
    if ("width" in mudancas || "height" in mudancas || "shape" in mudancas || "actorId" in mudancas) invalidarGrades();
  });
});
