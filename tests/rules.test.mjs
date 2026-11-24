import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    autoLayout,
    canReach,
    climbDifficulty,
    collapseCheck,
    defeatCheck,
    hpFromDamage,
    kudamatEmerges,
    kudamatThresholds,
    markSiphon,
    parseFeature,
    rangeKey,
    segmentDamage,
    segmentKey,
    segmentLabel,
    segmentRules,
    siphonResult
} from '../scripts/rules.mjs';
import { COLOSSI, FEATURES } from '../data/packs.mjs';

const feat = f => ({ name: f.name, description: f.text, rule: f.rule });

/** Segments of a colossus from the compendium data, one per slot, as the module builds them. */
function build(key, state = {}) {
    const c = COLOSSI.find(x => x.key === key);
    return c.segments.flatMap(s =>
        s.slots.map(slot => ({
            key: segmentKey(s.name),
            label: slot.label,
            hpMax: s.hp,
            hpValue: state[slot.label]?.hp ?? 0,
            destroyed: s.hp > 0 && (state[slot.label]?.hp ?? 0) >= s.hp,
            broken: !!state[slot.label]?.broken,
            difficulty: s.difficulty,
            adjacent: s.adjacent,
            groundAccess: s.ground !== false,
            rules: segmentRules(s.features.map(feat))
        }))
    );
}
const seg = (segments, label) => segments.find(s => s.label === label);

test('ranges and keys', () => {
    assert.equal(rangeKey('Very Close'), 'veryClose');
    assert.equal(rangeKey('melee'), 'melee');
    assert.equal(segmentKey('Forelegs'), 'foreleg');
    assert.equal(segmentKey('Left Foreleg'), 'foreleg');
    assert.equal(segmentKey('Body Cavity'), 'body-cavity');
    assert.equal(segmentKey('Torso'), 'torso');
    assert.equal(segmentLabel('Ikeri Head', 'Ikeri, Injuries Untold'), 'Head');
    assert.equal(segmentLabel('Ikeri Arm (2)', 'Ikeri, Injuries Untold'), 'Arm');
    assert.equal(segmentLabel('Kelir Body Cavity', 'Kelir, the Virulent Hate & Her Hundred, Hundred Children'), 'Body Cavity');
    assert.equal(segmentLabel('Stone Fist', 'Ikeri'), 'Stone Fist');
});

test('every example feature with a rule is recognised', () => {
    const types = FEATURES.map(f => parseFeature(feat(f))?.type ?? null);
    assert.deepEqual(types, ['fatal', 'chain', 'strike', 'armored', 'climbing', 'notClimbable', 'weakPoint', null, null, null, 'collapse', null]);
    assert.deepEqual(parseFeature({ name: 'Chain (B)' }), { type: 'chain', chain: 'B' });
    assert.deepEqual(parseFeature({ name: 'Strike (Very Close)' }), { type: 'strike', range: 'veryClose' });
    assert.deepEqual(parseFeature({ name: 'Climbing (−2)' }), { type: 'climbing', mod: -2 });
    assert.deepEqual(parseFeature(feat(FEATURES[10])), { type: 'collapse', when: 'allMarked', group: 'leg' });
});

test('book conditions are read from the feature text', () => {
    const torso = COLOSSI[1].segments[1].features.map(feat).map(parseFeature);
    assert.deepEqual(torso[1], { type: 'climbing', mod: 3, unless: { key: 'head', states: ['broken'] } });
    assert.deepEqual(torso[2], { type: 'protected', unless: { key: 'head', states: ['broken', 'destroyed'] } });
    assert.deepEqual(torso[3], { type: 'weakPoint', amount: 1, range: 'melee', while: { key: 'head', states: ['broken', 'destroyed'] } });
    const neck = parseFeature(feat(COLOSSI[2].segments[1].features[1]));
    assert.deepEqual(neck, { type: 'protected', onlyCascade: true });
    const casc = COLOSSI[2].segments.map(s => s.features.map(feat).map(parseFeature).find(r => r?.type === 'cascade')).filter(Boolean);
    assert.deepEqual(casc.map(c => [c.target, c.hp]), [['neck', 3], ['neck', 1], ['neck', 2]]);
    const legs = parseFeature(feat(COLOSSI[1].segments[2].features[2]));
    assert.deepEqual(legs, { type: 'collapse', when: 'destroyed', group: 'foreleg', count: 1, token: true, permanentAt: 2 });
    const kelir = parseFeature(feat(COLOSSI[3].segments[4].features[2]));
    assert.deepEqual(kelir, { type: 'collapse', when: 'destroyed', group: 'leg', count: 3, permanent: true });
});

test('thresholds', () => {
    const t = { major: 11, severe: 22 };
    assert.equal(hpFromDamage(0, t), 0);
    assert.equal(hpFromDamage(5, t), 1);
    assert.equal(hpFromDamage(11, t), 2);
    assert.equal(hpFromDamage(30, t), 3);
    assert.equal(hpFromDamage(44, t, true), 4);
});

test('Ikeri: Strike (Melee) head, chains and fatal segments', () => {
    let s = build('ikeri');
    const head = seg(s, 'Head');
    assert.equal(segmentDamage({ hp: 2, rules: head.rules, segment: head, segments: s, range: 'far' }).hp, 0);
    assert.equal(segmentDamage({ hp: 2, rules: head.rules, segment: head, segments: s, range: 'melee' }).hp, 2);
    assert.equal(segmentDamage({ hp: 2, rules: head.rules, segment: head, segments: s, range: null }).hp, 2, 'unknown range is not blocked');
    assert.equal(defeatCheck(s), null);
    s = build('ikeri', { 'Left Arm': { hp: 3 }, 'Right Arm': { hp: 3 }, 'Left Leg': { hp: 3 } });
    assert.equal(defeatCheck(s), null, 'Chain A needs both arms and both legs');
    s = build('ikeri', { 'Left Arm': { hp: 3 }, 'Right Arm': { hp: 3 }, 'Left Leg': { hp: 3 }, 'Right Leg': { hp: 3 } });
    assert.deepEqual(defeatCheck(s), { reason: 'chain', chain: 'A' });
    s = build('ikeri', { Head: { hp: 5 } });
    assert.deepEqual(defeatCheck(s), { reason: 'fatal', label: 'Head' });
});

test('Daktadae: the Head guards the Torso', () => {
    let s = build('daktadae');
    let head = seg(s, 'Head');
    let torso = seg(s, 'Torso');
    assert.equal(segmentDamage({ hp: 3, rules: head.rules, segment: head, segments: s, range: 'melee' }).hp, 0, 'Head only takes damage while Broken');
    assert.equal(segmentDamage({ hp: 3, rules: torso.rules, segment: torso, segments: s, range: 'melee' }).hp, 0, 'Torso is protected');
    assert.equal(climbDifficulty(torso, s).difficulty, 17);
    s = build('daktadae', { Head: { broken: true } });
    head = seg(s, 'Head');
    torso = seg(s, 'Torso');
    assert.equal(segmentDamage({ hp: 3, rules: head.rules, segment: head, segments: s, range: 'melee' }).hp, 3);
    const r = segmentDamage({ hp: 2, rules: torso.rules, segment: torso, segments: s, range: 'melee' });
    assert.equal(r.hp, 3, 'Weak Point within Melee while the Head is Broken');
    assert.deepEqual(r.notes, [{ rule: 'weakPoint', change: '+1' }]);
    assert.equal(segmentDamage({ hp: 2, rules: torso.rules, segment: torso, segments: s, range: 'far' }).hp, 2);
    assert.equal(climbDifficulty(torso, s).difficulty, 14);
});

test('Daktadae: legs collapse it', () => {
    let s = build('daktadae', { 'Left Foreleg': { hp: 3 } });
    assert.deepEqual(collapseCheck(s), { permanent: false, token: true, source: 'Left Foreleg' });
    s = build('daktadae', { 'Left Foreleg': { hp: 3 }, 'Right Foreleg': { hp: 3 } });
    assert.equal(collapseCheck(s).permanent, true);
    assert.equal(collapseCheck(build('daktadae')), null);
});

test('Poy: invulnerable body, Neck only by Cascade, armored shell', () => {
    const s = build('poy');
    const body = seg(s, 'Body');
    const neck = seg(s, 'Neck');
    assert.equal(segmentDamage({ hp: 3, rules: body.rules, segment: body, segments: s, range: 'melee' }).hp, 0);
    assert.equal(segmentDamage({ hp: 3, rules: neck.rules, segment: neck, segments: s, range: 'melee' }).hp, 0);
    assert.equal(segmentDamage({ hp: 3, rules: neck.rules, segment: neck, segments: s, source: 'cascade' }).hp, 3);
    assert.equal(defeatCheck(build('poy', { Neck: { hp: 6 } })).reason, 'fatal');
    const k = build('kelir');
    const shell = seg(k, 'Shell');
    assert.equal(segmentDamage({ hp: 1, rules: shell.rules, segment: shell, segments: k, range: 'melee' }).hp, 0);
    assert.equal(segmentDamage({ hp: 3, rules: shell.rules, segment: shell, segments: k, range: 'melee' }).hp, 2);
});

test('Kelir: three legs collapse her; climbing the legs is easier', () => {
    const s = build('kelir', { 'Front Left Leg': { hp: 3 }, 'Front Right Leg': { hp: 3 } });
    assert.equal(collapseCheck(s), null);
    const s3 = build('kelir', { 'Front Left Leg': { hp: 3 }, 'Front Right Leg': { hp: 3 }, 'Rear Left Leg': { hp: 3 } });
    assert.equal(collapseCheck(s3).permanent, true);
    assert.equal(climbDifficulty(seg(s, 'Rear Left Leg'), s).difficulty, 13);
});

test('moving around a colossus', () => {
    const s = build('kelir');
    const head = seg(s, 'Head');
    const leg = seg(s, 'Rear Left Leg');
    assert.deepEqual(canReach(null, leg, { segments: s }), { ok: true });
    assert.deepEqual(canReach(null, head, { segments: s }), { ok: false, why: 'notFromGround' });
    assert.deepEqual(canReach(null, head, { segments: s, collapsed: true }), { ok: true });
    assert.deepEqual(canReach('leg', head, { segments: s }), { ok: false, why: 'notAdjacent' });
    assert.deepEqual(canReach('shell', head, { segments: s }), { ok: true });
    assert.deepEqual(canReach('head', seg(s, 'Shell'), { segments: s }), { ok: true });
    const ik = build('ikeri');
    assert.deepEqual(canReach('leg', seg(ik, 'Right Leg'), { segments: ik }), { ok: true, why: 'same' });
});

test('Emergence of Kudamat', () => {
    assert.equal(markSiphon(1, 'short'), 2);
    assert.equal(markSiphon(1, 'long'), 3);
    assert.equal(markSiphon(9, 'long'), 10);
    assert.deepEqual(siphonResult(4, 20, [3, 11, 7, 2]), { track: 1, power: 31, gained: 11, dice: [3, 11, 7, 2] });
    assert.equal(siphonResult(4, 95, [12]).power, 100);
    assert.deepEqual(kudamatThresholds(57), { major: 29, severe: 57 });
    assert.equal(kudamatEmerges(9, 10), true);
    assert.equal(kudamatEmerges(4, 100), true);
    assert.equal(kudamatEmerges(4, 99), false);
});

test('every compendium slot fits the board and doesn’t overlap', () => {
    for (const c of COLOSSI) {
        const cells = new Map();
        for (const s of c.segments) {
            assert.equal(s.slots.length, s.quantity ?? 1, `${c.short} ${s.name} slots`);
            for (const slot of s.slots) {
                assert.ok(slot.x >= 0 && slot.y >= 0 && slot.x + slot.w <= 12 && slot.y + slot.h <= 10, `${c.short} ${slot.label} on the board`);
                for (let x = slot.x; x < slot.x + slot.w; x++)
                    for (let y = slot.y; y < slot.y + slot.h; y++) {
                        assert.ok(!cells.has(`${x},${y}`), `${c.short}: ${slot.label} overlaps ${cells.get(`${x},${y}`)}`);
                        cells.set(`${x},${y}`, slot.label);
                    }
            }
            for (const a of s.adjacent) assert.ok(c.segments.some(o => segmentKey(o.name) === a), `${c.short} ${s.name} adjacent ${a}`);
        }
    }
    assert.equal(autoLayout(6).length, 6);
});
