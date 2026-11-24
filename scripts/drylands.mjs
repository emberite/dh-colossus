/**
 * The campaign's own mechanics: hunts and interludes, the Siphoning Track and Kudamat's Power, the
 * colossi slain (each one a level for the party), and building Kudamat when he emerges.
 */
import { ART, CORE_PAGES, L, MODULE_ID, esc, hasCore, setting } from './constants.mjs';
import { COLOSSI_TO_SLAY, POWER_MAX, SIPHON_MAX, kudamatEmerges, kudamatThresholds, markSiphon, siphonResult } from './rules.mjs';
import { postCard } from './state.mjs';

const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api;

export const emptyCampaign = () => ({ phase: 'interlude', track: 1, power: 0, slain: [], log: [], lastRest: null, kudamat: null });

export function readCampaign() {
    return { ...emptyCampaign(), ...foundry.utils.deepClone(game.settings.get(MODULE_ID, 'drylands') ?? {}) };
}

async function saveCampaign(data, logText = null) {
    if (logText) data.log = [{ at: Date.now(), text: logText }, ...(data.log ?? [])].slice(0, 30);
    await game.settings.set(MODULE_ID, 'drylands', data);
    return data;
}

/* ------------------------------------------------------------------ */
/*  Siphoning                                                         */
/* ------------------------------------------------------------------ */

/** Mark the Siphoning Track for a rest during a hunt. Rolls the siphon when the track fills. */
export async function markRest(kind, { auto = false } = {}) {
    if (!game.user.isGM) return;
    const c = readCampaign();
    if (c.phase !== 'hunt') return auto ? null : ui.notifications.info(L('Drylands.NotHunting'));
    const before = c.track;
    c.track = markSiphon(c.track, kind);
    c.lastRest = { kind, at: Date.now() };
    await saveCampaign(c, L(kind === 'long' ? 'Drylands.Log.Long' : 'Drylands.Log.Short', { from: before, to: c.track }));
    await postCard({
        title: L('Drylands.Siphon.Title'),
        body: `<p>${L(kind === 'long' ? 'Drylands.Siphon.Long' : 'Drylands.Siphon.Short', { track: c.track, max: SIPHON_MAX })}</p>`,
        img: ART.godfell,
        gm: !setting('campaignPublic')
    });
    if (c.track >= SIPHON_MAX) await rollSiphon({ reason: 'full' });
}

/**
 * The soul shard gives power back to Kudamat: roll as many d12s as marked slots and add the
 * highest to his Power, then reset the track to 1.
 */
export async function rollSiphon({ reason = 'manual' } = {}) {
    if (!game.user.isGM) return;
    const c = readCampaign();
    const n = Math.max(1, c.track);
    const roll = await new Roll(`${n}d12kh`).evaluate();
    const dice = roll.dice[0].results.map(r => r.result);
    const res = siphonResult(c.track, c.power, dice);
    c.track = res.track;
    const before = c.power;
    c.power = res.power;
    await saveCampaign(c, L('Drylands.Log.Siphon', { n, gained: res.gained, power: c.power }));
    const publicRoll = setting('campaignPublic');
    if (game.dice3d) await game.dice3d.showForRoll(roll, game.user, true, publicRoll ? null : ChatMessage.getWhisperRecipients('GM'), !publicRoll).catch(() => {});
    const faces = dice
        .map(d => `<span class="dhco-die ${d === res.gained ? 'max' : ''}">${d}</span>`)
        .join('');
    await postCard({
        title: L('Drylands.Siphon.RollTitle'),
        body: `<p>${L(`Drylands.Siphon.Reason.${reason}`)}</p><div class="dhco-dice">${faces}</div><p>${L('Drylands.Siphon.Result', { gained: res.gained, from: before, to: c.power })}</p>`,
        img: ART.godfell,
        gm: !publicRoll
    });
    if (kudamatEmerges(c.slain.length, c.power) && !c.kudamat) await announceEmergence(c);
    return res;
}

/** A colossus falls: its soul shard shatters, the party levels up and the siphon is rolled. */
export async function shatter({ name, img, tier } = {}) {
    if (!game.user.isGM) return;
    const c = readCampaign();
    if (name && c.slain.some(s => s.name === name)) return ui.notifications.warn(L('Drylands.AlreadySlain', { name }));
    c.slain.push({ name: name ?? L('Drylands.UnknownColossus'), img: img ?? null, tier: tier ?? null, at: Date.now() });
    c.phase = 'interlude';
    await saveCampaign(c, L('Drylands.Log.Slain', { name: name ?? '?' }));
    const level = Math.min(10, 1 + c.slain.length);
    await postCard({
        title: L('Drylands.Shatter.Title'),
        body: `<p>${L('Drylands.Shatter.Body', { name: esc(name ?? '?') })}</p><p><strong>${L('Drylands.Shatter.Level', { level })}</strong></p><p>${L('Drylands.Shatter.Count', { n: c.slain.length, total: COLOSSI_TO_SLAY })}</p>`,
        img: img ?? ART.essentia,
        tone: 'victory'
    });
    await rollSiphon({ reason: 'defeated' });
}

async function announceEmergence(c) {
    await postCard({
        title: L('Drylands.Emerges.Title'),
        body: `<p>${L(c.slain.length >= COLOSSI_TO_SLAY ? 'Drylands.Emerges.Slain' : 'Drylands.Emerges.Power', { power: c.power })}</p><p>${L('Drylands.Emerges.Thresholds', kudamatThresholds(c.power))}</p>`,
        img: ART.godfell,
        tone: 'bad'
    });
}

/** Build Kudamat as a colossus framework with his thresholds. Segments are up to the GM. */
export async function buildKudamat() {
    if (!game.user.isGM) return;
    const c = readCampaign();
    const t = kudamatThresholds(Math.max(1, c.power));
    const actor = await Actor.create({
        name: L('Drylands.Kudamat'),
        type: 'adversary',
        img: ART.godfell,
        system: {
            tier: 4,
            type: 'colossus',
            typeData: { type: 'colossus', role: 'framework', parts: [] },
            damageThresholds: t,
            resources: { hitPoints: { value: 0, max: 0 }, stress: { value: 0, max: 6 } },
            description: `<p>${L('Drylands.KudamatDescription', { power: c.power })}</p>`,
            size: 'gargantuan'
        },
        prototypeToken: { width: 4, height: 4, disposition: -1, texture: { src: ART.godfell, fit: 'contain' } }
    });
    c.kudamat = actor.uuid;
    await saveCampaign(c, L('Drylands.Log.Built', t));
    actor.sheet.render({ force: true });
    ui.notifications.info(L('Drylands.Built', t));
    return actor;
}

/** Rests taken during a hunt mark the track. Each PC posts their own rest card, so rests close together count once. */
export function registerRestTracking() {
    Hooks.on('createChatMessage', message => {
        if (!game.users.activeGM?.isSelf || !setting('campaign') || !setting('autoSiphon')) return;
        if (!message.system?.moves) return;
        const html = String(message.content ?? '');
        const short = game.i18n.localize('DAGGERHEART.APPLICATIONS.Downtime.shortRest.title');
        const long = game.i18n.localize('DAGGERHEART.APPLICATIONS.Downtime.longRest.title');
        const kind = html.includes(long) ? 'long' : html.includes(short) ? 'short' : null;
        if (!kind) return;
        const c = readCampaign();
        const windowMs = setting('restWindow') * 60000;
        if (c.lastRest && c.lastRest.kind === kind && Date.now() - c.lastRest.at < windowMs) return;
        markRest(kind, { auto: true }).catch(err => console.error(`${MODULE_ID} | rest`, err));
    });
}

/* ------------------------------------------------------------------ */
/*  The app                                                           */
/* ------------------------------------------------------------------ */

export class DrylandsApp extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
        id: 'dh-colossus-drylands',
        classes: ['dh-colossus', 'dhco-drylands'],
        window: { title: 'DHCO.Drylands.Title', icon: 'fa-solid fa-mountain', resizable: true },
        position: { width: 560, height: 720 },
        actions: {
            phase: DrylandsApp.#onPhase,
            track: DrylandsApp.#onTrack,
            rest: DrylandsApp.#onRest,
            siphon: DrylandsApp.#onSiphon,
            power: DrylandsApp.#onPower,
            build: DrylandsApp.#onBuild,
            unslay: DrylandsApp.#onUnslay,
            slay: DrylandsApp.#onSlay,
            rules: DrylandsApp.#onRules,
            reset: DrylandsApp.#onReset
        }
    };

    static PARTS = { main: { template: `modules/${MODULE_ID}/templates/drylands.hbs`, scrollable: ['.dhco-scroll'] } };

    async _prepareContext() {
        const gm = game.user.isGM;
        const c = readCampaign();
        const emerged = kudamatEmerges(c.slain.length, c.power);
        const fmt = ts => new Date(ts).toLocaleDateString(game.i18n.lang, { month: 'short', day: 'numeric' });
        return {
            gm,
            hasCore: hasCore(),
            art: hasCore() ? ART.godfell : null,
            hunt: c.phase === 'hunt',
            track: Array.from({ length: SIPHON_MAX }, (_, i) => ({ i: i + 1, marked: i < c.track })),
            trackValue: c.track,
            trackMax: SIPHON_MAX,
            power: c.power,
            powerMax: POWER_MAX,
            powerPct: Math.min(100, (c.power / POWER_MAX) * 100).toFixed(1),
            thresholds: kudamatThresholds(c.power),
            slain: Array.from({ length: COLOSSI_TO_SLAY }, (_, i) => {
                const s = c.slain[i];
                return s ? { ...s, n: i + 1, date: fmt(s.at) } : { n: i + 1, empty: true };
            }),
            slainCount: c.slain.length,
            level: Math.min(10, 1 + c.slain.length),
            emerged,
            kudamat: c.kudamat,
            log: (c.log ?? []).slice(0, 8).map(l => ({ ...l, date: fmt(l.at) })),
            lastRest: c.lastRest ? L(`Drylands.LastRest.${c.lastRest.kind}`, { date: fmt(c.lastRest.at) }) : null
        };
    }

    static async #onPhase(event, target) {
        const c = readCampaign();
        c.phase = target.dataset.phase;
        await saveCampaign(c, L(`Drylands.Log.Phase.${c.phase}`));
        await postCard({ title: L(`Drylands.Phase.${c.phase}`), body: `<p>${L(`Drylands.PhaseBody.${c.phase}`)}</p>`, img: c.phase === 'hunt' ? ART.faceoff : null });
    }

    static async #onTrack(event, target) {
        const c = readCampaign();
        const i = Number(target.dataset.i);
        c.track = Math.max(1, c.track >= i ? i - 1 : i);
        await saveCampaign(c);
    }

    static async #onRest(event, target) {
        await markRest(target.dataset.kind);
    }

    static async #onSiphon() {
        await rollSiphon({ reason: 'manual' });
    }

    static async #onPower(event, target) {
        const c = readCampaign();
        const value = await foundry.applications.api.DialogV2.prompt({
            window: { title: L('Drylands.Power') },
            content: `<input type="number" name="power" min="0" max="${POWER_MAX}" value="${c.power}" autofocus>`,
            ok: { label: L('Board.Save'), callback: (ev, button) => Number(button.form.elements.power.value) }
        }).catch(() => null);
        if (value == null || Number.isNaN(value)) return;
        c.power = Math.max(0, Math.min(POWER_MAX, Math.round(value)));
        await saveCampaign(c, L('Drylands.Log.PowerSet', { power: c.power }));
    }

    static async #onBuild() {
        await buildKudamat();
    }

    static async #onSlay() {
        const name = await foundry.applications.api.DialogV2.prompt({
            window: { title: L('Drylands.AddSlain') },
            content: `<input type="text" name="name" placeholder="${esc(L('Drylands.ColossusName'))}" autofocus>`,
            ok: { label: L('Board.Save'), callback: (ev, button) => button.form.elements.name.value.trim() }
        }).catch(() => null);
        if (name) await shatter({ name });
    }

    static async #onUnslay(event, target) {
        const c = readCampaign();
        const i = Number(target.dataset.n) - 1;
        const s = c.slain[i];
        if (!s) return;
        const ok = await foundry.applications.api.DialogV2.confirm({ window: { title: L('Drylands.RemoveSlain') }, content: `<p>${L('Drylands.RemoveSlainConfirm', { name: esc(s.name) })}</p>` });
        if (!ok) return;
        c.slain.splice(i, 1);
        await saveCampaign(c, L('Drylands.Log.Unslain', { name: s.name }));
    }

    static #onRules(event, target) {
        fromUuid(CORE_PAGES[target.dataset.page ?? 'kudamat']).then(p => (p ? p.parent.sheet.render(true, { pageId: p.id }) : ui.notifications.warn(L('Notify.NoCore'))));
    }

    static async #onReset() {
        const ok = await foundry.applications.api.DialogV2.confirm({ window: { title: L('Drylands.Reset') }, content: `<p>${L('Drylands.ResetConfirm')}</p>` });
        if (ok) await saveCampaign(emptyCampaign(), L('Drylands.Log.Reset'));
    }
}

let app = null;
export function openDrylands() {
    app ??= new DrylandsApp();
    app.render({ force: true });
    return app;
}
export const refreshDrylands = () => app?.rendered && app.render();
