import { CORE_ID, L, MODULE_ID } from './constants.mjs';
import { ColossusBoard, climb, openBoard, registerBoardRefresh } from './board.mjs';
import { colossusModel, frameworkTokens, ridingOn } from './colossus.mjs';
import { defeat, registerAutomation, registerConditions } from './automation.mjs';
import { DrylandsApp, buildKudamat, markRest, openDrylands, readCampaign, refreshDrylands, registerRestTracking, rollSiphon, shatter } from './drylands.mjs';
import { arrangeTokens, registerPlacement } from './placement.mjs';
import { registerQueries, setBroken, setCollapsed, setRider } from './state.mjs';
import { registerUI } from './ui.mjs';
import * as rules from './rules.mjs';

/**
 * Load the stylesheet with a version query. Foundry links module CSS by bare path, and a caching
 * proxy would otherwise keep serving last release's styles. Same cascade layer Foundry uses for module styles.
 */
function loadStyles() {
    const version = game.modules.get(MODULE_ID)?.version ?? Date.now();
    const style = document.createElement('style');
    style.id = `${MODULE_ID}-styles`;
    style.textContent = `@import url("modules/${MODULE_ID}/styles/colossus.css?v=${encodeURIComponent(version)}") layer(modules);`;
    document.head.append(style);
}

function registerSettings() {
    const world = (k, type, def, extra = {}) =>
        game.settings.register(MODULE_ID, k, { name: `DHCO.Settings.${k}.Name`, hint: `DHCO.Settings.${k}.Hint`, scope: 'world', config: true, type, default: def, ...extra });
    world('damageRules', Boolean, true);
    world('enforce', Boolean, true);
    world('riderAdvantage', Boolean, true);
    world('collapse', Boolean, true);
    world('climbRolls', Boolean, true);
    world('moveTokens', Boolean, true);
    world('autoArrange', Boolean, true);
    world('arrangeScale', Number, 1, { range: { min: 0.5, max: 3, step: 0.25 } });
    world('conditions', Boolean, true, { requiresReload: true });
    world('campaign', Boolean, true);
    world('autoSiphon', Boolean, true);
    world('restWindow', Number, 10, { range: { min: 1, max: 60, step: 1 } });
    world('campaignPublic', Boolean, true);
    game.settings.register(MODULE_ID, 'drylands', { scope: 'world', config: false, type: Object, default: {}, onChange: () => refreshDrylands() });
}

Hooks.once('init', () => {
    loadStyles();
    registerSettings();
    registerQueries();
    registerUI();
    game.modules.get(MODULE_ID).api = {
        openBoard,
        openDrylands,
        colossi: () => frameworkTokens().map(colossusModel),
        model: fwToken => colossusModel(fwToken),
        ridingOn,
        climb,
        setRider,
        setBroken,
        setCollapsed,
        arrange: arrangeTokens,
        defeat,
        campaign: readCampaign,
        markRest,
        rollSiphon,
        shatter,
        buildKudamat,
        rules,
        apps: { ColossusBoard, DrylandsApp }
    };
});

// The system sets its conditions in "setup"; ours go after them.
Hooks.once('setup', () => registerConditions());

Hooks.once('ready', () => {
    registerPlacement();
    registerAutomation();
    registerBoardRefresh();
    registerRestTracking();
    if (game.user.isGM && !game.modules.get(CORE_ID)?.active) ui.notifications.warn(L('Notify.NoCoreModule'), { permanent: true });
});
