/**
 * The Colossus Board: the book's notecard map of a colossus as a live window. Every segment is a
 * card placed in the shape of the colossus, with lines between adjacent segments, its HP,
 * Difficulty, rules, Broken tokens and the PCs riding it. Players climb and leap from card to card;
 * the GM tracks Broken, Collapsed and the riders, and edits the layout and the adjacency.
 */
import { CORE_PAGES, L, MODULE_ID, esc, hasCore, setting } from './constants.mjs';
import { colossusModel, frameworkTokens, isFramework, isSegment, ridingOn } from './colossus.mjs';
import { BOARD, canReach, clampSlot, climbDifficulty } from './rules.mjs';
import { arrangeTokens } from './placement.mjs';
import { setBroken, setCollapsed, setRider } from './state.mjs';
import { defeat } from './automation.mjs';

const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api;

const BADGES = [
    ['fatal', 'fa-solid fa-skull', r => r.fatal],
    ['chain', 'fa-solid fa-link', r => r.chains.length && r.chains.join(' ')],
    ['strike', 'fa-solid fa-crosshairs', r => r.strike],
    ['armored', 'fa-solid fa-shield', r => r.armored],
    ['weakPoint', 'fa-solid fa-bullseye', r => r.weakPoint],
    ['invulnerable', 'fa-solid fa-shield-halved', r => r.invulnerable],
    ['protected', 'fa-solid fa-lock', r => r.protected],
    ['climbing', 'fa-solid fa-person-hiking', r => r.climbing],
    ['notClimbable', 'fa-solid fa-ban', r => r.notClimbable],
    ['cascade', 'fa-solid fa-arrow-down-wide-short', r => r.cascade.length]
];

export class ColossusBoard extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
        id: 'dh-colossus-board',
        classes: ['dh-colossus', 'dhco-board'],
        window: { title: 'DHCO.Board.Title', icon: 'fa-solid fa-mountain-sun', resizable: true },
        position: { width: 1000, height: 780 },
        actions: {
            pick: ColossusBoard.#onPick,
            card: ColossusBoard.#onCard,
            climb: ColossusBoard.#onClimb,
            down: ColossusBoard.#onDown,
            attack: ColossusBoard.#onAttack,
            broken: ColossusBoard.#onBroken,
            hp: ColossusBoard.#onHp,
            stress: ColossusBoard.#onStress,
            collapsed: ColossusBoard.#onCollapsed,
            sheet: ColossusBoard.#onSheet,
            feature: ColossusBoard.#onFeature,
            arrange: ColossusBoard.#onArrange,
            edit: ColossusBoard.#onEdit,
            ground: ColossusBoard.#onGround,
            rules: ColossusBoard.#onRules,
            defeat: ColossusBoard.#onDefeat,
            placeParts: ColossusBoard.#onPlaceParts
        }
    };

    static PARTS = { main: { template: `modules/${MODULE_ID}/templates/board.hbs` } };

    /** Framework token id shown. */
    fwId = null;
    editing = false;
    /** In edit mode: the card clicked first when linking two segments. */
    linkFrom = null;

    get fwToken() {
        const list = frameworkTokens();
        return list.find(t => t.id === this.fwId) ?? list[0] ?? null;
    }

    get title() {
        const fw = this.fwToken;
        return fw ? `${L('Board.Title')}: ${fw.actor.name.split(/[,:(]/)[0].trim()}` : L('Board.Title');
    }

    /** The character this user moves on the board. */
    myCharacter() {
        const controlled = canvas.tokens?.controlled.map(t => t.actor).find(a => a?.type === 'character' && a.isOwner);
        return controlled ?? (game.user.character?.isOwner ? game.user.character : null);
    }

    async _prepareContext() {
        const gm = game.user.isGM;
        const list = frameworkTokens();
        const fw = this.fwToken;
        this.fwId = fw?.id ?? null;
        if (!fw) return { gm, empty: true, hasCore: hasCore() };

        const model = colossusModel(fw);
        const me = this.myCharacter();
        const myRide = me ? ridingOn(me) : null;
        const mySeg = myRide?.fwToken === fw ? myRide.segId : null;
        const pct = (v, total) => `${((v / total) * 100).toFixed(3)}%`;

        const cards = model.segments.map(s => {
            const l = s.layout;
            const riders = model.riders.filter(r => r.segId === s.id).map(r => ({ uuid: r.uuid, name: r.actor.name, img: r.actor.img, mine: me?.uuid === r.uuid, owner: r.actor.isOwner }));
            const reach = me ? canReach(mySeg ? model.segments.find(x => x.id === mySeg)?.key : null, s, { segments: model.segments, collapsed: model.collapsed }) : { ok: false };
            const { difficulty, mod } = climbDifficulty(s, model.segments);
            const flyBonus = model.flying && !mySeg ? (model.flying.bonus ?? 2) : 0;
            const badges = BADGES.map(([key, icon, test]) => {
                const v = test(s.rules);
                if (!v) return null;
                const rule = s.rules.list.find(r => r.type === key || (key === 'chain' && r.type === 'chain'));
                return { key, icon, text: typeof v === 'string' && key !== 'strike' ? v : '', tip: rule ? rule.name : L(`Rule.${key}`) };
            }).filter(Boolean);
            return {
                id: s.id,
                uuid: s.token.uuid,
                label: s.label,
                style: `left:${pct(l.x, BOARD.cols)};top:${pct(l.y, BOARD.rows)};width:${pct(l.w, BOARD.cols)};height:${pct(l.h, BOARD.rows)}`,
                x: l.x,
                y: l.y,
                w: l.w,
                h: l.h,
                hp: s.hpMax > 0 ? Array.from({ length: s.hpMax }, (_, i) => ({ i: i + 1, marked: i < s.hpValue })) : null,
                hpText: s.hpMax > 0 ? `${s.hpValue}/${s.hpMax}` : L('Board.NoHp'),
                difficulty: s.difficulty,
                climbDifficulty: difficulty + flyBonus,
                climbMod: mod,
                broken: s.broken,
                brokenTokens: s.brokenTokens,
                destroyed: s.destroyed,
                ground: s.groundAccess,
                attack: s.actor.getFlag(MODULE_ID, 'segment')?.attack !== false && !!s.actor.system.attack?.damage?.main,
                attackName: s.actor.system.attack?.name,
                badges,
                riders,
                mine: mySeg === s.id,
                canClimb: !!me && !model.defeated && reach.ok && mySeg !== s.id,
                climbWhy: reach.why ? L(`Board.Why.${reach.why}`) : '',
                linkFrom: this.linkFrom === s.id,
                adjacent: this.linkFrom ? this.#isAdjacent(model, this.linkFrom, s.id) : false
            };
        });

        // Lines between adjacent segments, in board units (100 per cell).
        const lines = [];
        const segs = model.segments;
        for (let i = 0; i < segs.length; i++)
            for (let j = i + 1; j < segs.length; j++) {
                if (!this.#adjacent(segs[i], segs[j])) continue;
                const a = segs[i].layout;
                const b = segs[j].layout;
                lines.push({ x1: (a.x + a.w / 2) * 100, y1: (a.y + a.h / 2) * 100, x2: (b.x + b.w / 2) * 100, y2: (b.y + b.h / 2) * 100 });
            }

        // Characters on the scene and not on this colossus: "on the ground".
        const riding = new Set(model.riders.map(r => r.uuid));
        const ground = (fw.parent?.tokens ?? [])
            .filter(t => t.actor?.type === 'character' && !riding.has(t.actor.uuid))
            .map(t => ({ uuid: t.actor.uuid, name: t.actor.name, img: t.actor.img, mine: me?.uuid === t.actor.uuid, owner: t.actor.isOwner }))
            .filter((c, i, all) => all.findIndex(x => x.uuid === c.uuid) === i);

        const stress = model.stress ?? { value: 0, max: 0 };
        const missingParts = (fw.actor.system.typeData.parts ?? []).reduce((n, p) => n + (p.quantity ?? 0), 0) - model.segments.length;
        const collapsedState = model.collapsedState ?? {};

        return {
            gm,
            hasCore: hasCore(),
            colossi: list.length > 1 ? list.map(t => ({ id: t.id, name: t.actor.name.split(/[,:(]/)[0].trim(), active: t.id === fw.id })) : null,
            model: {
                name: model.name,
                short: model.short,
                img: model.img,
                tier: model.tier,
                major: model.thresholds?.major,
                severe: model.thresholds?.severe,
                stress: Array.from({ length: stress.max ?? 0 }, (_, i) => ({ i: i + 1, marked: i < (stress.value ?? 0) })),
                stressText: `${stress.value ?? 0}/${stress.max ?? 0}`,
                flying: !!model.flying,
                collapsed: model.collapsed,
                collapsedPermanent: !!collapsedState.permanent,
                collapsedTokens: collapsedState.tokens ?? 0,
                defeated: model.defeated ? this.#defeatText(model.defeated) : null,
                features: model.features.map(f => ({ id: f.item.id, name: f.name, form: f.item.system.featureForm, formLabel: L(`Form.${f.item.system.featureForm ?? 'passive'}`) }))
            },
            cards,
            lines,
            ground,
            me: me ? { name: me.name, img: me.img, on: mySeg ? cards.find(c => c.id === mySeg)?.label : null } : null,
            editing: gm && this.editing,
            missingParts: missingParts > 0 ? missingParts : 0,
            noSegments: !model.segments.length
        };
    }

    #adjacent(a, b) {
        if (a.id === b.id) return false;
        return a.adjacent.includes(b.key) || b.adjacent.includes(a.key);
    }

    #isAdjacent(model, idA, idB) {
        const a = model.segments.find(s => s.id === idA);
        const b = model.segments.find(s => s.id === idB);
        return !!a && !!b && this.#adjacent(a, b);
    }

    #defeatText(d) {
        if (d.reason === 'fatal') return L('Card.Defeated.Fatal', { segment: d.label });
        if (d.reason === 'chain') return L('Card.Defeated.Chain', { chain: d.chain });
        if (d.reason === 'all') return L('Card.Defeated.All');
        return L('Card.Defeated.GM');
    }

    _onRender(context, options) {
        super._onRender?.(context, options);
        const root = this.element;
        if (this.editing && game.user.isGM) this.#enableLayoutEditing(root);
        if (game.user.isGM) this.#enableRiderDrag(root);
        root.querySelectorAll('.dhco-card').forEach(card =>
            card.addEventListener('contextmenu', ev => {
                ev.preventDefault();
                const token = this.fwToken?.parent.tokens.get(card.dataset.id)?.object;
                token?.setTarget(!token.isTargeted, { releaseOthers: !ev.shiftKey });
            })
        );
    }

    /* -------------------------------------------- */
    /*  Layout editing (GM)                         */
    /* -------------------------------------------- */

    #enableLayoutEditing(root) {
        const board = root.querySelector('.dhco-board-grid');
        if (!board) return;
        const cell = () => ({ w: board.clientWidth / BOARD.cols, h: board.clientHeight / BOARD.rows });
        for (const card of board.querySelectorAll('.dhco-card')) {
            const start = (ev, mode) => {
                if (ev.button !== 0) return;
                ev.preventDefault();
                ev.stopPropagation();
                const c = cell();
                const orig = { x: Number(card.dataset.x), y: Number(card.dataset.y), w: Number(card.dataset.w), h: Number(card.dataset.h) };
                const sx = ev.clientX;
                const sy = ev.clientY;
                let moved = false;
                let next = orig;
                const move = e => {
                    const dx = Math.round((e.clientX - sx) / c.w);
                    const dy = Math.round((e.clientY - sy) / c.h);
                    if (dx || dy) moved = true;
                    next = clampSlot(mode === 'resize' ? { ...orig, w: orig.w + dx, h: orig.h + dy } : { ...orig, x: orig.x + dx, y: orig.y + dy });
                    card.style.left = `${(next.x / BOARD.cols) * 100}%`;
                    card.style.top = `${(next.y / BOARD.rows) * 100}%`;
                    card.style.width = `${(next.w / BOARD.cols) * 100}%`;
                    card.style.height = `${(next.h / BOARD.rows) * 100}%`;
                };
                const up = () => {
                    window.removeEventListener('pointermove', move);
                    window.removeEventListener('pointerup', up);
                    if (moved) this.#saveSlot(card.dataset.id, next);
                    else if (mode === 'move') this.#link(card.dataset.id);
                };
                window.addEventListener('pointermove', move);
                window.addEventListener('pointerup', up);
            };
            card.addEventListener('pointerdown', ev => {
                if (ev.target.closest('button, a, .dhco-resize, input')) return;
                start(ev, 'move');
            });
            card.querySelector('.dhco-resize')?.addEventListener('pointerdown', ev => start(ev, 'resize'));
            card.querySelector('.dhco-label')?.addEventListener('dblclick', ev => {
                ev.stopPropagation();
                this.#rename(card.dataset.id);
            });
        }
    }

    /** The world actor behind a segment token, where the layout is stored. */
    #baseActor(segId) {
        const token = this.fwToken?.parent.tokens.get(segId);
        return token ? (game.actors.get(token.actorId) ?? null) : null;
    }

    async #updateSlots(segId, fn) {
        const model = colossusModel(this.fwToken);
        const seg = model.segments.find(s => s.id === segId);
        const base = this.#baseActor(segId);
        if (!seg || !base) return ui.notifications.warn(L('Notify.NoBaseActor'));
        const siblings = model.segments.filter(s => s.token.actorId === seg.token.actorId);
        const slots = siblings.map(s => ({ label: s.label, ...s.layout }));
        fn(slots, seg.slotIndex);
        await base.setFlag(MODULE_ID, 'segment', { slots });
        // Pin each token to its slot, so the order survives.
        for (const s of siblings) if (s.token.getFlag(MODULE_ID, 'slot') !== s.slotIndex) await s.token.setFlag(MODULE_ID, 'slot', s.slotIndex);
        this.render();
    }

    #saveSlot(segId, slot) {
        return this.#updateSlots(segId, (slots, i) => Object.assign(slots[i], clampSlot(slot)));
    }

    async #rename(segId) {
        const model = colossusModel(this.fwToken);
        const seg = model.segments.find(s => s.id === segId);
        const label = await foundry.applications.api.DialogV2.prompt({
            window: { title: L('Board.Rename') },
            content: `<input type="text" name="label" value="${esc(seg.label)}" autofocus>`,
            ok: { label: L('Board.Save'), callback: (ev, button) => button.form.elements.label.value.trim() }
        }).catch(() => null);
        if (!label) return;
        await this.#updateSlots(segId, (slots, i) => (slots[i].label = label));
        await seg.token.update({ name: label });
    }

    /** Click two cards in edit mode to link or unlink them as adjacent. */
    async #link(segId) {
        if (!this.linkFrom) {
            this.linkFrom = segId;
            return this.render();
        }
        const from = this.linkFrom;
        this.linkFrom = null;
        if (from === segId) return this.render();
        const model = colossusModel(this.fwToken);
        const a = model.segments.find(s => s.id === from);
        const b = model.segments.find(s => s.id === segId);
        const linked = this.#adjacent(a, b);
        const set = async (seg, other, on) => {
            const base = this.#baseActor(seg.id);
            if (!base) return;
            const list = new Set(seg.adjacent);
            if (on) list.add(other.key);
            else list.delete(other.key);
            await base.setFlag(MODULE_ID, 'segment', { key: seg.key, adjacent: [...list] });
        };
        await set(a, b, !linked);
        if (a.key !== b.key) await set(b, a, !linked);
        ui.notifications.info(L(linked ? 'Board.Unlinked' : 'Board.Linked', { a: a.label, b: b.label }));
        this.render();
    }

    /* -------------------------------------------- */
    /*  Dragging riders (GM)                        */
    /* -------------------------------------------- */

    #enableRiderDrag(root) {
        for (const el of root.querySelectorAll('[data-rider]')) {
            el.setAttribute('draggable', 'true');
            el.addEventListener('dragstart', ev => {
                ev.dataTransfer.setData('text/plain', JSON.stringify({ dhcoRider: el.dataset.rider }));
            });
        }
        for (const zone of root.querySelectorAll('.dhco-card, .dhco-ground')) {
            zone.addEventListener('dragover', ev => {
                ev.preventDefault();
                zone.classList.add('drop');
            });
            zone.addEventListener('dragleave', () => zone.classList.remove('drop'));
            zone.addEventListener('drop', async ev => {
                ev.preventDefault();
                zone.classList.remove('drop');
                let data;
                try {
                    data = JSON.parse(ev.dataTransfer.getData('text/plain'));
                } catch {
                    return;
                }
                let uuid = data.dhcoRider;
                if (!uuid && data.type === 'Actor') uuid = data.uuid;
                if (!uuid) return;
                await setRider(this.fwToken, uuid, zone.dataset.id ?? null, { reason: 'down' });
            });
        }
    }

    /* -------------------------------------------- */
    /*  Actions                                     */
    /* -------------------------------------------- */

    static #seg(target) {
        const id = target.closest('[data-id]')?.dataset.id;
        return id ? (this.fwToken?.parent.tokens.get(id) ?? null) : null;
    }

    static #onPick(event, target) {
        this.fwId = target.value ?? target.dataset.fw;
        this.linkFrom = null;
        this.render();
    }

    static #onCard(event, target) {
        if (this.editing) return;
        const token = ColossusBoard.#seg.call(this, target);
        if (!token?.object) return;
        if (game.user.isGM || token.object.isOwner) {
            token.object.control({ releaseOthers: !event.shiftKey });
            canvas.animatePan({ x: token.object.center.x, y: token.object.center.y, duration: 300 });
        } else {
            token.object.setTarget(!token.object.isTargeted, { releaseOthers: !event.shiftKey });
        }
    }

    static async #onClimb(event, target) {
        const token = ColossusBoard.#seg.call(this, target);
        const me = this.myCharacter();
        if (!token || !me) return ui.notifications.warn(L('Notify.NoCharacter'));
        await climb(me, this.fwToken, token.id);
    }

    static async #onDown(event, target) {
        const uuid = target.dataset.uuid ?? this.myCharacter()?.uuid;
        if (!uuid) return;
        await setRider(this.fwToken, uuid, null, { reason: target.dataset.reason ?? 'down' });
    }

    static async #onAttack(event, target) {
        const token = ColossusBoard.#seg.call(this, target);
        const attack = token?.actor?.system.attack;
        if (!attack) return;
        await attack.use(event);
    }

    static async #onBroken(event, target) {
        const token = ColossusBoard.#seg.call(this, target);
        if (!token) return;
        const n = Number(token.getFlag(MODULE_ID, 'broken') ?? 0) + Number(target.dataset.delta);
        await setBroken(token, n);
    }

    static async #onHp(event, target) {
        const token = ColossusBoard.#seg.call(this, target);
        const hp = token?.actor?.system.resources.hitPoints;
        if (!hp) return;
        const i = Number(target.dataset.i);
        await token.actor.update({ 'system.resources.hitPoints.value': hp.value >= i ? i - 1 : i });
    }

    static async #onStress(event, target) {
        const actor = this.fwToken?.actor;
        const stress = actor?.system.resources.stress;
        if (!stress) return;
        const i = Number(target.dataset.i);
        await actor.update({ 'system.resources.stress.value': stress.value >= i ? i - 1 : i });
    }

    static async #onCollapsed(event, target) {
        const fw = this.fwToken;
        const now = colossusModel(fw).collapsedState ?? {};
        const op = target.dataset.op;
        if (op === 'toggle') return setCollapsed(fw, colossusModel(fw).collapsed ? null : { on: true });
        if (op === 'permanent') return setCollapsed(fw, { ...now, permanent: !now.permanent });
        const tokens = Math.max(0, (now.tokens ?? 0) + Number(target.dataset.delta));
        return setCollapsed(fw, { ...now, tokens, on: tokens > 0 ? false : now.on && !now.tokens });
    }

    static #onSheet(event, target) {
        const token = target.closest('.dhco-card') ? ColossusBoard.#seg.call(this, target) : this.fwToken;
        token?.actor?.sheet.render({ force: true });
    }

    static async #onFeature(event, target) {
        const item = this.fwToken?.actor.items.get(target.dataset.item);
        if (!item) return;
        const actions = Object.values(item.system.actions ?? {});
        if (actions.length === 1 && game.user.isGM) return actions[0].use(event);
        return item.toChat?.(event) ?? item.sheet.render({ force: true });
    }

    static async #onArrange() {
        await arrangeTokens(this.fwToken);
    }

    static #onEdit() {
        this.editing = !this.editing;
        this.linkFrom = null;
        this.render();
    }

    static async #onGround(event, target) {
        const id = target.closest('[data-id]')?.dataset.id;
        const base = this.#baseActor(id);
        const model = colossusModel(this.fwToken);
        const seg = model.segments.find(s => s.id === id);
        if (!base || !seg) return;
        await base.setFlag(MODULE_ID, 'segment', { ground: !seg.groundAccess });
        this.render();
    }

    static #onRules(event, target) {
        const page = CORE_PAGES[target.dataset.page ?? 'battle'];
        fromUuid(page).then(p => (p ? p.parent.sheet.render(true, { pageId: p.id }) : ui.notifications.warn(L('Notify.NoCore'))));
    }

    static async #onDefeat() {
        const fw = this.fwToken;
        if (colossusModel(fw).defeated) {
            await fw.unsetFlag(MODULE_ID, 'defeated');
            if (fw.actor.statuses.has('defeated')) await fw.actor.toggleStatusEffect('defeated', { active: false });
            return;
        }
        const ok = await foundry.applications.api.DialogV2.confirm({ window: { title: L('Board.Defeat') }, content: `<p>${L('Board.DefeatConfirm', { colossus: esc(fw.actor.name) })}</p>` });
        if (ok) await defeat(fw, { reason: 'gm' });
    }

    static async #onPlaceParts() {
        const fw = this.fwToken;
        await fw.actor.system.typeData.placeParts(fw);
        setTimeout(() => arrangeTokens(fw), 900);
    }
}

/**
 * A character climbs onto a segment or leaps to it from the one they're on: an action roll
 * (Agility or Strength) against the segment's Difficulty, adjusted by Climbing and Flying.
 */
export async function climb(actor, fwToken, segId) {
    const model = colossusModel(fwToken);
    const seg = model.segments.find(s => s.id === segId);
    if (!seg) return;
    const riding = ridingOn(actor);
    const fromId = riding?.fwToken === fwToken ? riding.segId : null;
    const from = model.segments.find(s => s.id === fromId) ?? null;
    const reach = canReach(from?.key ?? null, seg, { segments: model.segments, collapsed: model.collapsed });
    if (!reach.ok) return ui.notifications.warn(L(`Board.Why.${reach.why}`));
    if (reach.why === 'same') return setRider(fwToken, actor.uuid, seg.id, { quiet: true });

    if (!setting('climbRolls')) return setRider(fwToken, actor.uuid, seg.id);
    let { difficulty } = climbDifficulty(seg, model.segments);
    if (model.flying && !from) difficulty += model.flying.bonus ?? 2;
    const verb = from ? L('Board.Leap') : L('Board.Climb');
    const trait = await foundry.applications.api.DialogV2.wait({
        window: { title: `${verb}: ${seg.label}` },
        content: `<p>${L(from ? 'Board.LeapPrompt' : 'Board.ClimbPrompt', { from: esc(from?.label ?? ''), to: esc(seg.label), colossus: esc(model.short), difficulty })}</p>`,
        buttons: [
            { action: 'agility', label: game.i18n.localize('DAGGERHEART.CONFIG.Traits.agility.name'), icon: 'fa-solid fa-person-running', default: true },
            { action: 'strength', label: game.i18n.localize('DAGGERHEART.CONFIG.Traits.strength.name'), icon: 'fa-solid fa-hand-fist' }
        ],
        rejectClose: false
    });
    if (!trait) return;
    const result = await actor.rollTrait(trait, {
        title: `${verb}: ${model.short} — ${seg.label}`,
        roll: { type: 'trait', trait, difficulty }
    });
    if (!result) return;
    if (result.roll?.success) await setRider(fwToken, actor.uuid, seg.id);
    else ui.notifications.info(L('Board.ClimbFailed', { name: actor.name, segment: seg.label }));
}

/* ------------------------------------------------------------------ */
/*  One board per client, kept up to date                             */
/* ------------------------------------------------------------------ */

let board = null;

export function openBoard(fwToken = null) {
    board ??= new ColossusBoard();
    if (fwToken) board.fwId = fwToken.id ?? fwToken;
    board.render({ force: true });
    return board;
}

let pending = null;
function refresh() {
    if (!board?.rendered) return;
    clearTimeout(pending);
    pending = setTimeout(() => board.render(), 80);
}

export function registerBoardRefresh() {
    const onScene = doc => doc?.parent === canvas.scene || doc?.parent?.parent === canvas.scene;
    Hooks.on('updateToken', doc => onScene(doc) && refresh());
    Hooks.on('createToken', doc => onScene(doc) && refresh());
    Hooks.on('deleteToken', doc => onScene(doc) && refresh());
    Hooks.on('updateActor', actor => (isSegment(actor) || isFramework(actor) || actor.type === 'character') && refresh());
    Hooks.on('createActiveEffect', e => isSegment(e.parent) && refresh());
    Hooks.on('deleteActiveEffect', e => isSegment(e.parent) && refresh());
    Hooks.on('canvasReady', () => refresh());
    Hooks.on('controlToken', () => refresh());
}
