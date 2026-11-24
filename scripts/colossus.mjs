/**
 * The colossi on a scene, as the module sees them: a framework token, its segment tokens (the
 * system links them through its colossus type data) and the state of the fight, kept in flags.
 *
 *   framework token flags.dh-colossus: { riders: [{actor: uuid, seg: segmentTokenId}], collapsed: {tokens, permanent}, defeated }
 *   segment token flags.dh-colossus:   { slot, broken }   (Broken tokens)
 *   segment actor flags.dh-colossus.segment: { key, adjacent, ground, slots: [{label, x, y, w, h}] }
 */
import { MODULE_ID, STATUS } from './constants.mjs';
import { autoLayout, clampSlot, segmentKey, segmentLabel, segmentRules } from './rules.mjs';

export const isColossus = actor => actor?.type === 'adversary' && actor.system?.type === 'colossus' && actor.system?.typeData?.type === 'colossus';
export const isFramework = actor => isColossus(actor) && actor.system.typeData.role === 'framework';
export const isSegment = actor => isColossus(actor) && actor.system.typeData.role === 'part';

/** Framework tokens on a scene. */
export function frameworkTokens(scene = canvas?.scene) {
    return scene?.tokens.filter(t => isFramework(t.actor)) ?? [];
}

/** The framework token a segment token belongs to. */
export function frameworkOf(segmentToken) {
    const actor = segmentToken?.actor;
    if (!isSegment(actor)) return null;
    const fw = actor.system.typeData.frameworkActor;
    if (fw?.token) return fw.token;
    return segmentToken.parent?.tokens.find(t => isFramework(t.actor) && segmentTokensOf(t).includes(segmentToken)) ?? null;
}

/** Segment tokens of a framework token. */
export function segmentTokensOf(frameworkToken) {
    const fw = frameworkToken?.actor;
    if (!fw) return [];
    return frameworkToken.parent.tokens.filter(t => {
        if (!isSegment(t.actor)) return false;
        const td = t.actor.system.typeData;
        return td.frameworkActor === fw || td.frameworkUuid === fw.uuid || td._source?.frameworkUuid === fw.uuid;
    });
}

/** Features of an actor, as the rules parser reads them. */
export const featuresOf = actor =>
    actor.items
        .filter(i => i.type === 'feature')
        .map(i => ({ name: i.name, description: i.system.description, rule: i.getFlag(MODULE_ID, 'rule'), item: i }));

/** A segment actor's configuration, with defaults for segments this module didn't build. */
export function segmentConfig(actor, colossusName) {
    const cfg = actor?.getFlag(MODULE_ID, 'segment') ?? {};
    const label = segmentLabel(actor?.name, colossusName);
    return {
        label,
        key: cfg.key || segmentKey(label),
        adjacent: Array.isArray(cfg.adjacent) ? cfg.adjacent : [],
        ground: cfg.ground !== false,
        slots: Array.isArray(cfg.slots) ? cfg.slots : []
    };
}

export const brokenTokens = token => Number(token?.getFlag(MODULE_ID, 'broken') ?? 0) || 0;
export const fightState = fwToken => ({
    riders: Array.isArray(fwToken?.getFlag(MODULE_ID, 'riders')) ? fwToken.getFlag(MODULE_ID, 'riders') : [],
    collapsed: fwToken?.getFlag(MODULE_ID, 'collapsed') ?? null,
    defeated: fwToken?.getFlag(MODULE_ID, 'defeated') ?? null
});

/**
 * Everything about one colossus on the scene.
 * @param {TokenDocument} fwToken
 */
export function colossusModel(fwToken) {
    const fw = fwToken.actor;
    // A token actor takes the token's name ("Ikeri"); the world actor keeps the full one.
    const name = game.actors.get(fwToken.actorId)?.name ?? fw.name;
    const state = fightState(fwToken);
    const tokens = segmentTokensOf(fwToken);

    // Instances of the same segment actor (two Legs) take their slots in order of their slot flag.
    const groups = new Map();
    for (const t of tokens) {
        const k = t.actorId ?? t.actor.id;
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k).push(t);
    }
    const partOrder = (fw.system.typeData.parts ?? []).map(p => p.uuid);
    const segments = [];
    const missing = [];
    for (const group of groups.values()) {
        group.sort((a, b) => (a.getFlag(MODULE_ID, 'slot') ?? 99) - (b.getFlag(MODULE_ID, 'slot') ?? 99) || a.sort - b.sort || a.id.localeCompare(b.id));
        const cfg = segmentConfig(group[0].actor, name);
        const rules = segmentRules(featuresOf(group[0].actor));
        group.forEach((token, i) => {
            const actor = token.actor;
            const hp = actor.system.resources.hitPoints;
            const slot = cfg.slots[i];
            const label = slot?.label || (group.length > 1 ? `${cfg.label} ${i + 1}` : cfg.label);
            const seg = {
                id: token.id,
                token,
                actor,
                label,
                key: cfg.key,
                adjacent: cfg.adjacent,
                groundAccess: cfg.ground,
                slotIndex: i,
                layout: slot ? clampSlot(slot) : null,
                hpValue: hp?.value ?? 0,
                hpMax: hp?.max ?? 0,
                difficulty: actor.system.difficulty,
                brokenTokens: brokenTokens(token),
                broken: brokenTokens(token) > 0 || actor.statuses.has(STATUS.broken),
                destroyed: (hp?.max ?? 0) > 0 && (hp?.value ?? 0) >= hp.max,
                rules,
                order: partOrder.findIndex(u => u === actor.uuid || u === actor._stats?.compendiumSource || u === `Actor.${token.actorId}`)
            };
            if (!seg.layout) missing.push(seg);
            segments.push(seg);
        });
    }
    segments.sort((a, b) => (a.order < 0 ? 99 : a.order) - (b.order < 0 ? 99 : b.order) || a.slotIndex - b.slotIndex);
    autoLayout(missing.length).forEach((l, i) => (missing[i].layout = l));

    const fwFeatures = featuresOf(fw);
    const flying = fwFeatures.map(f => f.rule).find(r => r?.type === 'flying');
    const grounded = flying?.groundedBy ? segments.some(s => s.key === flying.groundedBy && s.destroyed) : false;
    const collapsed = !!state.collapsed && (state.collapsed.permanent || (state.collapsed.tokens ?? 0) > 0 || state.collapsed.on);
    const riders = state.riders
        .map(r => ({ uuid: r.actor, segId: r.seg, actor: fromUuidSync(r.actor, { strict: false }) }))
        .filter(r => r.actor && segments.some(s => s.id === r.segId));

    return {
        token: fwToken,
        actor: fw,
        name,
        short: name.split(/[,:(]/)[0].trim(),
        img: fw.img,
        tier: fw.system.tier,
        stress: fw.system.resources.stress,
        thresholds: fw.system.damageThresholds,
        features: fwFeatures,
        segments,
        riders,
        collapsed,
        collapsedState: state.collapsed,
        defeated: state.defeated,
        flying: flying && !grounded && !collapsed ? flying : null
    };
}

/** The segment a character rides on, in any colossus on the scene. */
export function ridingOn(actor, scene = canvas?.scene) {
    if (!actor) return null;
    const uuid = actor.uuid;
    for (const fw of frameworkTokens(scene)) {
        const segId = fightState(fw).riders.find(r => r.actor === uuid)?.seg;
        if (segId) return { fwToken: fw, segmentToken: fw.parent.tokens.get(segId) ?? null, segId };
    }
    return null;
}

/** The colossus model for a segment's actor (a synthetic token actor). */
export function modelForSegment(actor) {
    const token = actor?.token;
    if (!token || !isSegment(actor)) return null;
    const fw = frameworkOf(token);
    if (!fw) return null;
    const model = colossusModel(fw);
    return { model, segment: model.segments.find(s => s.id === token.id) ?? null };
}
