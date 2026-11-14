import { world } from "@minecraft/server";




// Controle de Hud e umas outras parada de tributagem e etc

/*
 Retirado do addon Solo-V das Produções VM.
 Scores de controle podem precisar ser adicionados manualmente para esse sistema funcionar corretamente.

 Codigo bruto e não adaptado para reprodução, use por sua conta em risco
*/





const SNEAK_TICKS_REQUIRED = 10;
const PARTICLE_DEFAULT = "vz:mana";
const PARTICLE_TAG_MAP = { "mana_vermelha": "vz:mana_vermelha" };

const playerStates = new Map();
const attributeStates = new Map();
const campfireStates = new Map();

const getScore = (p, id) => world.scoreboard.getObjective(id)?.getScore(p.scoreboardIdentity) ?? 0;
const setScore = (p, id, v) => world.scoreboard.getObjective(id)?.setScore(p.scoreboardIdentity, v);
const emitParticle = (p, type) => p.dimension.spawnParticle(type, { x: p.location.x, y: p.location.y + 0.1, z: p.location.z });
const getParticle = p => Object.entries(PARTICLE_TAG_MAP).find(([tag]) => p.hasTag(tag))?.[1] ?? PARTICLE_DEFAULT;

export function tickMana(players) {
    for (const player of players) {
        const id = player.id;
        let state = playerStates.get(id);
        if (!state) state = { sneakingTicks: 0, isRecharging: false };

        if (!player.isSneaking) {
            state.sneakingTicks = 0;
            state.isRecharging = false;
            playerStates.set(id, state);
            continue;
        }

        if (!state.isRecharging) {
            if (++state.sneakingTicks >= SNEAK_TICKS_REQUIRED) {
                state.isRecharging = true;
                state.sneakingTicks = 0;
            }
        } else {
            const current = getScore(player, "mana");
            const max = getScore(player, "manamax");
            if (current < max) {
                setScore(player, "mana", current + 1);
                emitParticle(player, getParticle(player));
            } else {
                state.isRecharging = false;
            }
        }
        playerStates.set(id, state);
    }
}


export function initializeManaSystem() {}

export function cleanupManaPlayer(playerId) {
    playerStates.delete(playerId);
    statusBarStates.delete(playerId);
    attributeStates.delete(playerId);
    campfireStates.delete(playerId);
}

/*
*system.runInterval(() => {
*    for (const p of world.getPlayers()) {
*        if (!p.hasTag("monarca_sombras")) p.resetLevel();
*    }
*}, 1);
*
*system.runInterval(() => {
*    for (const player of world.getPlayers()) {
*        let hide = false;
*        for (const tag of HIDE_DISPLAY_TAGS) {
*            if (player.hasTag(tag)) { hide = true; break; }
*        }
*        if (hide) continue;
*
*        const hp = player.getComponent("health");
*        const currentHealth = hp.currentValue;
*        const maxHealth = hp.effectiveMax;
*        const life = Math.round((currentHealth / maxHealth) * 10);
*
*        const manaCurrent = getScore(player, "mana");
*        const manaMax = getScore(player, "manamax") || 100;
*        const manaBar = Math.round((manaCurrent / manaMax) * 10);
*
*
*        const spacer = "\n".repeat(50);
*        player.onScreenDisplay.setTitle({
*            rawtext: [
*                { text: spacer },
*                { text: `\nmana${manaBar}` },
*                { text: `\nvida${life}` }
*            ]
*        });
*
*    
*        player.onScreenDisplay.setActionBar(
*            `\n\n\n\n\n\n\n\n\n\n\n\n${Math.floor(currentHealth)}/${Math.floor(maxHealth)}                                          ${manaCurrent}/${manaMax}`
*        );
*    }
*}, 20); 
*/

const BAR_MAX_FRAME = 70;
// O HUD roda a cada 2 ticks; 3 passos preservam a transição visual de 6 ticks.
const TRANSITION_TICKS = 3;
const TITLE_REFRESH_TICKS = 20;

const MANA_COLOR_TAGS = [
    ["mana_vermelha", "vermelha"],
    ["mana_roxa", "roxa"],
    ["mana_azul", "azul"]
];

const statusBarStates = new Map();
let statusBarTick = 0;

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function valueToFrame(current, maximum) {
    if (!Number.isFinite(current) || !Number.isFinite(maximum) || maximum <= 0) {
        return 0;
    }

    return clamp(
        Math.round((current / maximum) * BAR_MAX_FRAME),
        0,
        BAR_MAX_FRAME
    );
}

function getManaColor(player) {
    for (const [tag, color] of MANA_COLOR_TAGS) {
        if (player.hasTag(tag)) return color;
    }

    return "azul";
}

function createStatusBarState(
    lifeTarget,
    manaTarget,
    cooldownCurrent,
    castCurrent,
    channelCurrent
) {
    return {

        lifeDisplayed: lifeTarget,
        lifeTarget,
        lifeStep: 1,

        manaDisplayed: manaTarget,
        manaTarget,
        manaStep: 1,

        // O maior valor observado no começo do ciclo representa 100%.
        cooldownMaximum: cooldownCurrent,
        cooldownPrevious: cooldownCurrent,
        cooldownExpectedNext: cooldownCurrent,
        loadingFrame: cooldownCurrent > 0 ? BAR_MAX_FRAME : 0,

        // O lançamento começa vazio e enche enquanto o score diminui.
        castMaximum: castCurrent > 1 ? castCurrent : 0,
        castPrevious: castCurrent,
        castFrame: 0,

        // Canalização começa cheia e esvazia junto com o score.
        channelMaximum: channelCurrent,
        channelExpectedNext: channelCurrent,
        channelFrame: channelCurrent > 0 ? BAR_MAX_FRAME : 0,

        lastTitle: "",
        lastRefreshTick: -TITLE_REFRESH_TICKS
    };
}

function updateTransitionTarget(state, property, newTarget) {
    const targetProperty = `${property}Target`;
    const displayedProperty = `${property}Displayed`;
    const stepProperty = `${property}Step`;

    if (state[targetProperty] === newTarget) return;

    state[targetProperty] = newTarget;

    const distance = Math.abs(
        state[targetProperty] - state[displayedProperty]
    );


    state[stepProperty] = Math.max(
        1,
        Math.ceil(distance / TRANSITION_TICKS)
    );
}

function moveTowards(current, target, step) {
    if (current < target) return Math.min(current + step, target);
    if (current > target) return Math.max(current - step, target);
    return current;
}

function updateDisplayedFrames(state) {
    state.lifeDisplayed = moveTowards(
        state.lifeDisplayed,
        state.lifeTarget,
        state.lifeStep
    );

    state.manaDisplayed = moveTowards(
        state.manaDisplayed,
        state.manaTarget,
        state.manaStep
    );
}

function updateCooldownLoading(state, cooldownCurrent) {
    // Um aumento significa que o jogador recebeu um cooldown novo ou adicional.
    if (
        cooldownCurrent > state.cooldownExpectedNext ||
        (cooldownCurrent > 0 && state.cooldownMaximum <= 0)
    ) {
        state.cooldownMaximum = cooldownCurrent;
    }

    if (cooldownCurrent <= 0) {
        state.cooldownMaximum = 0;
        state.cooldownPrevious = 0;
        state.cooldownExpectedNext = 0;
        state.loadingFrame = 0;
        return;
    }

    const maximum = Math.max(1, state.cooldownMaximum);

    // pra n desaparecer
    state.loadingFrame = clamp(
        Math.ceil((cooldownCurrent / maximum) * BAR_MAX_FRAME),
        1,
        BAR_MAX_FRAME
    );

    state.cooldownPrevious = cooldownCurrent;
    state.cooldownExpectedNext = Math.max(0, cooldownCurrent - 1);
}

function updateChannelLoading(state, channelCurrent) {
    // Um valor maior que o esperado representa uma canalização nova ou renovada.
    if (
        channelCurrent > state.channelExpectedNext ||
        (channelCurrent > 0 && state.channelMaximum <= 0)
    ) {
        state.channelMaximum = channelCurrent;
    }

    if (channelCurrent <= 0) {
        state.channelMaximum = 0;
        state.channelExpectedNext = 0;
        state.channelFrame = 0;
        return;
    }

    const maximum = Math.max(1, state.channelMaximum);
    state.channelFrame = clamp(
        Math.ceil((channelCurrent / maximum) * BAR_MAX_FRAME),
        1,
        BAR_MAX_FRAME
    );
    state.channelExpectedNext = Math.max(0, channelCurrent - 1);
}

function updateCastLoading(state, castCurrent) {
    if (castCurrent <= 1) {
        state.castMaximum = 0;
        state.castPrevious = castCurrent;
        state.castFrame = 0;
        return;
    }

    // Apenas um aumento real inicia um novo lançamento. Manter o mesmo valor por alguns ticks não reinicia o preenchimento.
    if (
        state.castMaximum <= 1 ||
        castCurrent > state.castPrevious
    ) {
        state.castMaximum = castCurrent;
    }

    // Como a barra some no score 1, o quadro 70 é atingido no score 2.
    const duration = Math.max(1, state.castMaximum - 2);
    const elapsed = state.castMaximum - castCurrent;

    state.castFrame = clamp(
        Math.round((elapsed / duration) * BAR_MAX_FRAME),
        0,
        BAR_MAX_FRAME
    );
    state.castPrevious = castCurrent;
}

function sendStatusBarsTitle(player, state, manaColor) {
    const spacer = "\n".repeat(50);

    const statusText =
        `vida:${state.lifeDisplayed}` +
        `mana:${state.manaDisplayed}` +
        `loading:${state.loadingFrame}` +
        (state.castMaximum > 1
            ? `lancamento:${state.castFrame}`
            : "lancamento_hide") +
        (state.channelMaximum > 0
            ? `canalizar:${state.channelFrame}`
            : "canalizar_hide") +
        `mana_cor:${manaColor}`;

    const titleText = spacer + statusText;

    const needsRefresh =
        statusBarTick - state.lastRefreshTick >= TITLE_REFRESH_TICKS;


    if (titleText === state.lastTitle && !needsRefresh) return;

    player.onScreenDisplay.setTitle({
        rawtext: [{ text: titleText }]
    });

    state.lastTitle = titleText;
    state.lastRefreshTick = statusBarTick;
}

/* referencia, apenas.
system.runInterval(() => {
    for (const player of world.getPlayers()) {
        if (!player.hasTag("monarca_sombras")) {
            player.resetLevel();
        }
    }
}, 1); */

export function tickStatusBars(players) {
    statusBarTick += 2;

    const onlinePlayerIds = new Set();

    for (const player of players) {
        onlinePlayerIds.add(player.id);

        const hp = player.getComponent("health");
        if (!hp) continue;

        const currentHealth = Number(hp.currentValue ?? 0);
        const maxHealth = Number(hp.effectiveMax ?? 0);

        const manaCurrentRaw = Number(getScore(player, "mana") ?? 0);
        const manaMaxRaw = Number(getScore(player, "manamax") ?? 100);

        const manaMax =
            Number.isFinite(manaMaxRaw) && manaMaxRaw > 0
                ? manaMaxRaw
                : 100;

        const manaCurrent = clamp(
            Number.isFinite(manaCurrentRaw) ? manaCurrentRaw : 0,
            0,
            manaMax
        );

        const lifeTarget = valueToFrame(currentHealth, maxHealth);
        const manaTarget = valueToFrame(manaCurrent, manaMax);
        const cooldownCurrent = Math.max(
            0,
            Math.floor(Number(getScore(player, "cooldown") ?? 0))
        );
        const castCurrent = Math.max(
            0,
            Math.floor(Number(getScore(player, "lancamento") ?? 0))
        );
        const channelCurrent = Math.max(
            0,
            Math.floor(Number(getScore(player, "canalizar") ?? 0))
        );

        let state = statusBarStates.get(player.id);

        if (!state) {
            state = createStatusBarState(
                lifeTarget,
                manaTarget,
                cooldownCurrent,
                castCurrent,
                channelCurrent
            );
            statusBarStates.set(player.id, state);
        }

        updateCooldownLoading(state, cooldownCurrent);
        updateCastLoading(state, castCurrent);
        updateChannelLoading(state, channelCurrent);

        // Cooldown e canalizar são apenas observados aqui.O controle ta nos functions
        

        updateTransitionTarget(state, "life", lifeTarget);
        updateTransitionTarget(state, "mana", manaTarget);
        updateDisplayedFrames(state);

        const manaColor = getManaColor(player);
        sendStatusBarsTitle(player, state, manaColor);

        if (statusBarTick % 20 === 0) {
            player.onScreenDisplay.setActionBar(
                `\n\n\n\n\n\n\n\n\n\n` +
                `${Math.floor(currentHealth)}/${Math.floor(maxHealth)}` +
                `                                      ` +
                `${Math.floor(manaCurrent)}/${Math.floor(manaMax)}`
            );
        }
    }


    for (const playerId of statusBarStates.keys()) {
        if (!onlinePlayerIds.has(playerId)) {
            statusBarStates.delete(playerId);
        }
    }
}


const RADIUS = 5;

function findCampfire(player, px, py, pz) {
    const dimension = player.dimension;
    for (let y = -2; y <= 2; y++) {
        for (let x = -RADIUS; x <= RADIUS; x++) {
            for (let z = -RADIUS; z <= RADIUS; z++) {
                const block = dimension.getBlock({ x: px + x, y: py + y, z: pz + z });
                if (!block) continue;
                if (block.typeId === "minecraft:campfire" || block.typeId === "minecraft:soul_campfire") {
                    return true;
                }
            }
        }
    }
    return false;
}

export function tickCampfires(players) {
    for (const player of players) {
        const pos = player.location;
        const px = Math.floor(pos.x);
        const py = Math.floor(pos.y);
        const pz = Math.floor(pos.z);
        const key = `${player.dimension.id}:${px}:${py}:${pz}`;
        let state = campfireStates.get(player.id);
        if (!state || state.key !== key || state.refreshesRemaining <= 0) {
            state = {
                key,
                found: findCampfire(player, px, py, pz),
                refreshesRemaining: 5
            };
            campfireStates.set(player.id, state);
        } else {
            state.refreshesRemaining--;
        }

        if (state.found) {
            player.addEffect("regeneration", 20, { amplifier: 2, showParticles: false });
        }
    }
}

export function tickPlayerAttributes(players) {
    for (const player of players) {
        if (!player.hasTag("monarca_sombras")) player.resetLevel();

        const vitality = Math.floor(getScore(player, "vitalidade"));
        const agility = Math.floor(getScore(player, "agilidade"));
        const movementLocked = player.hasTag("in_spawn");
        let state = attributeStates.get(player.id);
        if (!state) state = { vitality: null, agility: null, movementLocked: null };

        if (state.vitality !== vitality) {
            if (vitality > 0) player.runCommand("function system/vida");
            state.vitality = vitality;
        }

        if (state.agility !== agility) {
            player.removeEffect("minecraft:haste");
            if (agility >= 10) {
                player.addEffect("minecraft:haste", 20000000, {
                    amplifier: agility >= 50 ? 2 : 1,
                    showParticles: false
                });
            }
            state.agility = agility;
        }

        if (state.movementLocked !== movementLocked) {
            player.runCommand(`inputpermission set @s movement ${movementLocked ? "disabled" : "enabled"}`);
            state.movementLocked = movementLocked;
        }

        attributeStates.set(player.id, state);
    }
}

