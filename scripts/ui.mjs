/**
 * Where the module meets the system's UI: the colossus section of the adversary sheet, the
 * colossus tab of its settings, the Daggerheart sidebar menu, scene controls, the token HUD and
 * the buttons of this module's chat cards.
 */
import { L, MODULE_ID, PACKS, esc } from './constants.mjs';
import { frameworkOf, frameworkTokens, isColossus, isFramework, isSegment, segmentConfig } from './colossus.mjs';
import { openBoard } from './board.mjs';
import { openDrylands, shatter } from './drylands.mjs';
import { segmentRules } from './rules.mjs';
import { setRider } from './state.mjs';

const rootOf = html => (html instanceof HTMLElement ? html : html?.[0]);

/** The framework token of an actor shown in a sheet (a token actor, or a world actor with a token on the scene). */
function fwTokenFor(actor) {
    if (!actor) return null;
    const token = actor.token ?? actor.getActiveTokens(false, true)[0] ?? null;
    if (isFramework(actor)) return token;
    if (isSegment(actor) && token) return frameworkOf(token);
    return null;
}

function ruleChips(actor) {
    const r = segmentRules(actor.items.filter(i => i.type === 'feature').map(i => ({ name: i.name, description: i.system.description, rule: i.getFlag(MODULE_ID, 'rule') })));
    return r.list.map(x => `<span class="dhco-chip" data-tooltip="${esc(L(`Rule.${x.type}`))}">${esc(x.name)}</span>`).join('');
}

export function registerUI() {
    // Adversary sheet: open the board from the colossus section; a segment's rules at a glance.
    Hooks.on('renderAdversarySheet', (sheet, html) => {
        const root = rootOf(html);
        const actor = sheet.document;
        if (!root || !isColossus(actor)) return;
        const section = root.querySelector('.colossus-section');
        if (!section || section.querySelector('.dhco-sheet-tools')) return;
        const div = document.createElement('div');
        div.className = 'dhco-sheet-tools';
        const chips = isSegment(actor) ? ruleChips(actor) : '';
        div.innerHTML = `${chips ? `<div class="dhco-chips">${chips}</div>` : ''}
            <button type="button" class="dhco-open-board"><i class="fa-solid fa-mountain-sun"></i> ${L('Board.Open')}</button>`;
        div.querySelector('button').addEventListener('click', () => {
            const fw = fwTokenFor(actor);
            if (!fw) return ui.notifications.info(L('Notify.NotOnScene'));
            openBoard(fw);
        });
        section.append(div);
    });

    // Adversary settings, colossus tab: a segment's key, adjacency and ground access for the board.
    Hooks.on('renderDHAdversarySettings', (app, html) => {
        const root = rootOf(html);
        const actor = app.document;
        if (!root || !isSegment(actor)) return;
        const tab = root.querySelector('section[data-tab="colossus"]');
        if (!tab || tab.querySelector('.dhco-segment-config')) return;
        const fwName = actor.system.typeData.frameworkActor?.name ?? '';
        const cfg = segmentConfig(actor, fwName);
        const fs = document.createElement('fieldset');
        fs.className = 'dhco-segment-config';
        fs.innerHTML = `<legend>${L('Settings.Segment.Legend')}</legend>
            <div class="form-group"><label>${L('Settings.Segment.Key')}</label><div class="form-fields"><input type="text" name="dhco-key" value="${esc(cfg.key)}"></div>
                <p class="hint">${L('Settings.Segment.KeyHint')}</p></div>
            <div class="form-group"><label>${L('Settings.Segment.Adjacent')}</label><div class="form-fields"><input type="text" name="dhco-adjacent" value="${esc(cfg.adjacent.join(', '))}"></div>
                <p class="hint">${L('Settings.Segment.AdjacentHint')}</p></div>
            <div class="form-group"><label>${L('Settings.Segment.Ground')}</label><div class="form-fields"><input type="checkbox" name="dhco-ground" ${cfg.ground ? 'checked' : ''}></div>
                <p class="hint">${L('Settings.Segment.GroundHint')}</p></div>`;
        const save = async () => {
            const key = fs.querySelector('[name="dhco-key"]').value.trim();
            const adjacent = fs
                .querySelector('[name="dhco-adjacent"]')
                .value.split(',')
                .map(s => s.trim().toLowerCase())
                .filter(Boolean);
            const ground = fs.querySelector('[name="dhco-ground"]').checked;
            await actor.setFlag(MODULE_ID, 'segment', { key, adjacent, ground });
        };
        for (const input of fs.querySelectorAll('input')) {
            // Keep the system's form from submitting these fields.
            input.removeAttribute('form');
            input.addEventListener('change', ev => {
                ev.stopPropagation();
                save();
            });
        }
        tab.append(fs);
    });

    // Daggerheart sidebar menu.
    Hooks.on('renderDaggerheartMenu', (menu, html) => {
        const root = rootOf(html);
        if (!root || root.querySelector('.dh-colossus-menu')) return;
        const fieldsets = root.querySelectorAll('fieldset');
        const last = fieldsets[fieldsets.length - 1];
        const fieldset = document.createElement('fieldset');
        fieldset.className = 'dh-colossus-menu';
        fieldset.innerHTML = `
            <legend>${L('Menu.Legend')}</legend>
            <div class="menu-options-container">
                <div class="menu-options-inner-container">
                    <button type="button" data-dhco-open="board"><i class="fa-solid fa-mountain-sun"></i> ${L('Menu.Board')}</button>
                    <button type="button" data-dhco-open="drylands"><i class="fa-solid fa-mountain"></i> ${L('Menu.Drylands')}</button>
                    ${game.user.isGM ? `<button type="button" data-dhco-open="colossi"><i class="fa-solid fa-book-skull"></i> ${L('Menu.Colossi')}</button>` : ''}
                </div>
            </div>`;
        for (const btn of fieldset.querySelectorAll('[data-dhco-open]'))
            btn.addEventListener('click', () => {
                const what = btn.dataset.dhcoOpen;
                if (what === 'board') openBoard();
                else if (what === 'drylands') openDrylands();
                else game.packs.get(PACKS.colossi)?.render(true);
            });
        if (last) last.after(fieldset);
        else root.append(fieldset);
    });

    // Token controls: the board, while a colossus is on the scene.
    Hooks.on('getSceneControlButtons', controls => {
        const tokens = controls.tokens ?? controls.token;
        if (!tokens?.tools || !frameworkTokens().length) return;
        tokens.tools.dhcoBoard = {
            name: 'dhcoBoard',
            title: 'DHCO.Board.Title',
            icon: 'fa-solid fa-mountain-sun',
            order: 60,
            button: true,
            onChange: () => openBoard()
        };
    });
    Hooks.on('createToken', doc => doc.parent === canvas.scene && isFramework(doc.actor) && ui.controls?.render());

    // Token HUD of a framework or segment: open the board.
    Hooks.on('renderTokenHUD', (hud, html) => {
        const root = rootOf(html);
        const token = hud.object?.document;
        if (!root || !token || !isColossus(token.actor)) return;
        const fw = isFramework(token.actor) ? token : frameworkOf(token);
        if (!fw || root.querySelector('.dhco-hud')) return;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'control-icon dhco-hud';
        btn.dataset.tooltip = L('Board.Open');
        btn.innerHTML = '<i class="fa-solid fa-mountain-sun"></i>';
        btn.addEventListener('click', () => openBoard(fw));
        (root.querySelector('.col.left') ?? root).append(btn);
    });

    // Buttons of this module's chat cards.
    Hooks.on('renderChatMessageHTML', (message, html) => {
        if (!message.getFlag(MODULE_ID, 'card')) return;
        for (const btn of html.querySelectorAll('[data-dhco]')) {
            if (!game.user.isGM) {
                btn.remove();
                continue;
            }
            btn.addEventListener('click', async ev => {
                ev.preventDefault();
                btn.disabled = true;
                try {
                    const data = JSON.parse(btn.dataset.dhcoData || '{}');
                    if (btn.dataset.dhco === 'shatter') await shatter(data);
                    else if (btn.dataset.dhco === 'fall') await setRider(data.fw, data.actor, null, { reason: 'fall' });
                } catch (err) {
                    ui.notifications.error(err.message);
                    btn.disabled = false;
                }
            });
        }
    });
}
