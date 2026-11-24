/**
 * The colossus rules of the Colossus of the Drylands campaign frame, as pure functions (no Foundry
 * globals), so they can be tested with node:test.
 *
 * Segment rules come from the segment's features. A feature is recognised by its name, following
 * the book's convention ("Fatal", "Chain (A)", "Strike (Melee)", "Armored", "Climbing (+3)",
 * "Not Climbable", "Weak Point", "Invulnerable", "Protected", "Cascade", "Collapse"...), so
 * homebrew colossi built from the book's example features are automated too. A feature can carry
 * a `rule` flag with the exact parameters, which wins over what the name says.
 */

/** Daggerheart ranges, nearest first. */
export const RANGES = ['melee', 'veryClose', 'close', 'far', 'veryFar'];

const RANGE_WORDS = {
    melee: 'melee',
    'very close': 'veryClose',
    veryclose: 'veryClose',
    close: 'close',
    far: 'far',
    'very far': 'veryFar',
    veryfar: 'veryFar'
};

/** "Very Close" → "veryClose". Unknown text gives null. */
export function rangeKey(text) {
    if (!text) return null;
    if (RANGES.includes(text)) return text;
    return RANGE_WORDS[String(text).trim().toLowerCase().replace(/\s+/g, ' ')] ?? null;
}

/** True if range a is the same as or nearer than range b. */
export const withinRange = (a, b) => RANGES.indexOf(a) >= 0 && RANGES.indexOf(a) <= RANGES.indexOf(b);

/** Segment key from a label: "Forelegs" / "Foreleg" / "Left Foreleg" → "foreleg". */
export function segmentKey(label) {
    const words = String(label ?? '')
        .toLowerCase()
        .replace(/\(.*?\)/g, ' ')
        .replace(/[^\p{L}\p{N} ]+/gu, ' ')
        .trim()
        .split(/\s+/)
        .filter(w => w && !['left', 'right', 'front', 'back', 'rear', 'upper', 'lower', 'the'].includes(w));
    const last = words.join('-') || 'segment';
    return last.length > 3 && last.endsWith('s') && !last.endsWith('ss') ? last.slice(0, -1) : last;
}

/**
 * The segment's label from its actor name and the colossus name: "Ikeri Head" in "Ikeri, Injuries
 * Untold" → "Head". Falls back to the whole name.
 */
export function segmentLabel(name, colossusName) {
    const short = String(colossusName ?? '').split(/[,:(]/)[0].trim();
    let label = String(name ?? '').trim();
    if (short && label.toLowerCase().startsWith(short.toLowerCase())) label = label.slice(short.length);
    label = label.replace(/^[\s’'s:,-]+/u, '').replace(/\s*\(\d+\)\s*$/, '').trim();
    return label || String(name ?? '').trim();
}

const NUMBER_WORDS = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5 };
const num = s => (s == null ? null : (NUMBER_WORDS[String(s).toLowerCase()] ?? Number(String(s).replace(/[−–]/g, '-').replace(/\s+/g, ''))));
const strip = html =>
    String(html ?? '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

/**
 * One feature → a rule, or null if it isn't a colossus feature this module automates.
 * @param {{name: string, description?: string, rule?: object}} feature
 */
export function parseFeature({ name, description, rule } = {}) {
    const n = String(name ?? '').trim();
    const text = strip(description);
    let parsed = null;
    let m;
    if (/^fatal\b/i.test(n)) parsed = { type: 'fatal' };
    else if ((m = /^chain\b(?:\s*\(([^)]+)\))?/i.exec(n))) parsed = { type: 'chain', chain: (m[1] ?? 'A').trim().toUpperCase() };
    else if ((m = /^strike\s*\(([^)]+)\)/i.exec(n))) parsed = { type: 'strike', range: rangeKey(m[1]) ?? 'melee' };
    else if (/^armou?red\b/i.test(n)) parsed = { type: 'armored', amount: 1 };
    else if ((m = /^climbing\s*\(\s*([+\-−–]?\s*\d+)\s*\)/i.exec(n))) {
        parsed = { type: 'climbing', mod: num(m[1]) };
        const unless = /unless the (\w[\w\s]*?) is (broken|destroyed)/i.exec(text);
        if (unless) parsed.unless = { key: segmentKey(unless[1]), states: [unless[2].toLowerCase()] };
    } else if (/^not climbable\b/i.test(n)) parsed = { type: 'notClimbable' };
    else if (/^weak point\b/i.test(n)) {
        parsed = { type: 'weakPoint', amount: 1, range: 'melee' };
        const w = /while the (\w[\w\s]*?) is (broken or destroyed|broken|destroyed)/i.exec(text);
        if (w) parsed.while = { key: segmentKey(w[1]), states: w[2].toLowerCase().split(' or ') };
    } else if (/^invulnerable\b/i.test(n)) {
        parsed = { type: 'invulnerable' };
        if (/only take damage while it.s broken/i.test(text)) parsed.unlessSelf = 'broken';
    } else if (/^protected\b/i.test(n)) {
        parsed = { type: 'protected' };
        const u = /unless the (\w[\w\s]*?) is (?:currently )?(broken or destroyed|broken|destroyed)/i.exec(text);
        if (u) parsed.unless = { key: segmentKey(u[1]), states: u[2].toLowerCase().split(' or ') };
        else if (/only marks hp from the .?cascade/i.test(text)) parsed.onlyCascade = true;
        else parsed.manual = true;
    } else if (/^cascade\b/i.test(n)) {
        const c = /the (\w[\w\s]*?) must mark (a|an|one|two|three|\d+) hp/i.exec(text);
        parsed = { type: 'cascade', target: c ? segmentKey(c[1]) : null, hp: c ? num(c[2]) : 1 };
    } else if (/^(full )?collapse[ds]?\b/i.test(n)) {
        parsed = { type: 'collapse', when: 'manual' };
        let c;
        if ((c = /marks at least 1 hp on all (\w+) segments/i.exec(text))) parsed = { type: 'collapse', when: 'allMarked', group: segmentKey(c[1]) };
        else if ((c = /once (\w+) (\w+?)s? are destroyed/i.exec(text))) parsed = { type: 'collapse', when: 'destroyed', group: segmentKey(c[2]), count: num(c[1]), permanent: true };
        else if ((c = /if (one|a) (\w+) is destroyed/i.exec(text))) {
            parsed = { type: 'collapse', when: 'destroyed', group: segmentKey(c[2]), count: 1, token: true };
            if (/both .* are destroyed, .* collapsed permanently/i.test(text)) parsed.permanentAt = 2;
        }
    }
    if (rule && typeof rule === 'object') parsed = { ...(parsed ?? {}), ...rule };
    return parsed?.type ? parsed : null;
}

/** All the rules of a segment, from its features. */
export function segmentRules(features = []) {
    const rules = { fatal: false, chains: [], strike: null, armored: 0, climbing: null, notClimbable: false, weakPoint: null, invulnerable: null, protected: null, cascade: [], collapse: [], list: [] };
    for (const f of features) {
        const r = parseFeature(f);
        if (!r) continue;
        rules.list.push({ ...r, name: f.name });
        switch (r.type) {
            case 'fatal':
                rules.fatal = true;
                break;
            case 'chain':
                if (!rules.chains.includes(r.chain)) rules.chains.push(r.chain);
                break;
            case 'strike':
                rules.strike = r.range;
                break;
            case 'armored':
                rules.armored += r.amount ?? 1;
                break;
            case 'climbing':
                rules.climbing = r;
                break;
            case 'notClimbable':
                rules.notClimbable = true;
                break;
            case 'weakPoint':
                rules.weakPoint = r;
                break;
            case 'invulnerable':
                rules.invulnerable = r;
                break;
            case 'protected':
                rules.protected = r;
                break;
            case 'cascade':
                rules.cascade.push(r);
                break;
            case 'collapse':
                rules.collapse.push(r);
                break;
        }
    }
    return rules;
}

/**
 * True if any segment with this key is in one of the states.
 * @param {Array<{key: string, broken?: boolean, destroyed?: boolean}>} segments
 */
export function anyIn(segments, key, states) {
    return segments.some(s => s.key === key && states.some(st => (st === 'broken' ? s.broken : st === 'destroyed' ? s.destroyed : false)));
}

/** "Massive damage" counts as 4 HP when the optional rule is on. */
export function hpFromDamage(damage, { major, severe }, massive = false) {
    if (!(damage > 0)) return 0;
    if (massive && severe > 0 && damage >= severe * 2) return 4;
    if (damage >= severe) return 3;
    if (damage >= major) return 2;
    return 1;
}

/**
 * How many HP a segment marks from damage, after its colossus rules.
 * @param {object} p
 * @param {number} p.hp             HP the damage would mark by the thresholds
 * @param {object} p.rules          segmentRules() of the target
 * @param {object} p.segment        the target {key, broken, destroyed, hpMax}
 * @param {Array}  p.segments       every segment of the colossus {key, broken, destroyed}
 * @param {string|null} p.range     range the attack was made within (null if unknown)
 * @param {'attack'|'cascade'|'direct'} [p.source]
 * @returns {{hp: number, notes: Array<{rule: string, change: string}>}}
 */
export function segmentDamage({ hp, rules, segment, segments = [], range = null, source = 'attack' }) {
    const notes = [];
    const immune = rule => {
        notes.push({ rule, change: 'immune' });
        return { hp: 0, notes };
    };
    if (!(segment?.hpMax > 0)) return hp > 0 ? immune('noHp') : { hp: 0, notes };
    if (hp <= 0) return { hp: 0, notes };
    if (source === 'cascade') return { hp, notes };

    const inv = rules.invulnerable;
    if (inv && !(inv.unlessSelf === 'broken' && segment.broken)) return immune('invulnerable');
    const prot = rules.protected;
    if (prot && !prot.manual) {
        if (prot.onlyCascade) return immune('protected');
        if (prot.unless && !anyIn(segments, prot.unless.key, prot.unless.states)) return immune('protected');
    }
    if (source === 'attack' && rules.strike && range && !withinRange(range, rules.strike)) return immune('strike');

    let out = hp;
    if (source === 'attack' && rules.armored) {
        const less = Math.min(rules.armored, out);
        if (less) {
            out -= less;
            notes.push({ rule: 'armored', change: `-${less}` });
        }
    }
    const wp = rules.weakPoint;
    if (source === 'attack' && wp && out > 0 && range && withinRange(range, wp.range ?? 'melee') && (!wp.while || anyIn(segments, wp.while.key, wp.while.states))) {
        out += wp.amount ?? 1;
        notes.push({ rule: 'weakPoint', change: `+${wp.amount ?? 1}` });
    }
    return { hp: out, notes };
}

/**
 * Is the colossus defeated?
 * @param {Array<{key: string, label: string, destroyed: boolean, hpMax: number, rules: object}>} segments
 * @returns {null | {reason: 'fatal'|'chain'|'all', label?: string, chain?: string}}
 */
export function defeatCheck(segments) {
    const damageable = segments.filter(s => s.hpMax > 0);
    if (!damageable.length) return null;
    const fatal = damageable.find(s => s.rules?.fatal && s.destroyed);
    if (fatal) return { reason: 'fatal', label: fatal.label };
    const chains = new Set(damageable.flatMap(s => s.rules?.chains ?? []));
    for (const chain of chains) {
        const members = damageable.filter(s => s.rules?.chains?.includes(chain));
        if (members.length && members.every(s => s.destroyed)) return { reason: 'chain', chain };
    }
    if (damageable.every(s => s.destroyed)) return { reason: 'all' };
    return null;
}

/**
 * Collapse triggers met by the segments' state. Returns the strongest one:
 * { permanent: boolean, token: boolean, source: label } or null.
 */
export function collapseCheck(segments) {
    let result = null;
    for (const seg of segments) {
        for (const c of seg.rules?.collapse ?? []) {
            const group = segments.filter(s => s.key === (c.group ?? seg.key));
            if (!group.length) continue;
            let hit = null;
            if (c.when === 'allMarked' && group.every(s => s.hpValue > 0)) hit = { permanent: false, token: false };
            else if (c.when === 'destroyed') {
                const n = group.filter(s => s.destroyed).length;
                if (c.permanentAt && n >= c.permanentAt) hit = { permanent: true, token: false };
                else if (n >= (c.count ?? 1)) hit = { permanent: !!c.permanent, token: !!c.token };
            }
            if (hit && (!result || (hit.permanent && !result.permanent))) result = { ...hit, source: seg.label };
        }
    }
    return result;
}

/**
 * Can a PC move from one place to a segment?
 * @param {string|null} fromKey  key of the segment they're on, or null on the ground
 * @param {object} to            target segment {key, rules, adjacent: string[]}
 * @param {object} p
 * @param {Array}  p.segments    all segments {key, adjacent}
 * @param {boolean} p.collapsed  is the colossus Collapsed?
 * @returns {{ok: boolean, why?: string}}
 */
export function canReach(fromKey, to, { segments = [], collapsed = false } = {}) {
    if (fromKey == null) {
        if (to.rules?.notClimbable && !collapsed) return { ok: false, why: 'notClimbable' };
        if (to.groundAccess === false && !collapsed) return { ok: false, why: 'notFromGround' };
        return { ok: true };
    }
    if (fromKey === to.key) return { ok: true, why: 'same' };
    const from = segments.find(s => s.key === fromKey);
    const adjacent = new Set([...(from?.adjacent ?? []), ...(segments.filter(s => s.adjacent?.includes(fromKey)).map(s => s.key))]);
    if (!from?.adjacent?.length && !segments.some(s => s.adjacent?.length)) return { ok: true };
    return adjacent.has(to.key) ? { ok: true } : { ok: false, why: 'notAdjacent' };
}

/** Difficulty of the roll to climb onto or leap to a segment. */
export function climbDifficulty(segment, segments = []) {
    const c = segment.rules?.climbing;
    let mod = 0;
    if (c && !(c.unless && anyIn(segments, c.unless.key, c.unless.states))) mod = c.mod ?? 0;
    return { difficulty: (segment.difficulty ?? 10) + mod, mod };
}

/* ------------------------------------------------------------------ */
/*  Emergence of Kudamat                                              */
/* ------------------------------------------------------------------ */

export const SIPHON_MAX = 10;
export const POWER_MAX = 100;
export const COLOSSI_TO_SLAY = 9;

/** Mark the Siphoning Track: +1 for a short rest, +2 for a long rest (during a hunt). */
export function markSiphon(track, kind) {
    return Math.min(SIPHON_MAX, Math.max(1, track) + (kind === 'long' ? 2 : 1));
}

/**
 * The soul shard gives power back to Kudamat: roll as many d12 as marked slots, add the highest
 * to his Power and reset the track to 1.
 * @param {number[]} dice results of the d12s
 */
export function siphonResult(track, power, dice) {
    const highest = dice.length ? Math.max(...dice) : 0;
    return { track: 1, power: Math.min(POWER_MAX, power + highest), gained: highest, dice };
}

/** Kudamat's thresholds from his Power. */
export const kudamatThresholds = power => ({ major: Math.ceil(power / 2), severe: power });

/** Kudamat emerges when nine colossi are slain or his Power reaches 100. */
export const kudamatEmerges = (slain, power) => slain >= COLOSSI_TO_SLAY || power >= POWER_MAX;

/* ------------------------------------------------------------------ */
/*  Board layout                                                      */
/* ------------------------------------------------------------------ */

/** Board size in cells. */
export const BOARD = { cols: 12, rows: 10 };

/** A simple layout for segments that have none: rows of cards, centred. */
export function autoLayout(count) {
    const perRow = Math.min(count, 4);
    const w = 3;
    const h = 2;
    const rows = Math.ceil(count / perRow);
    const out = [];
    for (let i = 0; i < count; i++) {
        const row = Math.floor(i / perRow);
        const inRow = row === rows - 1 ? count - row * perRow : perRow;
        const col = i - row * perRow;
        const x0 = Math.round((BOARD.cols - inRow * w) / 2);
        out.push({ x: x0 + col * w, y: 1 + row * (h + 1), w, h });
    }
    return out;
}

/** Keep a card inside the board. */
export function clampSlot({ x, y, w, h }) {
    w = Math.max(2, Math.min(BOARD.cols, Math.round(w)));
    h = Math.max(1, Math.min(BOARD.rows, Math.round(h)));
    x = Math.max(0, Math.min(BOARD.cols - w, Math.round(x)));
    y = Math.max(0, Math.min(BOARD.rows - h, Math.round(y)));
    return { x, y, w, h };
}
