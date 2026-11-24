#!/usr/bin/env node
/**
 * Dev tool (not loaded by the module): builds data/packs.mjs into Daggerheart system documents,
 * writes them as JSON to src/<pack>/ and compiles them into the LevelDB compendiums in packs/.
 *
 *   npm run build
 *
 * Document ids are derived from names, so rebuilding keeps every UUID stable.
 * Each colossus is a framework actor plus one part actor per kind of segment, linked through the
 * system's colossus type data (parts in the same compendium), with a folder per colossus.
 */
import { createHash } from 'node:crypto';
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compilePack } from '@foundryvtt/foundryvtt-cli';
import { COLOSSI, FEATURES, META } from '../data/packs.mjs';
import { segmentKey } from '../scripts/rules.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STATS = { coreVersion: '14.370', systemId: 'daggerheart', systemVersion: '2.13.2', createdTime: null, modifiedTime: null, lastModifiedBy: null, compendiumSource: null, duplicateSource: null };
const ALNUM = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const ACTOR_PACK = 'colossi';
const FEATURE_PACK = 'colossus-features';

/** Stable 16-character id from a seed. */
function sid(...seed) {
    const hash = createHash('sha256').update(seed.join('/')).digest();
    return Array.from(hash.subarray(0, 16), b => ALNUM[b % ALNUM.length]).join('');
}

const attribution = () => ({ source: META.SOURCE, page: null, artist: '' });
const costs = cost => Object.entries(cost ?? {}).map(([key, value]) => ({ scalable: false, key, value, step: null, itemId: null, consumeOnSuccess: false }));

/** "2d10+3" → system damage value. */
function damageValue(formula, multiplier = 'flat') {
    const m = /^(\d+)d(\d+)(?:\s*([+-])\s*(\d+))?$/.exec(String(formula).trim());
    if (!m) return { custom: { enabled: true, formula: String(formula) }, multiplier: 'flat', flatMultiplier: 1, dice: 'd6', bonus: null };
    return {
        custom: { enabled: false, formula: '' },
        multiplier,
        flatMultiplier: Number(m[1]),
        dice: `d${m[2]}`,
        bonus: m[4] ? Number(m[3] === '-' ? -m[4] : m[4]) : null
    };
}

function damagePart(formula, dtype = 'physical', applyTo = 'hitPoints') {
    return {
        value: damageValue(formula),
        applyTo,
        type: applyTo === 'hitPoints' ? [dtype] : [],
        base: false,
        resultBased: false,
        valueAlt: null,
        includeBase: false,
        direct: false,
        fullRestore: false,
        itemId: null
    };
}

function baseAction(id, name, img, extra = {}) {
    return {
        _id: id,
        type: 'effect',
        systemPath: 'actions',
        name,
        img,
        description: '',
        chatDisplay: true,
        actionType: 'action',
        cost: [],
        uses: { value: null, max: '', recovery: null, consumeOnSuccess: false },
        target: { type: 'any', amount: null },
        effects: [],
        range: '',
        areas: [],
        baseAction: false,
        originItem: { type: 'itemCollection' },
        triggers: [],
        ...extra
    };
}

function effectDoc(id, { name, img, statuses = [], changes = [], transfer = false, description = '' }) {
    return {
        _id: id,
        name,
        img,
        type: 'base',
        transfer,
        disabled: false,
        statuses,
        description,
        tint: '#ffffff',
        showIcon: 1,
        sort: 0,
        flags: {},
        system: { changes, duration: { description: '' }, rangeDependence: null, stacking: null, targetDispositions: [], conditionals: [] },
        duration: { value: null, units: 'seconds', expiry: null, expired: false },
        start: null,
        folder: null,
        _stats: STATS
    };
}

/* ------------------------------------------------------------------ */
/*  Features                                                          */
/* ------------------------------------------------------------------ */

/**
 * A feature item. Embedded in an actor when `actorId` is given, otherwise a world item for the
 * features compendium.
 */
function featureDoc(f, { actorId = null, sort = 0 } = {}) {
    const owner = actorId ?? 'features';
    const id = sid(owner, 'feature', f.name, f.text.length);
    const key = actorId ? `!actors.items!${actorId}.${id}` : `!items!${id}`;
    const effectKey = eid => (actorId ? `!actors.items.effects!${actorId}.${id}.${eid}` : `!items.effects!${id}.${eid}`);
    const effects = [];
    const actions = {};
    if (f.act) {
        const a = f.act;
        const actionId = sid(owner, f.name, 'action');
        const action = baseAction(actionId, f.name, f.img, {
            type: a.type === 'save' ? 'attack' : a.type,
            actionType: f.form === 'reaction' ? 'reaction' : 'action',
            cost: costs(a.cost),
            range: a.range ?? '',
            target: { type: 'any', amount: a.targets === null ? null : a.type === 'attack' ? 1 : null }
        });
        if (a.damage || a.stress || a.hope || a.type === 'damage') {
            const resources = {};
            if (a.stress) resources.stress = damagePart(a.stress, null, 'stress');
            if (a.hope) resources.hope = damagePart(a.hope, null, 'hope');
            action.damage = { main: a.damage ? damagePart(a.damage, a.dtype) : null, resources };
        }
        if (a.type === 'attack' || a.type === 'save') {
            action.roll = {
                type: a.type === 'attack' ? 'attack' : null,
                trait: null,
                difficulty: null,
                bonus: a.bonus ?? null,
                advState: a.advantage ? 'advantage' : 'neutral',
                diceRolling: { multiplier: 'prof', flatMultiplier: 1, dice: 'd6', compare: null, treshold: null },
                useDefault: a.type === 'attack' && a.bonus == null
            };
            action.save = { trait: a.type === 'save' ? a.save : null, difficulty: a.difficulty ?? null, damageMod: 'none' };
        }
        if (a.area) action.areas = [{ name: f.name, type: 'placed', shape: 'emanation', size: a.area, hasHole: false, effects: [] }];
        if (a.effect) {
            const effectId = sid(owner, f.name, 'effect');
            effects.push({ ...effectDoc(effectId, a.effect), _key: effectKey(effectId) });
            action.effects = [{ _id: effectId, onSave: false }];
        }
        actions[actionId] = action;
    }
    const flags = {};
    if (f.rule || f.flags) flags[META.MOD] = { ...(f.flags ?? {}), ...(f.rule ? { rule: f.rule } : {}) };
    return {
        _id: id,
        name: f.name,
        type: 'feature',
        img: f.img,
        system: {
            description: f.text,
            featureForm: f.form,
            actions,
            resource: null,
            attribution: actorId ? {} : attribution(),
            gmNotes: '',
            granter: null,
            actorResources: []
        },
        effects,
        folder: null,
        sort,
        ownership: actorId ? undefined : { default: 0 },
        flags,
        _stats: STATS,
        _key: key
    };
}

/* ------------------------------------------------------------------ */
/*  Colossi                                                           */
/* ------------------------------------------------------------------ */

function standardAttack(id, atk) {
    if (!atk) return undefined;
    return {
        name: atk.name,
        range: atk.range,
        roll: {
            bonus: atk.bonus,
            type: 'attack',
            trait: null,
            difficulty: null,
            advState: 'neutral',
            diceRolling: { multiplier: 'prof', flatMultiplier: 1, dice: 'd6', compare: null, treshold: null },
            useDefault: false
        },
        damage: {
            main: { ...damagePart(atk.damage, atk.dtype ?? 'physical'), valueAlt: { multiplier: 'prof', flatMultiplier: 1, dice: 'd6', bonus: null, custom: { enabled: false, formula: '' } } },
            resources: {}
        },
        _id: sid(id, 'attack'),
        systemPath: 'attack',
        type: 'attack',
        description: '',
        img: atk.img,
        chatDisplay: false,
        actionType: 'action',
        cost: [],
        uses: { value: null, max: null, recovery: null, consumeOnSuccess: false },
        target: { type: 'any', amount: 1 },
        effects: [],
        save: { trait: null, difficulty: null, damageMod: 'none' },
        baseAction: true,
        originItem: { type: 'itemCollection' },
        triggers: [],
        areas: []
    };
}

const uuid = id => `Compendium.${META.MOD}.${ACTOR_PACK}.Actor.${id}`;
const experiences = (id, list) => Object.fromEntries((list ?? []).map(([name, value]) => [sid(id, 'experience', name), { name, value, description: '' }]));

function colossusDocs(c, index) {
    const folderId = sid(c.key, 'folder');
    const folder = {
        _id: folderId,
        name: `Tier ${c.tier}: ${c.short}`,
        type: 'Actor',
        sorting: 'm',
        sort: (index + 1) * 100000,
        color: '#4b402e',
        folder: null,
        description: '',
        flags: {},
        _stats: STATS,
        _key: `!folders!${folderId}`
    };
    const frameworkId = sid(c.key, 'framework');
    const parts = c.segments.map(s => ({ ...s, _id: sid(c.key, 'segment', s.name), key: segmentKey(s.name) }));
    const difficulty = Math.max(...parts.map(p => p.difficulty));
    const notes = `<p><strong>Size:</strong> ${c.size}. <strong>Segments:</strong> ${parts.map(p => `${p.quantity ?? 1} ${p.name}`).join(', ')}.</p><p>The framework’s Difficulty is the highest Difficulty among the segments, for effects that target ${c.short} as a whole.</p>`;

    const framework = {
        _id: frameworkId,
        name: c.name,
        type: 'adversary',
        img: c.img,
        system: {
            difficulty,
            damageThresholds: { major: c.thresholds[0], severe: c.thresholds[1] },
            resources: { hitPoints: { value: 0, max: 0 }, stress: { value: 0, max: c.stress } },
            motivesAndTactics: c.motives,
            resistance: { physical: { resistance: false, immunity: false, reduction: 0 }, magical: { resistance: false, immunity: false, reduction: 0 } },
            type: 'colossus',
            typeData: { type: 'colossus', role: 'framework', parts: parts.map(p => ({ uuid: uuid(p._id), originalUuid: null, quantity: p.quantity ?? 1 })), frameworkUuid: null },
            notes,
            experiences: experiences(frameworkId, c.experiences),
            tier: c.tier,
            description: c.description,
            attribution: attribution(),
            size: 'gargantuan',
            advantageSources: [],
            disadvantageSources: [],
            criticalThreshold: 20
        },
        prototypeToken: {
            name: c.short,
            displayName: 20,
            displayBars: 0,
            actorLink: false,
            width: 4,
            height: 4,
            disposition: -1,
            texture: { src: c.img, fit: 'contain', anchorX: 0.5, anchorY: 0.5, scaleX: 1, scaleY: 1 },
            ring: { enabled: false }
        },
        items: c.features.map((f, i) => featureDoc(f, { actorId: frameworkId, sort: (i + 1) * 1000 })),
        effects: [],
        folder: folderId,
        sort: 0,
        ownership: { default: 0 },
        flags: { [META.MOD]: { colossus: { key: c.key, size: c.size } } },
        _stats: STATS,
        _key: `!actors!${frameworkId}`
    };

    const segments = parts.map((p, i) => ({
        _id: p._id,
        name: `${c.short} ${p.name}`,
        type: 'adversary',
        img: c.img,
        system: {
            difficulty: p.difficulty,
            damageThresholds: { major: c.thresholds[0], severe: c.thresholds[1] },
            resources: { hitPoints: { value: 0, max: p.hp }, stress: { value: 0, max: c.stress } },
            motivesAndTactics: '',
            resistance: { physical: { resistance: false, immunity: false, reduction: 0 }, magical: { resistance: false, immunity: false, reduction: 0 } },
            type: 'colossus',
            typeData: { type: 'colossus', role: 'part', parts: [], frameworkUuid: null },
            notes: '',
            experiences: experiences(frameworkId, c.experiences),
            tier: c.tier,
            description: c.description,
            ...(p.attack ? { attack: standardAttack(p._id, p.attack) } : {}),
            attribution: attribution(),
            size: 'large',
            advantageSources: [],
            disadvantageSources: [],
            criticalThreshold: 20
        },
        prototypeToken: {
            name: p.name,
            displayName: 20,
            displayBars: p.hp ? 20 : 0,
            actorLink: false,
            width: 2,
            height: 2,
            disposition: -1,
            texture: { src: c.img, fit: 'contain', anchorX: 0.5, anchorY: 0.5, scaleX: 1, scaleY: 1 },
            ring: { enabled: false }
        },
        items: p.features.map((f, j) => featureDoc(f, { actorId: p._id, sort: (j + 1) * 1000 })),
        effects: [],
        folder: folderId,
        sort: (i + 1) * 1000,
        ownership: { default: 0 },
        flags: { [META.MOD]: { segment: { key: p.key, adjacent: p.adjacent, ground: p.ground !== false, attack: !!p.attack, slots: p.slots } } },
        _stats: STATS,
        _key: `!actors!${p._id}`
    }));
    return { folder, actors: [framework, ...segments] };
}

/* ------------------------------------------------------------------ */
/*  Write and compile                                                 */
/* ------------------------------------------------------------------ */

const fileName = doc => `${doc.name.replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_|_$/g, '')}_${doc._id}.json`;

async function writePack(name, docs) {
    const src = path.join(ROOT, 'src', name);
    await rm(src, { recursive: true, force: true });
    await mkdir(src, { recursive: true });
    for (const doc of docs) await writeFile(path.join(src, fileName(doc)), `${JSON.stringify(doc, null, 2)}\n`);
    const dest = path.join(ROOT, 'packs', name);
    await rm(dest, { recursive: true, force: true });
    await compilePack(src, dest, { log: false });
    const files = await readdir(dest);
    console.log(`${name}: ${docs.length} documents → packs/${name} (${files.length} files)`);
}

const built = COLOSSI.map(colossusDocs);
await writePack(ACTOR_PACK, [...built.map(b => b.folder), ...built.flatMap(b => b.actors)]);
await writePack(FEATURE_PACK, FEATURES.map((f, i) => featureDoc(f, { sort: (i + 1) * 1000 })));
