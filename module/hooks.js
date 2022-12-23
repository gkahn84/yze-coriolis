import { resetCrewForShip } from "./actor/crew.js";
import { createBlankEPTokens, setActiveEPTokens } from "./item/ep-token.js";
import { displayDarknessPoints } from "./darkness-points.js";

// eslint-disable-next-line no-unused-vars
Hooks.on("updateUser", (entity, delta, options, userId) => {
  // we avoid any null sets because we are just doing a clearing of the flag
  // before setting it to a valid value.
  const isSettingDP =
    hasProperty(delta, "flags.yzecoriolis.darknessPoints") &&
    delta.flags.yzecoriolis.darknessPoints !== null;

  if (options.diff && isSettingDP) {
    if (game.user.isGM) {
      displayDarknessPoints();
    }
  }
});

// eslint-disable-next-line no-unused-vars
Hooks.on("updateActor", (entity, delta, options, userId) => {
  // since the main character sheet edit only updates the key art field, and
  // this size isn't suitable for the actor browser, we hook into the actor
  // update and propagate any token updates to the actor's img field.
  if (options.diff && hasProperty(delta, "prototypeToken")) {
    // there is two cases here:
    // 1. A brand new image has been propagated up. that means the delta
    //    here will have an image field
    // 2. There is no 'img' field, and the token field was a non-img update.
    //    in #1 we just copy the delta. in #2 we will attempt to source the
    //    data (if available) from the already existing token object on the
    //    actor entity.
    if (hasProperty(delta, "prototypeToken.texture.src")) {
      entity.update({ img: delta.prototypeToken.texture.src });
    } else {
      if (hasProperty(entity, "prototypeToken.texture.src")) {
        entity.update({ img: entity.prototypeToken.texture.src });
      }
    }
  }

  rerenderAllShips();
});

// eslint-disable-next-line no-unused-vars
Hooks.on("deleteActor", (entity, options, userId) => {
  if (entity.type === "ship") {
    resetCrewForShip(entity.id).then(() => {
      rerenderAllCrew();
    });
  }
});

// eslint-disable-next-line no-unused-vars
Hooks.on("createActor", async (entity, options, userId) => {
  if (entity.type === "ship") {
    rerenderAllCrew();
    await createEPTokensForShip(entity);
    await setMaxEPTokensActive(entity);
  }
});

Hooks.on("renderCombatTracker", (app, html, combatInfo) => {
  const currentCombat = combatInfo.combats[combatInfo.currentIndex - 1];
  if (currentCombat) {
    html.find(".combatant").each((i, el) => {
      const id = el.dataset.combatantId;
      const combatant = currentCombat.combatants.find((c) => c.id === id);
      const initDiv = el.getElementsByClassName("token-initiative")[0];

      if (combatant.initiative != null) {
        const readOnly = game.user.isGM ? "" : "readonly";
        initDiv.innerHTML = `<input style="color: white; "type="number" ${readOnly} value="${combatant.initiative}">`;

        initDiv.addEventListener("change", async (e) => {
          const inputElement = e.target;
          const combatantId = inputElement.closest("[data-combatant-id]")
            .dataset.combatantId;
          await currentCombat.setInitiative(combatantId, inputElement.value);
        });
      }
    });
  }
});

Hooks.on("getChatLogEntryContext", (html, options) => {
  // Check if we can apply damage (roll is visible, contains damage and player
  // has control over at least one selected token)
  let canApply = (li) => {
    const message = game.messages.get(li.data("messageId"));
    const rollData = message.flags.yzecoriolis.results.rollData;
    return (
      rollData?.damage &&
      message?.isContentVisible &&
      canvas.tokens?.controlled.length
    );
  };

  // TODO: If target wears armor, allow to ake armor roll first

  // Add context menu if we can apply
  options.push({
    name: game.i18n.localize("YZECORIOLIS.ApplyChatContextDamage"),
    icon: '<i class="fas fa-user-minus"></i>',
    condition: canApply,
    callback: (li) => {
      const message = game.messages.get(li.data("messageId"));
      const rollData = message.flags.yzecoriolis.results.rollData;
      canvas.tokens.controlled.map((t) => {
        const a = t.actor;
        a.applyDamage(rollData.damage);
      });
    },
  });
  return options;
});

function rerenderAllCrew() {
  // re render all characters/npcs to update their crew position drop downs.
  for (let e of game.actors.contents) {
    let rootData = e;
    if (rootData.type === "character" || rootData.type === "npc") {
      e.render(false);
    }
  }
}

function rerenderAllShips() {
  // re render all ships to update their crew tabs.
  for (let e of game.actors.contents) {
    if (e.type === "ship") {
      e.render(false);
    }
  }
}

async function createEPTokensForShip(entity) {
  await createBlankEPTokens(entity, CONFIG.YZECORIOLIS.MaxEPTokensPerShip);
}

// setMaxEPTokensActive sets maxEnergyPoints worth of EP tokens active for the
// ship on initial creation so the bar isn't empty when you creat a new ship.
async function setMaxEPTokensActive(entity) {
  const epMax = entity.system.maxEnergyPoints;
  if (epMax) {
    await setActiveEPTokens(entity, epMax);
  }
}
