// Menu em Roda/wheel - Minecraft Bedrock 1.26.x (@minecraft/server 2.11.0 / @minecraft/server-ui 2.3.0)

import { world, system } from "@minecraft/server";
import { ActionFormData, FormCancelationReason } from "@minecraft/server-ui";


const TRIGGER_ITEM = "minecraft:diamond"; // Item que ativa o menu
const REQUIRE_OP = false;                 
const COOLDOWN_TICKS = 10;                
const FORM_TITLE = "wheel_menu";          // NÃO MUDE: o resource pack reconhece o menu por este título

/* aqui é onde tem as ações do menu, gerenciar elas por aqui e tal.
esse script parou de funcionar nas versões mais recentes, ao tentar 
usar ele executa sempre o primeiro comando definido: gamemode creative.

*/

const ACTIONS = [
  {
    "name": "Criativo",
    "commands": [
      "gamemode creative"
    ]
  },
  {
    "name": "Sobrevivência",
    "commands": [
      "gamemode survival"
    ]
  },
  {
    "name": "Aventura",
    "commands": [
      "gamemode adventure"
    ]
  },
  {
    "name": "Dia",
    "commands": [
      "time set day"
    ]
  },
  {
    "name": "Noite",
    "commands": [
      "time set night"
    ]
  },
  {
    "name": "Tempo limpo",
    "commands": [
      "weather clear"
    ]
  },
  {
    "name": "Chuva",
    "commands": [
      "weather rain"
    ]
  },
  {
    "name": "Tempestade",
    "commands": [
      "weather thunder"
    ]
  },
  {
    "name": "Limpar efeitos",
    "commands": [
      "effect @s clear"
    ]
  },
  {
    "name": "Velocidade",
    "commands": [
      "effect @s speed 120 2 true"
    ]
  },
  {
    "name": "Curar",
    "commands": [
      "effect @s instant_health 1 4 true",
      "effect @s saturation 1 10 true"
    ]
  },
  {
    "name": "Super pulo",
    "commands": [
      "effect @s jump_boost 120 4 true"
    ]
  }
];



const lastUse = new Map();

function wait(ticks) {
  return new Promise((resolve) => system.runTimeout(resolve, ticks));
}

async function openWheel(player) {
  const form = new ActionFormData().title(FORM_TITLE);
  for (const action of ACTIONS) form.button(action.name); 


  for (let attempt = 0; attempt < 30; attempt++) {
    const response = await form.show(player);
    if (response.canceled && response.cancelationReason === FormCancelationReason.UserBusy) {
      await wait(10);
      continue;
    }
    if (response.canceled || response.selection === undefined) return;
    runAction(player, ACTIONS[response.selection]);
    return;
  }
}

function runAction(player, action) {
  if (!action) return;
  let failed = false;
  for (const cmd of action.commands) {
    try {
      player.runCommand(cmd);
    } catch (e) {
      failed = true;
      console.warn(`[wheelRoda] Falha ao executar "${cmd}": ${e}`);
    }
  }
  player.onScreenDisplay.setActionBar(failed ? `§cNão foi possível executar: ${action.name}` : `§b${action.name} §7aplicado`);
  player.playSound(failed ? "note.bass" : "random.orb");
}
/*
 Se quiser pode mudaar a função de gatilho, adaptando para os botões de movimentação do jogador.
 Assim o script passa a ser amigável com jogadores de Console também
*/

world.afterEvents.itemUse.subscribe((event) => {
  const player = event.source;
  if (!event.itemStack || event.itemStack.typeId !== TRIGGER_ITEM) return;

  const now = system.currentTick;
  if (now - (lastUse.get(player.id) ?? -1000) < COOLDOWN_TICKS) return;
  lastUse.set(player.id, now);

  if (REQUIRE_OP && !(typeof player.isOp === "function" && player.isOp())) {
    player.onScreenDisplay.setActionBar("§cSem permissão.");
    return;
  }
  openWheel(player).catch((e) => console.warn(`[wheelRoda] erro: ${e}`));
});

world.afterEvents.playerLeave.subscribe((event) => lastUse.delete(event.playerId));




