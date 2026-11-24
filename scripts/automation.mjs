/**
 * The colossus rules at work during a fight:
 *  - damage to a segment goes through its rules (Strike, Armored, Weak Point, Invulnerable, Protected);
 *  - a segment that marks its last HP is Destroyed; Cascade, Collapse and the colossus's defeat follow;
 *  - Broken and Destroyed segments can't act, a segment's standard attack can't target a PC riding it,
 *    and a PC on a segment has advantage on attacks against it;
 *  - Shaken, Rattled and riders' Stress (Protective Swarm).
 */
import { L, MODULE_ID, STATUS, STATUS_ICONS, esc, setting } from './constants.mjs';
import { colossusModel, frameworkOf, isFramework, isSegment, modelForSegment, ridingOn } from './colossus.mjs';
import { collapseCheck, defeatCheck, hpFromDamage, rangeKey, segmentDamage } from './rules.mjs';
import { postCard, setBroken, setCollapsed, setRider } from './state.mjs';

const isActiveGM = () => game.users.activeGM?.isSelf;

/** The GM's reactions to segment updates run one at a time, so two updates can't both Collapse the colossus. */
let queue = Promise.resolve();
const serial = fn => (queue = queue.then(fn).catch(err => console.error(`${MODULE_ID} |`, err)));

/* ------------------------------------------------------------------ */
/*  Conditions                                                        */
/* ------------------------------------------------------------------ */

/** Runs in "setup", after the system sets its own conditions. */
export function registerConditions() {
    const add = (id, _id) =>
        CONFIG.statusEffects.push({ id, _id, name: L(`Condition.${id}.Name`), img: STATUS_ICONS[id], description: L(`Condition.${id}.Short`) });
    add(STATUS.broken, 'dhcoBroken000000');
    add(STATUS.destroyed, 'dhcoDestroyed000');
    add(STATUS.collapsed, 'dhcoCollapsed000');
    if (setting('conditions')) {
        add(STATUS.shaken, 'dhcoShaken000000');
        add(STATUS.rattled, 'dhcoRattled00000');
        add(STATUS.trapped, 'dhcoTrapped00000');
    }
}

/* ------------------------------------------------------------------ */
/*  Damage                                                            */
/* ------------------------------------------------------------------ */

const NOTE = {
    noHp: 'Damage.NoHp',
    invulnerable: 'Damage.Invulnerable',
    protected: 'Damage.Protected',
    strike: 'Damage.Strike',
    armored: 'Damage.Armored',
    weakPoint: 'Damage.WeakPoint'
};

/** The range an attack on a segment was made within, as well as we can tell. */
function attackRange(action, segment, model) {
    const attacker = action?.actor;
    if (attacker && model.riders.some(r => r.actor === attacker && r.segId === segment.id)) return 'melee';
    return rangeKey(action?.range) ?? null;
}

function onPostCalculateDamage(actor, args, action) {
    if (!setting('damageRules') || !args?.main || !isSegment(actor)) return;
    const found = modelForSegment(actor);
    if (!found?.segment) return;
    const { model, segment } = found;
    const hp = hpFromDamage(args.main.value, actor.system.damageThresholds);
    const source = action ? 'attack' : 'direct';
    const result = segmentDamage({ hp, rules: segment.rules, segment, segments: model.segments, range: attackRange(action, segment, model), source });
    if (!result.notes.length) return;
    if (result.hp === 0) args.main.value = 0;
    else if (result.hp !== hp) args.resourceUpdates.push({ key: 'hitPoints', value: result.hp - hp, clear: false, itemId: null, target: null });
    const lines = result.notes.map(n => `<li>${L(NOTE[n.rule], { segment: esc(segment.label), range: L(`Range.${segment.rules.strike ?? 'melee'}`) })}</li>`).join('');
    postCard({
        title: L('Damage.Title', { segment: segment.label, colossus: model.short }),
        body: `<p>${L('Damage.Summary', { from: hp, to: result.hp })}</p><ul>${lines}</ul>`,
        gm: true
    });
}

/* ------------------------------------------------------------------ */
/*  Destroyed segments, Cascade, Collapse and defeat                  */
/* ------------------------------------------------------------------ */

function onPreUpdateActor(actor, changes, options) {
    if (isSegment(actor)) options[MODULE_ID] = { hp: actor.system.resources.hitPoints?.value ?? 0 };
    // Shaken: no Hope from the roll that clears it.
    const hope = foundry.utils.getProperty(changes, 'system.resources.hope.value');
    const pending = shakenPending.get(actor.uuid);
    if (hope != null && pending && Date.now() - pending < 8000 && hope > (actor.system.resources?.hope?.value ?? 0)) {
        shakenPending.delete(actor.uuid);
        foundry.utils.setProperty(changes, 'system.resources.hope.value', actor.system.resources.hope.value);
        ui.notifications.info(L('Condition.dhcoShaken.Blocked', { name: actor.name }));
    }
}

async function onUpdateActor(actor, changes, options) {
    if (!isActiveGM() || !isSegment(actor)) return;
    const value = foundry.utils.getProperty(changes, 'system.resources.hitPoints.value');
    if (value == null) return;
    const before = options[MODULE_ID]?.hp ?? 0;
    const found = modelForSegment(actor);
    if (!found?.segment) return;
    const { model, segment } = found;
    const max = segment.hpMax;
    const nowDestroyed = max > 0 && value >= max;
    const wasDestroyed = max > 0 && before >= max;
    if (actor.statuses.has(STATUS.destroyed) !== nowDestroyed) await actor.toggleStatusEffect(STATUS.destroyed, { active: nowDestroyed, overlay: false });
    if (nowDestroyed && !wasDestroyed) await onDestroyed(model, segment);
    else if (before === 0 && value > 0) await checkCollapse(model.token);
}

async function onDestroyed(model, segment) {
    await postCard({
        title: L('Card.Destroyed.Title', { segment: segment.label }),
        body: `<p>${L('Card.Destroyed.Body', { colossus: esc(model.short), segment: esc(segment.label) })}</p>`,
        img: model.img,
        tone: 'good'
    });
    // Cascade: another segment marks HP.
    for (const c of segment.rules.cascade) {
        const target = model.segments.find(s => s.key === c.target && !s.destroyed);
        if (!target || !(c.hp > 0)) continue;
        await target.actor.update({ 'system.resources.hitPoints.value': Math.min(target.hpMax, target.hpValue + c.hp) }, { [`${MODULE_ID}Cascade`]: true });
        await postCard({ title: L('Card.Cascade.Title'), body: `<p>${L('Card.Cascade.Body', { from: esc(segment.label), to: esc(target.label), n: c.hp })}</p>` });
    }
    await checkCollapse(model.token);
    await checkDefeat(model.token);
}

async function checkCollapse(fwToken) {
    if (!setting('collapse')) return;
    const model = colossusModel(fwToken);
    const hit = collapseCheck(model.segments);
    if (!hit) return;
    const now = model.collapsedState ?? {};
    if (now.permanent) return;
    if (hit.permanent) return setCollapsed(fwToken, { permanent: true });
    if (hit.token) {
        // One token per newly Destroyed segment in the group.
        const destroyed = model.segments.filter(s => s.destroyed && s.rules.collapse.some(c => c.token)).length;
        const seen = now.seen ?? 0;
        if (destroyed > seen) await setCollapsed(fwToken, { tokens: (now.tokens ?? 0) + (destroyed - seen) });
        await fwToken.setFlag(MODULE_ID, 'collapsed.seen', destroyed).catch(() => {});
        return;
    }
    if (!model.collapsed) await setCollapsed(fwToken, { on: true });
}

async function checkDefeat(fwToken) {
    const model = colossusModel(fwToken);
    if (model.defeated) return;
    const result = defeatCheck(model.segments);
    if (!result) return;
    await defeat(fwToken, result);
}

/** Mark the colossus defeated: the soul shard shatters. */
export async function defeat(fwToken, result = { reason: 'gm' }) {
    const model = colossusModel(fwToken);
    await fwToken.setFlag(MODULE_ID, 'defeated', { ...result, at: Date.now() });
    if (!fwToken.actor.statuses.has('defeated') && CONFIG.statusEffects.some(e => e.id === 'defeated')) {
        await fwToken.actor.toggleStatusEffect('defeated', { active: true, overlay: true }).catch(() => {});
    }
    const why =
        result.reason === 'fatal'
            ? L('Card.Defeated.Fatal', { segment: esc(result.label) })
            : result.reason === 'chain'
              ? L('Card.Defeated.Chain', { chain: esc(result.chain) })
              : result.reason === 'all'
                ? L('Card.Defeated.All')
                : L('Card.Defeated.GM');
    Hooks.callAll(`${MODULE_ID}.defeated`, model, result);
    const buttons = setting('campaign') ? [{ action: 'shatter', label: L('Card.Defeated.Shatter'), icon: 'fa-solid fa-gem', data: { name: model.name, img: model.img, tier: model.tier } }] : [];
    await postCard({
        title: L('Card.Defeated.Title', { colossus: model.short }),
        body: `<p>${why}</p><p>${L(setting('campaign') ? 'Card.Defeated.Shard' : 'Card.Defeated.Body', { colossus: esc(model.short) })}</p>`,
        img: model.img,
        tone: 'victory',
        buttons
    });
}

/* ------------------------------------------------------------------ */
/*  Actions                                                           */
/* ------------------------------------------------------------------ */

const isStandardAttack = action => action?.baseAction || action?.systemPath === 'attack';
const ruleOf = action => action?.item?.getFlag?.(MODULE_ID, 'rule') ?? null;

function onPreUseAction(action, config) {
    const actor = action?.actor;
    if (!actor) return;

    if (isSegment(actor) && setting('enforce')) {
        const found = modelForSegment(actor);
        const seg = found?.segment;
        if (seg) {
            if (seg.destroyed) {
                ui.notifications.warn(L('Notify.Destroyed', { segment: seg.label }));
                return false;
            }
            if (seg.broken) {
                ui.notifications.warn(L('Notify.Broken', { segment: seg.label }));
                return false;
            }
            if (ruleOf(action)?.type === 'notWhileCollapsed' && found.model.collapsed) {
                ui.notifications.warn(L('Notify.Collapsed', { colossus: found.model.short, feature: action.item.name }));
                return false;
            }
            if (isStandardAttack(action)) {
                const riders = new Set(found.model.riders.filter(r => r.segId === seg.id).map(r => r.uuid));
                const blocked = (config.targets ?? []).filter(t => riders.has(t.actorId));
                if (blocked.length) {
                    ui.notifications.warn(L('Notify.RiderImmune', { segment: seg.label, names: blocked.map(t => t.name).join(', ') }));
                    return false;
                }
            }
        }
    }

    // A PC on a segment has advantage on attacks against it.
    if (actor.type === 'character' && setting('riderAdvantage') && config.roll?.type === 'attack' && (config.roll.advantage ?? 0) === 0) {
        const riding = ridingOn(actor);
        if (riding && (config.targets ?? []).some(t => t.id === riding.segId)) {
            config.roll.advantage = 1;
            ui.notifications.info(L('Notify.RiderAdvantage', { name: actor.name }));
        }
    }
}

async function onPostUseAction(action, config) {
    const actor = action?.actor;
    if (!actor || !(isSegment(actor) || isFramework(actor))) return;
    const rule = ruleOf(action);
    const flags = action.item?.getFlag?.(MODULE_ID) ?? {};
    const token = actor.token;

    if (isSegment(actor) && token) {
        const hit = config.roll?.success ?? (config.targets ?? []).some(t => t.hit);
        let add = 0;
        if (rule?.breaks && hit) add += rule.breaks;
        if (isStandardAttack(action)) {
            const recovery = actor.items.find(i => i.getFlag(MODULE_ID, 'rule')?.breaksAfterAttack);
            if (recovery) add += recovery.getFlag(MODULE_ID, 'rule').breaksAfterAttack;
        }
        if (add) await setBroken(token, Number(token.getFlag(MODULE_ID, 'broken') ?? 0) + add);
    }

    const fw = isFramework(actor) ? token : frameworkOf(token);
    if (!fw) return;
    const model = colossusModel(fw);
    if (flags.throwOff && model.riders.length && game.user.isGM) {
        for (const r of model.riders) await setRider(fw, r.uuid, null, { reason: 'thrown' });
    }
    if (flags.shakeOff && model.riders.length) {
        await postCard({
            title: L('Card.ShakeOff.Title', { colossus: model.short }),
            body: `<p>${L('Card.ShakeOff.Body')}</p>`,
            gm: true,
            buttons: model.riders.map(r => ({ action: 'fall', label: L('Card.ShakeOff.Falls', { name: r.actor.name }), icon: 'fa-solid fa-person-falling', data: { fw: fw.uuid, actor: r.uuid } }))
        });
    }
}

/* ------------------------------------------------------------------ */
/*  Rolls: Shaken, Rattled, Protective Swarm                          */
/* ------------------------------------------------------------------ */

const shakenPending = new Map();

function rollActor(config) {
    const uuid = config?.source?.actor;
    return config?.actor ?? (uuid ? fromUuidSync(uuid, { strict: false }) : null);
}

function onPreRollDuality(config) {
    const actor = rollActor(config);
    if (!actor?.statuses?.has(STATUS.rattled) || !setting('conditions')) return;
    if (config.actionType === 'reaction' || config.roll?.type === 'reaction') {
        config.roll ??= {};
        if ((config.roll.advantage ?? 0) >= 0) config.roll.advantage = -1;
    }
}

function onPostRollDuality(config) {
    const actor = rollActor(config);
    if (!actor || actor.type !== 'character' || !actor.isOwner) return;
    const withHope = !!(config.evaluated?.withHope || config.evaluated?.isCritical);
    if (setting('conditions') && withHope) {
        if (actor.statuses.has(STATUS.shaken)) {
            shakenPending.set(actor.uuid, Date.now());
            actor.toggleStatusEffect(STATUS.shaken, { active: false });
        }
        if (actor.statuses.has(STATUS.rattled)) actor.toggleStatusEffect(STATUS.rattled, { active: false });
    }
    // Protective Swarm: an action roll made on that segment costs a Stress.
    if (config.actionType === 'reaction') return;
    const riding = ridingOn(actor);
    const segActor = riding?.segmentToken?.actor;
    const swarm = segActor?.items.find(i => i.getFlag(MODULE_ID, 'rule')?.type === 'riderStress');
    if (!swarm) return;
    const stress = actor.system.resources.stress;
    const n = swarm.getFlag(MODULE_ID, 'rule').stress ?? 1;
    actor.update({ 'system.resources.stress.value': Math.min(stress.max, stress.value + n) });
    postCard({ title: swarm.name, body: `<p>${L('Card.Swarm', { name: esc(actor.name), n, segment: esc(riding.segmentToken.name) })}</p>`, speaker: actor });
}

/* ------------------------------------------------------------------ */

export function registerAutomation() {
    Hooks.on('daggerheart.postCalculateDamage', onPostCalculateDamage);
    Hooks.on('preUpdateActor', onPreUpdateActor);
    Hooks.on('updateActor', (...args) => {
        if (isActiveGM() && isSegment(args[0])) serial(() => onUpdateActor(...args));
    });
    Hooks.on('daggerheart.preUseAction', onPreUseAction);
    Hooks.on('daggerheart.postUseAction', (...args) => {
        onPostUseAction(...args).catch(err => console.error(`${MODULE_ID} |`, err));
    });
    Hooks.on('daggerheart.preRollDuality', onPreRollDuality);
    Hooks.on('daggerheart.postRollDuality', onPostRollDuality);
}
