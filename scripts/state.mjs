/**
 * Changes to the state of a colossus fight. The GM applies them; players' changes (climbing,
 * leaping, falling off) go to the active GM as a query.
 */
import { L, MODULE_ID, STATUS, esc, setting } from './constants.mjs';
import { colossusModel, frameworkOf, isSegment } from './colossus.mjs';

const QUERY = `${MODULE_ID}.request`;

/** Run an operation on the GM's client. */
export async function request(op, data = {}) {
    if (game.user.isGM) return handle({ op, ...data, userId: game.user.id });
    const gm = game.users.activeGM;
    if (!gm) {
        ui.notifications.warn(L('Notify.NoGM'));
        return null;
    }
    return gm.query(QUERY, { op, ...data, userId: game.user.id }, { timeout: 30000 });
}

export function registerQueries() {
    CONFIG.queries[QUERY] = data => handle(data);
}

async function handle({ op, userId, ...data }) {
    const user = game.users.get(userId);
    switch (op) {
        case 'ride': {
            const actor = await fromUuid(data.actor);
            if (!actor?.testUserPermission(user, 'OWNER')) throw new Error('Not your character');
            return setRider(data.fw, data.actor, data.seg ?? null, { reason: data.reason, by: user?.name });
        }
        case 'broken':
            if (!user?.isGM) throw new Error('GM only');
            return setBroken(data.seg, data.tokens);
        case 'collapsed':
            if (!user?.isGM) throw new Error('GM only');
            return setCollapsed(data.fw, data.state);
        default:
            throw new Error(`Unknown request ${op}`);
    }
}

/* ------------------------------------------------------------------ */
/*  Chat                                                              */
/* ------------------------------------------------------------------ */

/**
 * Post a colossus chat card.
 * @param {object} p
 * @param {string} p.title
 * @param {string} p.body          HTML
 * @param {string} [p.img]
 * @param {boolean} [p.gm]         whisper to the GMs
 * @param {Array<{action: string, label: string, icon?: string, data?: object}>} [p.buttons]
 * @param {Actor} [p.speaker]
 */
export async function postCard({ title, body, img, gm = false, buttons = [], speaker = null, tone = '' }) {
    const btns = buttons
        .map(
            b =>
                `<button type="button" data-dhco="${esc(b.action)}" data-dhco-data='${esc(JSON.stringify(b.data ?? {}))}'>${b.icon ? `<i class="${esc(b.icon)}"></i> ` : ''}${esc(b.label)}</button>`
        )
        .join('');
    const content = `<div class="dh-colossus-card ${tone}">
        ${img ? `<img class="dhco-card-art" src="${esc(img)}" alt="">` : ''}
        <h3>${esc(title)}</h3>
        <div class="dhco-card-body">${body}</div>
        ${btns ? `<div class="dhco-card-buttons">${btns}</div>` : ''}
    </div>`;
    return ChatMessage.create({
        content,
        speaker: speaker ? ChatMessage.getSpeaker({ actor: speaker }) : ChatMessage.getSpeaker({ alias: L('Card.Alias') }),
        whisper: gm ? ChatMessage.getWhisperRecipients('GM') : [],
        flags: { [MODULE_ID]: { card: true } }
    });
}

/* ------------------------------------------------------------------ */
/*  State changes (GM)                                                */
/* ------------------------------------------------------------------ */

async function tokenDoc(uuidOrDoc) {
    return typeof uuidOrDoc === 'string' ? await fromUuid(uuidOrDoc) : uuidOrDoc;
}

/** Set the number of Broken tokens on a segment (0 clears Broken). */
export async function setBroken(seg, tokens) {
    if (!game.user.isGM) return request('broken', { seg: seg.uuid ?? seg, tokens });
    const token = await tokenDoc(seg);
    if (!token || !isSegment(token.actor)) return;
    const n = Math.max(0, Math.min(9, Number(tokens) || 0));
    const before = Number(token.getFlag(MODULE_ID, 'broken') ?? 0);
    if (n === before) return;
    await token.setFlag(MODULE_ID, 'broken', n);
    const has = token.actor.statuses.has(STATUS.broken);
    if (n > 0 !== has) await token.actor.toggleStatusEffect(STATUS.broken, { active: n > 0 });
    const fw = frameworkOf(token);
    if (fw && (n === 0 || before === 0)) {
        const model = colossusModel(fw);
        const seg = model.segments.find(s => s.id === token.id);
        await postCard({
            title: n ? L('Card.Broken.Title', { segment: seg?.label ?? token.name }) : L('Card.Repaired.Title', { segment: seg?.label ?? token.name }),
            body: n ? `<p>${L('Card.Broken.Body', { colossus: esc(model.short), segment: esc(seg?.label ?? token.name), n })}</p>` : `<p>${L('Card.Repaired.Body', { segment: esc(seg?.label ?? token.name) })}</p>`,
            tone: n ? 'bad' : ''
        });
    }
}

/**
 * Set the Collapsed state of a colossus: {tokens, permanent, on} or null to clear it.
 */
export async function setCollapsed(fw, state) {
    if (!game.user.isGM) return request('collapsed', { fw: fw.uuid ?? fw, state });
    const token = await tokenDoc(fw);
    if (!token) return;
    const before = colossusModel(token).collapsed;
    const clean = state && (state.permanent || state.on || (state.tokens ?? 0) > 0) ? { tokens: Math.max(0, state.tokens ?? 0), permanent: !!state.permanent, on: !!state.on } : null;
    if (clean) await token.setFlag(MODULE_ID, 'collapsed', clean);
    else await token.unsetFlag(MODULE_ID, 'collapsed');
    const after = !!clean;
    if (token.actor.statuses.has(STATUS.collapsed) !== after) await token.actor.toggleStatusEffect(STATUS.collapsed, { active: after });
    if (before !== after) {
        const name = colossusModel(token).short;
        await postCard({
            title: after ? L('Card.Collapsed.Title', { colossus: name }) : L('Card.Risen.Title', { colossus: name }),
            body: `<p>${after ? L(clean.permanent ? 'Card.Collapsed.Permanent' : 'Card.Collapsed.Body', { colossus: esc(name) }) : L('Card.Risen.Body', { colossus: esc(name) })}</p>`,
            img: token.actor.img,
            tone: after ? 'good' : 'bad'
        });
    }
}

/**
 * Put a character on a segment (segId), or on the ground (null).
 * @param {string|TokenDocument} fw   framework token
 */
export async function setRider(fw, actorUuid, segId, { reason = null, by = null, quiet = false } = {}) {
    if (!game.user.isGM) return request('ride', { fw: fw.uuid ?? fw, actor: actorUuid, seg: segId, reason });
    const token = await tokenDoc(fw);
    if (!token) return;
    const list = token.getFlag(MODULE_ID, 'riders') ?? [];
    const from = list.find(r => r.actor === actorUuid)?.seg ?? null;
    if (from === segId) return;
    const riders = list.filter(r => r.actor !== actorUuid);
    if (segId) riders.push({ actor: actorUuid, seg: segId });
    await token.setFlag(MODULE_ID, 'riders', riders);

    const actor = await fromUuid(actorUuid);
    const model = colossusModel(token);
    const to = model.segments.find(s => s.id === segId);
    const was = model.segments.find(s => s.id === from);
    if (to && setting('moveTokens')) await moveOnto(actor, to.token);
    if (quiet) return;
    let text;
    if (to && was) text = L('Card.Rider.Leap', { name: esc(actor?.name), from: esc(was.label), to: esc(to.label), colossus: esc(model.short) });
    else if (to) text = L('Card.Rider.Climb', { name: esc(actor?.name), to: esc(to.label), colossus: esc(model.short) });
    else text = L(reason === 'fall' ? 'Card.Rider.Fall' : reason === 'thrown' ? 'Card.Rider.Thrown' : 'Card.Rider.Down', { name: esc(actor?.name), colossus: esc(model.short) });
    const fall = !to && reason !== 'down' && model.flying ? model.features.map(f => f.rule).find(r => r?.type === 'fallDamage') : null;
    await postCard({
        title: model.short,
        body: `<p>${text}</p>${fall ? `<p>${L('Card.Rider.FallDamage', { colossus: esc(model.short), damage: `[[/r ${fall.damage}]]` })}</p>` : ''}`,
        img: actor?.img,
        tone: to ? '' : 'bad'
    });
}

/** Move a character's token onto a segment token on the canvas (offset so riders don't stack). */
async function moveOnto(actor, segToken) {
    const pc = actor?.getActiveTokens(false, true).find(t => t.parent === segToken.parent);
    if (!pc) return;
    const grid = segToken.parent.grid.size;
    const riders = segToken.parent.tokens.filter(t => t !== pc && t.actor?.type === 'character' && t.x >= segToken.x && t.y >= segToken.y && t.x < segToken.x + segToken.width * grid && t.y < segToken.y + segToken.height * grid);
    const spots = Math.max(1, segToken.width * segToken.height);
    const i = riders.length % spots;
    const x = segToken.x + (i % segToken.width) * grid;
    const y = segToken.y + Math.floor(i / segToken.width) * grid;
    await pc.update({ x, y, elevation: (segToken.elevation ?? 0) + 1 }, { animation: { duration: 400 } });
}
