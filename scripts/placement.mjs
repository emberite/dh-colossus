/**
 * Segment tokens on the canvas. The system drops a colossus's part tokens at random spots around
 * the framework token; this arranges them in the shape of the colossus (its board layout), names
 * each instance after its slot ("Left Leg", "Right Leg") and keeps the framework token beneath.
 */
import { MODULE_ID, setting } from './constants.mjs';
import { colossusModel } from './colossus.mjs';

/** Arrange the segment tokens of a framework token in the colossus's shape. */
export async function arrangeTokens(fwToken) {
    if (!fwToken || !game.user.isGM) return;
    const model = colossusModel(fwToken);
    if (!model.segments.length) return;
    const scene = fwToken.parent;
    const grid = scene.grid.size;
    const scale = setting('arrangeScale');
    const fwCenter = { x: fwToken.x + (fwToken.width * grid) / 2, y: fwToken.y + (fwToken.height * grid) / 2 };

    // The layout's bounding box is centred on the framework token.
    const xs = model.segments.flatMap(s => [s.layout.x, s.layout.x + s.layout.w]);
    const ys = model.segments.flatMap(s => [s.layout.y, s.layout.y + s.layout.h]);
    const mid = { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };

    const updates = model.segments.map(s => {
        const cx = fwCenter.x + (s.layout.x + s.layout.w / 2 - mid.x) * grid * scale;
        const cy = fwCenter.y + (s.layout.y + s.layout.h / 2 - mid.y) * grid * scale;
        const w = s.token.width * grid;
        const h = s.token.height * grid;
        const snap = v => Math.round(v / (grid / 2)) * (grid / 2);
        return {
            _id: s.id,
            x: snap(cx - w / 2),
            y: snap(cy - h / 2),
            name: s.label,
            sort: (fwToken.sort ?? 0) + 1,
            [`flags.${MODULE_ID}.slot`]: s.slotIndex
        };
    });
    await scene.updateEmbeddedDocuments('Token', updates, { animation: { duration: 500 } });
}

/**
 * After the system places a framework's part tokens, arrange them. Wraps the system's
 * placeParts so it happens whichever way the parts were placed.
 */
export function registerPlacement() {
    const Model = CONFIG.DH?.ACTOR?.adversaryTypeModels?.colossus;
    if (!Model?.prototype?.placeParts) return;
    const original = Model.prototype.placeParts;
    Model.prototype.placeParts = async function (token) {
        const result = await original.call(this, token);
        const fw = token ?? this.parent?.parent?.token;
        if (fw && setting('autoArrange') && game.user.isGM) {
            // The system animates the new tokens to random spots; arrange once that's done.
            setTimeout(() => arrangeTokens(fw).catch(err => console.error(`${MODULE_ID} | arrange`, err)), 800);
        }
        return result;
    };
}
