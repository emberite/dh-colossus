/**
 * Compendium content of the Colossus of the Drylands campaign frame (Daggerheart Core Rulebook,
 * chapter 5): the four example colossi and the example colossus features.
 * Source for tools/build-packs.mjs, which turns it into Daggerheart system documents.
 *
 * Feature shorthand (as in Weredragon):
 *   { name, form: 'passive'|'action'|'reaction', img, text, rule?, act?: {
 *       type: 'attack'|'damage'|'save'|'effect', cost: {stress|fear: n}, damage: '2d8+7',
 *       dtype: 'physical'|'magical', range, save: trait, area, effect: { name, statuses, changes } } }
 * `rule` is stored as the feature's dh-colossus rule flag (see scripts/rules.mjs). Most rules are
 * read from the feature name and text, so it's only needed where the text doesn't say it plainly.
 *
 * Segment slots place the cards on the Colossus Board (a 12 × 10 grid) and the tokens on the
 * canvas around the framework token. `ground: false` marks segments that can't be climbed from
 * the ground until the colossus is Collapsed.
 */

export const META = {
    MOD: 'dh-colossus',
    SOURCE: 'Daggerheart Core Rulebook',
    CORE: 'daggerheart-core'
};

const ART_DIR = `modules/${META.CORE}/assets/art`;
export const ART = {
    ikeri: `${ART_DIR}/frame-301-colossus-ikeri.webp`,
    daktadae: `${ART_DIR}/frame-305-colossus-daktade.webp`,
    poy: `${ART_DIR}/frame-307-colossus-poy.webp`,
    kelir: `${ART_DIR}/frame-308-colossus-kelir.webp`
};

const I = {
    fatal: 'icons/magic/death/projectile-skull-fire-orange-red.webp',
    chain: 'icons/tools/fasteners/chain-steel-blue.webp',
    strike: 'icons/skills/targeting/crosshair-pointed-orange.webp',
    armored: 'icons/equipment/shield/heater-steel-worn.webp',
    climb: 'icons/sundries/misc/ladder.webp',
    noClimb: 'icons/environment/wilderness/terrain-rocks-brown.webp',
    weak: 'icons/skills/targeting/target-glowing-yellow.webp',
    invulnerable: 'icons/magic/defensive/shield-barrier-glowing-blue.webp',
    protected: 'icons/magic/defensive/armor-stone-skin.webp',
    power: 'icons/magic/control/fear-fright-monster-grin-red-orange.webp',
    swat: 'icons/skills/melee/unarmed-punch-fist-yellow-red.webp',
    shake: 'icons/magic/earth/barrier-stone-explosion-red.webp',
    rage: 'icons/magic/control/fear-fright-shadow-monster-red.webp',
    collapse: 'icons/magic/earth/projectile-boulder-debris.webp',
    cascade: 'icons/magic/earth/strike-fist-stone-gray.webp',
    peck: 'icons/commodities/bones/beak-hooked-red.webp',
    punch: 'icons/skills/melee/unarmed-punch-fist-yellow-red.webp',
    stomp: 'icons/creatures/abilities/paw-print-orange.webp',
    crush: 'icons/skills/melee/unarmed-punch-fist-white.webp',
    followUp: 'icons/skills/melee/strike-slashes-orange.webp',
    steam: 'icons/magic/air/fog-gas-smoke-swirling-gray.webp',
    roll: 'icons/magic/movement/trail-streak-zigzag-yellow.webp',
    recover: 'icons/magic/life/heart-cross-strong-flame-green.webp',
    cleaver: 'icons/weapons/axes/axe-broad-black.webp',
    toss: 'icons/skills/melee/strike-axe-blood-red.webp',
    hoof: 'icons/creatures/abilities/paw-print-tan.webp',
    quake: 'icons/magic/earth/strike-fist-stone-light.webp',
    kick: 'icons/skills/melee/strike-hammer-destructive-orange.webp',
    flying: 'icons/commodities/biological/wing-bird-white.webp',
    wind: 'icons/magic/air/wind-tornado-wall-blue.webp',
    fall: 'icons/magic/movement/trail-streak-impact-blue.webp',
    screech: 'icons/magic/sonic/scream-wail-shout-teal.webp',
    bill: 'icons/creatures/abilities/mouth-teeth-long-red.webp',
    dive: 'icons/magic/movement/abstract-ribbons-red-orange.webp',
    talon: 'icons/creatures/claws/claw-talons-glowing-orange.webp',
    pickUp: 'icons/creatures/claws/claw-talons-yellow-red.webp',
    dust: 'icons/magic/air/wind-weather-sailing-ship.webp',
    flap: 'icons/commodities/biological/wing-lizard-brown.webp',
    tail: 'icons/creatures/abilities/tail-swipe-green.webp',
    brood: 'icons/creatures/invertebrates/spider-mandibles-brown.webp',
    heart: 'icons/commodities/biological/organ-heart-red.webp',
    rend: 'icons/creatures/claws/pincer-crab-red.webp',
    swarm: 'icons/creatures/invertebrates/bug-sixlegged-gray.webp',
    eyes: 'icons/magic/perception/eye-ringed-glow-angry-red.webp',
    gaze: 'icons/magic/perception/eye-slit-pink.webp',
    fury: 'icons/magic/control/hypnosis-mesmerism-swirl.webp',
    pincer: 'icons/creatures/claws/pincer-crab-red.webp',
    sever: 'icons/magic/control/sihouette-hold-beam-green.webp',
    hurl: 'icons/magic/movement/trail-streak-pink.webp',
    scuttle: 'icons/creatures/claws/pincer-crab-brown.webp'
};

/* ------------------------------------------------------------------ */
/*  The book's example colossus features                              */
/* ------------------------------------------------------------------ */

const F = {
    fatal: seg => ({ name: 'Fatal', form: 'passive', img: I.fatal, text: `<p>When ${seg ? `the ${seg}` : 'this segment'} is <em>Destroyed</em>, the colossus is defeated.</p>` }),
    chain: (letter, colossus) => ({
        name: `Chain (${letter})`,
        form: 'passive',
        img: I.chain,
        text: `<p>When all segments in Chain ${letter} are <em>Destroyed</em>, ${colossus ?? 'the colossus'} is defeated.</p>`
    }),
    strike: (range, seg) => ({
        name: `Strike (${range})`,
        form: 'passive',
        img: I.strike,
        text: `<p>${seg ? `The ${seg} is` : 'This segment is'} immune to damage from attacks not made within ${range} range.</p>`
    }),
    armored: seg => ({ name: 'Armored', form: 'passive', img: I.armored, text: `<p>When ${seg ? `the ${seg}` : 'this segment'} marks HP from an attack, it marks 1 fewer HP.</p>` }),
    colossalPower: colossus => ({ name: 'Colossal Power', form: 'reaction', img: I.power, text: `<p>When ${colossus} fails an attack, you gain a Fear.</p>` }),
    shakeOff: colossus => ({
        name: 'Shake Off',
        form: 'action',
        img: I.shake,
        text: `<p><strong>Spend a Fear</strong> to throw off foes. All creatures on ${colossus} must make a Strength Reaction Roll. Targets who fail fall to the ground and must mark a HP. Targets who succeed must mark a Stress.</p>`,
        flags: { shakeOff: true },
        act: { type: 'save', save: 'strength', cost: { fear: 1 } }
    })
};

/** Features for the "Colossus Features" compendium, for building your own colossi. */
export const FEATURES = [
    { ...F.fatal(), note: '' },
    {
        ...F.chain('A'),
        name: 'Chain',
        text: '<p>When all segments in this chain are <em>Destroyed</em>, the colossus is defeated.</p><p><em>This feature might appear as Chain (A) or Chain (B) for clarity across multiple segment chains. Rename it “Chain (B)” for a second chain.</em></p>'
    },
    {
        ...F.strike('Melee'),
        text: '<p>This segment is immune to damage from attacks not made within Melee range.</p><p><em>Melee could be replaced with any range to change up this feature: rename it “Strike (Very Close)”, for example.</em></p>'
    },
    F.armored(),
    {
        name: 'Climbing (+3)',
        form: 'passive',
        img: I.climb,
        text: '<p>This segment’s Difficulty gains a +3 bonus against action rolls made to climb it.</p><p><em>This could also be a negative number, such as –3, which would mean the Difficulty to climb is reduced. Rename the feature to change the number.</em></p>'
    },
    { name: 'Not Climbable', form: 'passive', img: I.noClimb, text: '<p>This segment can’t be climbed.</p>' },
    {
        name: 'Weak Point',
        form: 'passive',
        img: I.weak,
        text: '<p>The colossus has a weak point on this segment. When this segment marks HP from an attack made within Melee range, it marks an additional HP.</p><p><em>Typically, hitting the weak point of a segment while within Melee range causes the colossus to mark an additional HP, but hitting weak points can have other effects! Feel free to experiment with other outcomes. Maybe that segment can’t be used for a few GM turns, or its damage is halved the next time it’s spotlighted.</em></p>'
    },
    F.shakeOff('the colossus'),
    {
        name: 'Kudamat’s Rage',
        form: 'action',
        img: I.rage,
        text: '<p><strong>Spend 2 Fear</strong> to force all PCs within Very Far range to succeed on a Presence Reaction Roll or become <em>Shaken</em>. While Shaken, they don’t gain Hope on a result with Hope and instead clear the Shaken condition.</p>',
        act: { type: 'save', save: 'presence', range: 'veryFar', cost: { fear: 2 }, effect: { name: 'Shaken', statuses: ['dhcoShaken'], img: I.rage } }
    },
    {
        name: 'Swatting Pests',
        form: 'reaction',
        img: I.swat,
        text: '<p>When the colossus is attacked by a flying target within Far range, you can make a standard attack against the attacker. On a success, add a d20 to the damage roll and the target is knocked to the ground within Far range.</p>'
    },
    {
        name: 'Collapsed',
        form: 'reaction',
        img: I.collapse,
        text: '<p>When the colossus marks at least 1 HP on all Leg segments, it <em>Collapses</em>. While the colossus is Collapsed, segments that aren’t accessible from the ground can be climbed.</p><p><em>This reaction is typically used in conjunction with the “Not Climbable” passive feature. You can always change the trigger out for something that makes more sense within the fiction as it occurs.</em></p>'
    },
    F.colossalPower('the colossus')
];

/* ------------------------------------------------------------------ */
/*  Tier 1: Ikeri, Injuries Untold                                    */
/* ------------------------------------------------------------------ */

const IKERI = {
    key: 'ikeri',
    name: 'Ikeri, Injuries Untold',
    short: 'Ikeri',
    tier: 1,
    img: ART.ikeri,
    description: '<p>This apelike creature has the face of a bird. They are made of stone and carry an enormous mesa upon their back.</p>',
    motives: 'Entangle, intimidate, peck, stomp',
    size: '95 ft. tall, 60 ft. wide',
    thresholds: [11, 22],
    stress: 6,
    experiences: [
        ['Eagle Eyes', 3],
        ['Huge', 2]
    ],
    features: [
        F.colossalPower('Ikeri'),
        {
            name: 'Swatting Pests',
            form: 'reaction',
            img: I.swat,
            text: '<p>When Ikeri is attacked by a flying target within Far range, you can make a Peck (Head) or Punch (Arm) standard attack against the attacker. On a success, add a d20 to the damage roll and the target is knocked to the ground at the feet of the colossus.</p>'
        }
    ],
    segments: [
        {
            name: 'Head',
            adjacent: ['torso'],
            difficulty: 16,
            hp: 5,
            attack: { name: 'Peck', range: 'melee', bonus: 2, damage: '1d10+1', img: I.peck },
            slots: [{ label: 'Head', x: 5, y: 0, w: 3, h: 2 }],
            features: [
                F.fatal('Head'),
                F.strike('Melee', 'Head'),
                {
                    name: 'Follow-Up',
                    form: 'reaction',
                    img: I.followUp,
                    text: '<p>When the Head succeeds on an attack against a target, it can immediately make an attack against another target it hasn’t attacked during this GM turn.</p>'
                }
            ]
        },
        {
            name: 'Torso',
            adjacent: ['head', 'arm', 'leg'],
            difficulty: 14,
            hp: 8,
            slots: [{ label: 'Torso', x: 4, y: 2, w: 5, h: 3 }],
            features: [F.fatal('Torso'), F.shakeOff('Ikeri')]
        },
        {
            name: 'Arm',
            quantity: 2,
            adjacent: ['torso'],
            difficulty: 13,
            hp: 3,
            attack: { name: 'Punch', range: 'veryClose', bonus: 2, damage: '1d8+6', img: I.punch },
            slots: [
                { label: 'Left Arm', x: 1, y: 2, w: 3, h: 3 },
                { label: 'Right Arm', x: 9, y: 2, w: 3, h: 3 }
            ],
            features: [
                F.chain('A', 'Ikeri'),
                {
                    name: 'Crush',
                    form: 'action',
                    img: I.crush,
                    text: '<p><strong>Spend a Fear</strong> to make an attack against a target on another segment of Ikeri. On a success, Ikeri grabs and crushes the target, dealing <strong>1d20+4</strong> physical damage and <em>Restraining</em> them until this Arm takes Major or greater damage. When this Arm takes the spotlight while the target is still in Ikeri’s hand, the target takes <strong>1d20</strong> physical damage.</p>',
                    act: { type: 'attack', cost: { fear: 1 }, damage: '1d20+4', range: 'veryClose', effect: { name: 'Crushed', statuses: ['restrained'], img: I.crush } }
                }
            ]
        },
        {
            name: 'Leg',
            quantity: 2,
            adjacent: ['torso', 'leg'],
            difficulty: 13,
            hp: 3,
            attack: { name: 'Stomp', range: 'veryClose', bonus: 2, damage: '1d6+3', img: I.stomp },
            slots: [
                { label: 'Left Leg', x: 3, y: 5, w: 3, h: 3 },
                { label: 'Right Leg', x: 7, y: 5, w: 3, h: 3 }
            ],
            features: [
                F.chain('A', 'Ikeri'),
                {
                    name: 'Massive Stomp',
                    form: 'action',
                    img: I.stomp,
                    text: '<p><strong>Spend a Fear</strong> to make a standard attack with advantage against a group.</p>',
                    act: { type: 'attack', cost: { fear: 1 }, damage: '1d6+3', range: 'veryClose', advantage: true, targets: null }
                }
            ]
        }
    ]
};

/* ------------------------------------------------------------------ */
/*  Tier 2: Daktadae, the Cleaver                                     */
/* ------------------------------------------------------------------ */

const collapseLegs = (leg, legs) => ({
    name: 'Collapse',
    form: 'reaction',
    img: I.collapse,
    text: `<p>If one ${leg} is <em>Destroyed</em>, place a token on this segment. Until it is cleared, Daktadae is <em>Collapsed</em>, allowing PCs to climb directly onto the Torso and Head. If both ${legs} are Destroyed, Daktadae is Collapsed permanently.</p>`
});

const DAKTADAE = {
    key: 'daktadae',
    name: 'Daktadae, the Cleaver',
    short: 'Daktadae',
    tier: 2,
    img: ART.daktadae,
    description: '<p>A massive steel rhinoceros formed from a steam train, a cleaver emerging from his head instead of a horn.</p>',
    motives: 'Clear forests, cleave, hew, stomp',
    size: '130 ft. tall, 220 ft. long',
    thresholds: [16, 25],
    stress: 6,
    experiences: [
        ['Huge', 2],
        ['Trampling', 2]
    ],
    features: [
        {
            name: 'Steam-Powered',
            form: 'action',
            img: I.steam,
            text: '<p>Scalding fountains of steam erupt from Daktadae’s form. Spotlight any segment to make an attack with a +1 attack modifier against a target on that segment. On a success, deal <strong>2d6+3</strong> physical damage.</p>',
            act: { type: 'attack', bonus: 1, damage: '2d6+3', range: 'melee' }
        },
        {
            name: 'Roll',
            form: 'action',
            img: I.roll,
            text: '<p><strong>Spend a Fear</strong> to have Daktadae drop to the ground and roll. All PCs on Daktadae or within Close range must succeed on an Instinct Reaction Roll (14) or take <strong>2d20+5</strong> physical damage; succeed or fail, the PCs are thrown off Daktadae onto the ground within Melee range of the colossus.</p>',
            flags: { throwOff: true },
            act: { type: 'save', save: 'instinct', difficulty: 14, cost: { fear: 1 }, damage: '2d20+5', range: 'close' }
        },
        { name: 'Slow Recovery', form: 'action', img: I.recover, text: '<p>Clear a token from one <em>Broken</em> or <em>Collapsed</em> segment.</p>' },
        // The book's stat block says "When Ikeri fails an attack" here, a copy slip from the Tier 1 colossus.
        F.colossalPower('Daktadae')
    ],
    segments: [
        {
            name: 'Head',
            adjacent: ['torso'],
            difficulty: 15,
            hp: 5,
            ground: false,
            attack: { name: 'Cleaver', range: 'melee', bonus: 2, damage: '2d20+8', img: I.cleaver },
            slots: [{ label: 'Head', x: 0, y: 1, w: 3, h: 3 }],
            features: [
                { name: 'Invulnerable', form: 'passive', img: I.invulnerable, text: '<p>The Head can only take damage while it’s <em>Broken</em>.</p>' },
                {
                    name: 'Godcleaver',
                    form: 'action',
                    img: I.cleaver,
                    text: '<p>Make a standard attack against a target. On a success, <strong>mark a Stress</strong> to deal <strong>3d20+12</strong> physical damage instead.</p>',
                    act: { type: 'attack', cost: { stress: 1 }, damage: '3d20+12', range: 'melee' }
                },
                {
                    name: 'Head Toss',
                    form: 'action',
                    img: I.toss,
                    text: '<p><strong>Mark a Stress</strong> and make a standard attack against all targets within range who are not on this segment or the Torso. On a success, place 2 tokens on this segment. It is <em>Broken</em> until all tokens are cleared.</p>',
                    rule: { breaks: 2 },
                    act: { type: 'attack', cost: { stress: 1 }, damage: '2d20+8', range: 'melee', targets: null }
                },
                {
                    name: 'Cleaver Recovery',
                    form: 'reaction',
                    img: I.recover,
                    text: '<p>After making a standard attack, place a token on this segment. It is <em>Broken</em> until all tokens are cleared.</p>',
                    rule: { breaksAfterAttack: 1 }
                }
            ]
        },
        {
            name: 'Torso',
            adjacent: ['head', 'foreleg', 'hindleg'],
            difficulty: 14,
            hp: 6,
            ground: false,
            slots: [{ label: 'Torso', x: 3, y: 1, w: 6, h: 4 }],
            features: [
                F.fatal(),
                {
                    name: 'Climbing (+3)',
                    form: 'passive',
                    img: I.climb,
                    text: '<p>The Torso’s Difficulty gains a +3 bonus against action rolls made to climb it unless the Head is <em>Broken</em>.</p>'
                },
                {
                    name: 'Protected',
                    form: 'passive',
                    img: I.protected,
                    text: '<p>The Torso is covered with external rib plates of unbreakable minerals. This segment can’t be damaged unless the Head is currently <em>Broken</em> or <em>Destroyed</em>.</p>'
                },
                {
                    name: 'Weak Point',
                    form: 'passive',
                    img: I.weak,
                    text: '<p>The underbelly of the Torso has a weak point. When this segment marks HP from an attack within Melee range while the Head is <em>Broken</em> or <em>Destroyed</em>, it must mark an additional HP.</p>'
                }
            ]
        },
        {
            name: 'Foreleg',
            quantity: 2,
            adjacent: ['torso', 'foreleg'],
            difficulty: 14,
            hp: 3,
            attack: { name: 'Stomp', range: 'veryClose', bonus: 1, damage: '2d10+8', img: I.stomp },
            slots: [
                { label: 'Left Foreleg', x: 3, y: 5, w: 2, h: 3 },
                { label: 'Right Foreleg', x: 5, y: 5, w: 2, h: 3 }
            ],
            features: [
                { name: 'Massive Hoof', form: 'passive', img: I.hoof, text: '<p>This segment’s standard attack is made with advantage and can target a group.</p>' },
                {
                    name: 'Shake the Earth',
                    form: 'action',
                    img: I.quake,
                    text: '<p>Daktadae rears up on their hind legs and slams down, creating a shockwave that knocks back all PCs within Very Close range that aren’t on Daktadae back to Close range and <em>Rattles</em> them until their next roll with Hope. While Rattled, the PC has disadvantage on reaction rolls.</p>',
                    act: { type: 'effect', range: 'veryClose', area: 'veryClose', effect: { name: 'Rattled', statuses: ['dhcoRattled'], img: I.quake } }
                },
                collapseLegs('Foreleg', 'Forelegs')
            ]
        },
        {
            name: 'Hindleg',
            quantity: 2,
            adjacent: ['torso', 'hindleg'],
            difficulty: 14,
            hp: 3,
            attack: { name: 'Stomp', range: 'veryClose', bonus: 1, damage: '2d10+8', img: I.stomp },
            slots: [
                { label: 'Left Hindleg', x: 7, y: 5, w: 2, h: 3 },
                { label: 'Right Hindleg', x: 9, y: 5, w: 2, h: 3 }
            ],
            features: [
                { name: 'Massive Hoof', form: 'passive', img: I.hoof, text: '<p>This segment’s standard attack is made with advantage and can target a group.</p>' },
                {
                    name: 'Backward Kick',
                    form: 'action',
                    img: I.kick,
                    text: '<p>All targets within Very Close range behind Daktadae must succeed on an Agility Reaction Roll or take <strong>2d8+10</strong> physical damage.</p>',
                    act: { type: 'save', save: 'agility', damage: '2d8+10', range: 'veryClose', area: 'veryClose' }
                },
                collapseLegs('Hindleg', 'Hindlegs')
            ]
        }
    ]
};

/* ------------------------------------------------------------------ */
/*  Tier 3: Poy, Sky Skimmer of the Dust Sea                          */
/* ------------------------------------------------------------------ */

const cascade = (n, word) => ({ name: 'Cascade', form: 'reaction', img: I.cascade, text: `<p>When this segment is <em>Destroyed</em>, the Neck must mark ${word ?? n} HP.</p>` });

const POY = {
    key: 'poy',
    name: 'Poy, Sky Skimmer of the Dust Sea',
    short: 'Poy',
    tier: 3,
    img: ART.poy,
    description: '<p>This massive shoebill stork is formed from the dust of the Drylands and traps enemies in their cavernous beak.</p>',
    motives: 'Corral, intimidate, maintain distance',
    size: '220 ft. long, 160 ft. wingspan',
    thresholds: [25, 48],
    stress: 6,
    experiences: [
        ['Attack From Above', 3],
        ['Huge', 3],
        ['Maneuver', 2]
    ],
    features: [
        {
            name: 'Flying',
            form: 'passive',
            img: I.flying,
            text: '<p>Poy can fly unless one of their Wings is <em>Destroyed</em>. While Poy is flying, each segment’s Difficulty gains a +2 bonus against action rolls made by PCs who aren’t on Poy.</p>',
            rule: { type: 'flying', bonus: 2, groundedBy: 'wing' }
        },
        {
            name: 'Strong Winds',
            form: 'passive',
            img: I.wind,
            text: '<p>While Poy is flying, no other flying creature can come within Close range of Poy without being blown backward by their powerful wings.</p>'
        },
        {
            name: 'Fall Off',
            form: 'reaction',
            img: I.fall,
            text: '<p>When a PC falls off Poy while the colossus is flying, they take <strong>3d20+6</strong> physical damage if they hit the ground.</p>',
            rule: { type: 'fallDamage', damage: '3d20+6', whileFlying: true },
            act: { type: 'damage', damage: '3d20+6' }
        },
        F.colossalPower('Poy')
    ],
    segments: [
        {
            name: 'Head',
            adjacent: ['neck'],
            difficulty: 16,
            hp: 5,
            ground: false,
            attack: { name: 'Screech', range: 'veryFar', bonus: 3, damage: '3d8+2', dtype: 'magical', img: I.screech },
            slots: [{ label: 'Head', x: 0, y: 4, w: 2, h: 2 }],
            features: [
                {
                    name: 'Bill Trap',
                    form: 'action',
                    img: I.bill,
                    text: '<p><strong>Spend a Fear</strong> to make an attack against a target on Poy. On a success, the target takes <strong>3d6+6</strong> physical damage and is <em>Trapped</em> inside Poy’s bill until the Head takes Major or greater damage. Poy’s damage thresholds are doubled against damage dealt by Trapped targets.</p>',
                    act: { type: 'attack', cost: { fear: 1 }, damage: '3d6+6', range: 'far', effect: { name: 'Trapped', statuses: ['dhcoTrapped'], img: I.bill } }
                },
                cascade(3)
            ]
        },
        {
            name: 'Neck',
            adjacent: ['head', 'body'],
            difficulty: 13,
            hp: 6,
            ground: false,
            slots: [{ label: 'Neck', x: 2, y: 4, w: 2, h: 2 }],
            features: [
                F.fatal(),
                { name: 'Protected', form: 'passive', img: I.protected, text: '<p>Poy’s Neck is protected by swirling magic. The Neck only marks HP from the “Cascade” feature.</p>' }
            ]
        },
        {
            name: 'Body',
            adjacent: ['wing', 'neck', 'tail', 'talon'],
            difficulty: 15,
            hp: 0,
            ground: false,
            slots: [{ label: 'Body', x: 4, y: 3, w: 4, h: 4 }],
            features: [
                { name: 'Invulnerable', form: 'passive', img: I.invulnerable, text: '<p>This segment is immune to all damage.</p>' },
                {
                    name: 'Dive-Bomb',
                    form: 'reaction',
                    img: I.dive,
                    text: '<p>When this segment is successfully attacked, Poy dive-bombs the attacker and all targets within Very Close range of them. The targets must make an Instinct Reaction Roll. Targets who fail take <strong>2d6+9</strong> physical damage. Targets who succeed can mark a Stress to climb onto one of Poy’s Talons.</p>',
                    act: { type: 'save', save: 'instinct', damage: '2d6+9', area: 'veryClose' }
                }
            ]
        },
        {
            name: 'Talon',
            quantity: 2,
            adjacent: ['body', 'tail'],
            difficulty: 14,
            hp: 5,
            attack: { name: 'Talon Strike', range: 'melee', bonus: 2, damage: '3d10+5', img: I.talon },
            slots: [
                { label: 'Left Talon', x: 8, y: 3, w: 2, h: 2 },
                { label: 'Right Talon', x: 8, y: 5, w: 2, h: 2 }
            ],
            features: [
                {
                    name: 'Pick Up',
                    form: 'action',
                    img: I.pickUp,
                    text: '<p><strong>Spend a Fear</strong> to make an attack against a target within Melee range. If there’s an additional target within Very Close range of them, you can spotlight both Talons at once and make an attack against both targets instead. On a success, Poy picks up their targets, flies straight upwards, and drops them. If a target hits the ground, they take <strong>5d20+4</strong> physical damage.</p>',
                    act: { type: 'attack', cost: { fear: 1 }, damage: '5d20+4', range: 'melee' }
                },
                cascade(1, 'a')
            ]
        },
        {
            name: 'Wing',
            quantity: 2,
            adjacent: ['body'],
            difficulty: 16,
            hp: 5,
            ground: false,
            attack: { name: 'Swipe', range: 'melee', bonus: 2, damage: '3d12+9', img: I.flap },
            slots: [
                { label: 'Left Wing', x: 4, y: 0, w: 4, h: 3 },
                { label: 'Right Wing', x: 4, y: 7, w: 4, h: 3 }
            ],
            features: [
                {
                    name: 'Dust Storm',
                    form: 'action',
                    img: I.dust,
                    text: '<p>Poy bats their wings, filling the air and making it much harder to see. Any attacks made by PCs beyond Melee range have disadvantage until the next GM turn.</p>'
                },
                {
                    name: 'Flap',
                    form: 'action',
                    img: I.flap,
                    text: '<p>Poy violently flaps a Wing. <strong>Mark a Stress</strong> to make an attack against all targets on the Wing. Targets Poy succeeds against take <strong>3d8+4</strong> physical damage and are knocked back onto the Tail. If the Tail is <em>Destroyed</em>, they instead fall off Poy.</p>',
                    act: { type: 'attack', cost: { stress: 1 }, damage: '3d8+4', range: 'melee', targets: null }
                }
            ]
        },
        {
            name: 'Tail',
            adjacent: ['body', 'talon'],
            difficulty: 15,
            hp: 3,
            ground: false,
            attack: { name: 'Whip', range: 'veryClose', bonus: 1, damage: '3d12+12', img: I.tail },
            slots: [{ label: 'Tail', x: 10, y: 3, w: 2, h: 4 }],
            features: [
                {
                    name: 'Sweep',
                    form: 'action',
                    img: I.tail,
                    text: '<p>Poy’s tail curls up and sweeps across another segment. <strong>Spend a Fear</strong> to choose another segment and make an attack against all targets on that segment. Targets Poy succeeds against take <strong>3d8+5</strong> physical damage and are knocked back to an adjacent segment of your choice.</p>',
                    act: { type: 'attack', cost: { fear: 1 }, damage: '3d8+5', range: 'far', targets: null }
                },
                cascade(2)
            ]
        }
    ]
};

/* ------------------------------------------------------------------ */
/*  Tier 4: Kelir, the Virulent Hate & Her Hundred, Hundred Children  */
/* ------------------------------------------------------------------ */

const KELIR = {
    key: 'kelir',
    name: 'Kelir, the Virulent Hate & Her Hundred, Hundred Children',
    short: 'Kelir',
    tier: 4,
    img: ART.kelir,
    description: '<p>A crablike, mountainous beast whose children scurry in and around her, bringing food as tribute.</p>',
    motives: 'Consume, ravage, swarm',
    size: '275 ft. tall, 150 ft. wide',
    thresholds: [30, 65],
    stress: 6,
    experiences: [
        ['Contempt', 2],
        ['Huge', 4],
        ['Sense Movement', 4]
    ],
    features: [
        {
            name: 'Brood Attack',
            form: 'action',
            img: I.brood,
            text: '<p>Spotlight any segment to make an attack with a +6 attack modifier against a PC on that segment as Kelir’s hundred, hundred children swarm the target with their pincers. On a success, deal <strong>4d8</strong> physical damage.</p>',
            act: { type: 'attack', bonus: 6, damage: '4d8', range: 'melee' }
        },
        {
            name: 'Swatting Pests',
            form: 'reaction',
            img: I.swat,
            text: '<p>When Kelir is attacked by a flying target within Far range, you can make a Pincer (Claws) standard attack against the attacker. On a success, add a d20 to the damage roll and the target is knocked to the ground within Far range.</p>'
        },
        F.colossalPower('Kelir')
    ],
    segments: [
        {
            name: 'Head',
            adjacent: ['shell'],
            difficulty: 18,
            hp: 4,
            ground: false,
            attack: { name: 'Eye Beams', range: 'close', bonus: 4, damage: '4d6+6', dtype: 'magical', img: I.eyes },
            slots: [{ label: 'Head', x: 4, y: 0, w: 4, h: 2 }],
            features: [
                F.strike('Very Close', 'Head'),
                {
                    name: 'Hateful Gaze',
                    form: 'action',
                    img: I.gaze,
                    text: '<p>All targets within Far range that Kelir can see must succeed on a Presence Reaction Roll or mark <strong>1d6</strong> Stress as Kelir’s hate tries to consume their mind.</p>',
                    act: { type: 'save', save: 'presence', range: 'far', area: 'far', stress: '1d6' }
                }
            ]
        },
        {
            name: 'Shell',
            adjacent: ['head', 'leg', 'claw', 'body-cavity'],
            difficulty: 16,
            hp: 6,
            ground: false,
            slots: [{ label: 'Shell', x: 3, y: 2, w: 6, h: 3 }],
            features: [
                F.armored('Shell'),
                {
                    name: 'Contagious Fury',
                    form: 'action',
                    img: I.fury,
                    text: '<p>All PCs in front of the Head within Far range replace their Hope Die with a d8 the next time they make an action roll as they struggle to keep Kelir’s hatred from consuming them.</p>'
                }
            ]
        },
        {
            name: 'Body Cavity',
            adjacent: ['shell'],
            difficulty: 17,
            hp: 6,
            ground: false,
            slots: [{ label: 'Body Cavity', x: 4, y: 5, w: 4, h: 2 }],
            features: [
                { ...F.fatal(), text: '<p>If this segment is <em>Destroyed</em>, Kelir is defeated.</p>' },
                {
                    name: 'Hateful Heart',
                    form: 'passive',
                    img: I.heart,
                    text: '<p>Kelir’s heart is suspended within the body cavity, connected by thick veins and arteries. The Body Cavity is immune to damage unless her heart is the target of a successful attack. The heart can only be attacked from Far or greater range, or a PC must succeed on an Agility Roll while inside the Body Cavity to reach the heart to make an attack against it within Melee range.</p>'
                },
                {
                    name: 'Grab and Rend',
                    form: 'action',
                    img: I.rend,
                    text: '<p>Make an attack using Kelir’s “Brood Attack” action against a target in the Body Cavity. On a success, <strong>spend a Fear</strong> to deal double damage and <em>Restrain</em> the target until they’re freed with a successful Strength Roll.</p>',
                    act: { type: 'attack', bonus: 6, cost: { fear: 1 }, damage: '8d8', range: 'melee', effect: { name: 'Rent', statuses: ['restrained'], img: I.rend } }
                },
                {
                    name: 'Protective Swarm',
                    form: 'reaction',
                    img: I.swarm,
                    text: '<p>Kelir’s Body Cavity is filled with her children, who protect her heart. A PC who makes an action roll in the Body Cavity must mark a Stress as they fight off Kelir’s children and their shearing pincers.</p>',
                    rule: { type: 'riderStress', stress: 1 }
                }
            ]
        },
        {
            name: 'Claw',
            quantity: 2,
            adjacent: ['shell'],
            difficulty: 15,
            hp: 5,
            attack: { name: 'Pincer', range: 'veryClose', bonus: 5, damage: '3d20+8', img: I.pincer },
            slots: [
                { label: 'Left Claw', x: 0, y: 0, w: 4, h: 2 },
                { label: 'Right Claw', x: 8, y: 0, w: 4, h: 2 }
            ],
            features: [
                F.strike('Very Close', 'Claws'),
                {
                    name: 'Sever Hope',
                    form: 'action',
                    img: I.sever,
                    text: '<p>Make a standard attack against a PC. On a success, <strong>mark a Stress</strong> to cause the target to lose <strong>1d4</strong> Hope. Gain as many Fear as the Hope lost.</p>',
                    act: { type: 'attack', cost: { stress: 1 }, range: 'veryClose', hope: '1d4' }
                },
                {
                    name: 'Grab & Hurl',
                    form: 'action',
                    img: I.hurl,
                    text: '<p>Make a standard attack against a target. On a success, instead of dealing damage, hurl the target within Far range in any direction. They must succeed on an Agility Reaction Roll or suffer <strong>3d20</strong> physical damage from the fall.</p>',
                    act: { type: 'attack', range: 'veryClose' }
                }
            ]
        },
        {
            name: 'Leg',
            quantity: 4,
            adjacent: ['shell'],
            difficulty: 15,
            hp: 3,
            attack: { name: 'Stomp', range: 'veryClose', bonus: 4, damage: '4d10+6', img: I.stomp },
            slots: [
                { label: 'Front Left Leg', x: 0, y: 2, w: 3, h: 2 },
                { label: 'Front Right Leg', x: 9, y: 2, w: 3, h: 2 },
                { label: 'Rear Left Leg', x: 0, y: 4, w: 3, h: 2 },
                { label: 'Rear Right Leg', x: 9, y: 4, w: 3, h: 2 }
            ],
            features: [
                { name: 'Climbing (−2)', form: 'passive', img: I.climb, text: '<p>An action roll made to climb on the leg gains a −2 penalty to its Difficulty.</p>' },
                {
                    name: 'Destructive Scuttle',
                    form: 'action',
                    img: I.scuttle,
                    text: '<p><strong>Mark a Stress</strong> to move up to Far range in any direction. All creatures in that path must make an Agility Reaction Roll. Targets who fail take <strong>4d10+6</strong> physical damage and must mark a Stress. Targets who succeed mark a Stress. Kelir can’t use this action if she is <em>Collapsed</em>.</p>',
                    rule: { type: 'notWhileCollapsed' },
                    act: { type: 'save', save: 'agility', cost: { stress: 1 }, damage: '4d10+6', range: 'far' }
                },
                {
                    name: 'Full Collapse',
                    form: 'reaction',
                    img: I.collapse,
                    text: '<p>Once three Legs are <em>Destroyed</em>, Kelir <em>Collapses</em> and PCs can climb on the Shell and Head from the ground.</p>'
                }
            ]
        }
    ]
};

export const COLOSSI = [IKERI, DAKTADAE, POY, KELIR];
