export const MODULE_ID = 'dh-colossus';
export const CORE_ID = 'daggerheart-core';
export const SYSTEM_ID = 'daggerheart';

/** Art from the Core Rulebook module (loaded from that module, not included here). */
const CORE_ART = `modules/${CORE_ID}/assets/art`;
export const ART = {
    intro: `${CORE_ART}/frame-290-colossus-intro-transparent.webp`,
    godfell: `${CORE_ART}/frame-292-colossus-godfellmountain.webp`,
    essentia: `${CORE_ART}/frame-297-colossus-essentia.webp`,
    faceoff: `${CORE_ART}/frame-300-colossus-faceoff.webp`,
    climbing: `${CORE_ART}/frame-302-colossus-climbingikeri.webp`,
    teamwork: `${CORE_ART}/frame-303-colossus-teamwork.webp`
};

/** Pages of the Core Rulebook compendium, chapter 5. */
const CHAPTER = `Compendium.${CORE_ID}.core.JournalEntry.dagheart07chapte.JournalEntryPage`;
export const CORE_PAGES = {
    statBlocks: `${CHAPTER}.07colossusstat00`,
    features: `${CHAPTER}.07examplefeatu00`,
    moving: `${CHAPTER}.07movingpcsaro00`,
    battle: `${CHAPTER}.07usingacoloss00`,
    hunts: `${CHAPTER}.07huntsandinte00`,
    levelingUp: `${CHAPTER}.07levelingup0000`,
    kudamat: `${CHAPTER}.07emergenceofk00`
};

export const PACKS = {
    colossi: `${MODULE_ID}.colossi`,
    features: `${MODULE_ID}.colossus-features`
};

/** Status ids added by this module. */
export const STATUS = {
    broken: 'dhcoBroken',
    destroyed: 'dhcoDestroyed',
    collapsed: 'dhcoCollapsed',
    shaken: 'dhcoShaken',
    rattled: 'dhcoRattled',
    trapped: 'dhcoTrapped'
};

export const STATUS_ICONS = {
    [STATUS.broken]: 'icons/magic/control/debuff-chains-shackle-movement-red.webp',
    [STATUS.destroyed]: 'icons/magic/earth/projectile-boulder-debris.webp',
    [STATUS.collapsed]: 'icons/magic/earth/barrier-stone-explosion-red.webp',
    [STATUS.shaken]: 'icons/magic/control/fear-fright-shadow-monster-red.webp',
    [STATUS.rattled]: 'icons/magic/earth/strike-fist-stone-light.webp',
    [STATUS.trapped]: 'icons/commodities/bones/beak-hooked-red.webp'
};

/** Localize under this module's namespace, with optional format data. */
export const L = (key, data) => (data ? game.i18n.format(`DHCO.${key}`, data) : game.i18n.localize(`DHCO.${key}`));

export const hasCore = () => !!game.modules.get(CORE_ID)?.active;
export const esc = s => foundry.utils.escapeHTML(String(s ?? ''));
export const setting = key => game.settings.get(MODULE_ID, key);
