// Shared pre-flop range engine used by simulator.js and holdem.js

// ===== HAND STRENGTH RANKINGS =====
// All 169 starting hands, strongest first. A hand's position in a list
// (as a fraction of 169) is compared against scenario thresholds below.

// Playability order, used when stacks are deep enough to see flops. Suited
// connectors and wheel aces rank above weak offsuit broadways here.
const PLAY_RANKING = [
  "AA", "KK", "QQ", "AKs", "JJ", "AKo", "AQs", "TT", "AJs", "KQs", "AQo", "ATs", "99", "KJs",
  "QJs", "KTs", "A9s", "JTs", "88", "QTs", "AJo", "A5s", "A8s", "KQo", "A4s", "T9s", "77", "A7s",
  "K9s", "A3s", "A6s", "Q9s", "J9s", "ATo", "A2s", "98s", "66", "KJo", "T8s", "QJo", "K8s", "87s",
  "55", "J8s", "97s", "Q8s", "KTo", "76s", "44", "QTo", "K7s", "JTo", "65s", "86s", "T7s", "33",
  "54s", "K6s", "A9o", "22", "Q7s", "J7s", "K5s", "75s", "96s", "K4s", "Q6s", "64s", "K3s", "85s",
  "K2s", "Q5s", "J6s", "53s", "T6s", "A8o", "74s", "Q4s", "K9o", "43s", "J5s", "95s", "Q3s", "63s",
  "A7o", "Q9o", "Q2s", "J4s", "T9o", "84s", "J3s", "52s", "A6o", "J9o", "94s", "J2s", "73s", "T5s",
  "A5o", "42s", "62s", "T8o", "K8o", "A4o", "T4s", "93s", "32s", "83s", "A3o", "T3s", "98o", "K7o",
  "72s", "92s", "T2s", "Q8o", "A2o", "82s", "J8o", "K6o", "87o", "K5o", "97o", "76o", "K4o", "T7o",
  "86o", "Q7o", "K3o", "J7o", "65o", "K2o", "Q6o", "75o", "96o", "54o", "Q5o", "64o", "Q4o", "J6o",
  "85o", "Q3o", "T6o", "53o", "74o", "Q2o", "95o", "J5o", "43o", "63o", "J4o", "84o", "J3o", "94o",
  "52o", "73o", "J2o", "T5o", "42o", "62o", "T4o", "93o", "32o", "83o", "T3o", "72o", "92o", "T2o",
  "82o"
];

// All-in equity order (vs a random hand), used for short-stack push/fold.
// Once the money's going in preflop, raw showdown equity is what matters,
// so offsuit high cards rank well above suited junk.
const SHOVE_RANKING = [
  "AA", "KK", "QQ", "JJ", "TT", "99", "88", "AKs", "77", "AQs", "AJs", "AKo", "ATs", "AQo",
  "AJo", "KQs", "66", "A9s", "ATo", "KJs", "A8s", "KTs", "KQo", "A7s", "A9o", "KJo", "55", "QJs",
  "K9s", "A5s", "A6s", "A8o", "KTo", "QTs", "A4s", "A7o", "K8s", "A3s", "QJo", "K9o", "A5o", "A6o",
  "Q9s", "K7s", "JTs", "A2s", "QTo", "44", "A4o", "K6s", "K8o", "Q8s", "A3o", "K5s", "J9s", "Q9o",
  "JTo", "K7o", "A2o", "K4s", "Q7s", "K6o", "K3s", "T9s", "J8s", "33", "Q6s", "Q8o", "K5o", "J9o",
  "K2s", "Q5s", "T8s", "K4o", "J7s", "Q4s", "Q7o", "T9o", "J8o", "K3o", "22", "Q3s", "98s", "T7s",
  "J6s", "K2o", "Q2s", "Q6o", "J5s", "T8o", "J7o", "Q5o", "T6s", "97s", "J4s", "87s", "Q4o", "98o",
  "J3s", "T7o", "96s", "J6o", "Q3o", "T5s", "J2s", "86s", "76s", "J5o", "T4s", "Q2o", "97o", "95s",
  "T6o", "J4o", "T3s", "85s", "87o", "65s", "T2s", "J3o", "96o", "75s", "94s", "86o", "T5o", "J2o",
  "54s", "84s", "93s", "76o", "95o", "T4o", "64s", "74s", "85o", "92s", "65o", "T3o", "83s", "53s",
  "75o", "94o", "82s", "63s", "T2o", "54o", "84o", "93o", "43s", "73s", "64o", "74o", "92o", "52s",
  "62s", "83o", "53o", "42s", "63o", "82o", "73o", "32s", "43o", "72s", "52o", "42o", "62o", "32o",
  "72o"
];

function indexRanking(list) {
  var index = {};
  list.forEach(function (hand, i) { index[hand] = i; });
  return index;
}

const PLAY_INDEX = indexRanking(PLAY_RANKING);
const SHOVE_INDEX = indexRanking(SHOVE_RANKING);

// Fraction of all hands that are at least this strong (0.006 for AA, 1.0 for the worst hand)
// Each hand's share of all 1,326 two-card combos, counting it and every stronger hand.
// Pairs are 6 combos, suited hands 4, offsuit hands 12, so ranges match real-world charts.
function cumulativeShare(list) {
  var share = {};
  var total = 0;
  list.forEach(function (hand) {
    total += hand.length === 2 ? 6 : (hand[2] === "s" ? 4 : 12);
    share[hand] = total / 1326;
  });
  return share;
}

const PLAY_SHARE = cumulativeShare(PLAY_RANKING);
const SHOVE_SHARE = cumulativeShare(SHOVE_RANKING);

// Fraction of all starting hands at least this strong (0.0045 for AA, 1.0 for the worst hand)
function handPercentile(hand, shoving) {
  return (shoving ? SHOVE_SHARE : PLAY_SHARE)[hand];
}

// ===== TABLE SETUP =====

const POSITIONS = ["UTG", "UTG+1", "UTG+2", "LJ", "HJ", "CO", "BTN", "SB", "BB"];

const POSITION_GROUPS = {
  early: ["UTG", "UTG+1", "UTG+2"],
  middle: ["LJ", "HJ"],
  late: ["CO", "BTN"],
  blinds: ["SB", "BB"]
};

function positionGroup(pos) {
  for (var group in POSITION_GROUPS) {
    if (POSITION_GROUPS[group].includes(pos)) return group;
  }
}

// A Small Blind open is as wide as a late-position open, so treat it that way
function openerGroup(pos) {
  var group = positionGroup(pos);
  return group === "blinds" ? "late" : group;
}

// Baseline raise-first-in frequency per position, 100bb cash game
const OPEN_PCT = {
  "UTG": 0.15, "UTG+1": 0.17, "UTG+2": 0.19, "LJ": 0.22,
  "HJ": 0.26, "CO": 0.31, "BTN": 0.45, "SB": 0.42
};

// Open-shove frequency per position at ~12bb
const SHOVE_PCT = {
  "UTG": 0.14, "UTG+1": 0.16, "UTG+2": 0.18, "LJ": 0.21,
  "HJ": 0.25, "CO": 0.30, "BTN": 0.42, "SB": 0.55
};

// Facing an open, baseline 3-bet and flat-call frequencies by the opener's position group
const VS_OPEN_PCT = {
  early:  { threeBet: 0.04, call: 0.06 },
  middle: { threeBet: 0.06, call: 0.09 },
  late:   { threeBet: 0.09, call: 0.13 }
};

// Short stack facing an open: jam-or-fold, with a small BB calling band
const VS_OPEN_SHORT_PCT = {
  early:  { jam: 0.07 },
  middle: { jam: 0.11 },
  late:   { jam: 0.18 }
};

// How the hero's own position shifts their response to an open
const HERO_VS_OPEN_MOD = {
  early:  { threeBet: 1.0, call: 0.8 },
  middle: { threeBet: 1.0, call: 1.0 },
  late:   { threeBet: 1.0, call: 1.3 },
  SB:     { threeBet: 1.2, call: 0.5 },
  BB:     { threeBet: 1.1, call: 3.0 }
};

// ===== SCENARIO DIMENSIONS =====

const GAME_STAGES = {
  cash:  { label: "Cash Game",            open: 1.0,  threeBet: 1.0,  call: 1.0,  shove: 1.0,  callJam: 1.0 },
  early: { label: "Tournament · Early",   open: 1.0,  threeBet: 1.0,  call: 1.0,  shove: 1.0,  callJam: 1.0 },
  mid:   { label: "Tournament · Middle",  open: 1.15, threeBet: 1.05, call: 1.15, shove: 1.1,  callJam: 1.0 },
  late:  { label: "Tournament · Bubble",  open: 1.1,  threeBet: 0.9,  call: 0.7,  shove: 1.05, callJam: 0.8 },
  final: { label: "Final Table",          open: 1.0,  threeBet: 0.85, call: 0.6,  shove: 1.0,  callJam: 0.7 }
};

const STACK_DEPTHS = {
  short: { label: "Short",  min: 8,   max: 15,  open: 1.0, threeBet: 1.0, call: 0.0 },
  mid:   { label: "Medium", min: 25,  max: 40,  open: 0.9, threeBet: 1.0, call: 0.55 },
  deep:  { label: "Deep",   min: 100, max: 150, open: 1.0, threeBet: 1.0, call: 1.0 }
};

// Realistic stack depths for each stage when the user leaves it on random
const STAGE_STACKS = {
  cash:  ["deep", "deep", "mid"],
  early: ["deep"],
  mid:   ["mid", "mid", "deep"],
  late:  ["short", "mid"],
  final: ["short", "short", "mid"]
};

const STAGE_NOTES = {
  cash:  "No ICM pressure, so play for pure chip EV.",
  early: "Deep stacks and no antes yet — play close to a cash game.",
  mid:   "Antes are in: there's more dead money, so open and defend a bit wider.",
  late:  "Bubble pressure: avoid marginal calls that risk your tournament life, but keep stealing.",
  final: "ICM is heavy at the final table — fold marginal hands facing aggression, especially vs big stacks."
};

// ===== RANDOM HELPERS =====

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function randomInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

// ===== DEALING =====

const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"];
const SUITS = [
  { sym: "♠", color: "black", name: "spades" },
  { sym: "♥", color: "red",   name: "hearts" },
  { sym: "♦", color: "red",   name: "diamonds" },
  { sym: "♣", color: "black", name: "clubs" }
];

function dealHoleCards() {
  var first = { rank: randomInt(0, 12), suit: randomInt(0, 3) };
  var second;
  do {
    second = { rank: randomInt(0, 12), suit: randomInt(0, 3) };
  } while (second.rank === first.rank && second.suit === first.suit);
  if (second.rank > first.rank) return [second, first];
  return [first, second];
}

// How a rank is printed on a card face: a real deck says 10, shorthand like QTs keeps T
function faceRank(rank) {
  return RANKS[rank] === "T" ? "10" : RANKS[rank];
}

// Convert two cards into chart notation like "AKs", "T9o", or "77"
function handNotation(cards) {
  var high = RANKS[cards[0].rank];
  var low = RANKS[cards[1].rank];
  if (cards[0].rank === cards[1].rank) return high + low;
  return high + low + (cards[0].suit === cards[1].suit ? "s" : "o");
}

// ===== SCENARIO GENERATION =====

function buildScenario(filters) {
  var stageKey = filters.stage === "random" ? pick(Object.keys(GAME_STAGES)) : filters.stage;
  var stackKey = filters.stack === "random" ? pick(STAGE_STACKS[stageKey]) : filters.stack;
  var stackBB = randomInt(STACK_DEPTHS[stackKey].min, STACK_DEPTHS[stackKey].max);

  var positionPool = filters.position === "random"
    ? POSITIONS
    : POSITION_GROUPS[filters.position];
  var hero = pick(positionPool);

  var spot = filters.spot;
  if (spot === "random") spot = Math.random() < 0.5 ? "unopened" : "facingRaise";
  // UTG can never face a raise, and BB can never be first in
  if (hero === "UTG") spot = "unopened";
  if (hero === "BB") spot = "facingRaise";

  var opener = null;
  if (spot === "facingRaise") {
    opener = pick(POSITIONS.slice(0, POSITIONS.indexOf(hero)));
  }

  var scenario = {
    stage: stageKey,
    stack: stackKey,
    stackBB: stackBB,
    hero: hero,
    spot: spot,
    opener: opener
  };
  scenario.cards = dealHand(scenario, filters.hands === "tough");
  scenario.hand = handNotation(scenario.cards);
  return scenario;
}

// Most random hands are easy folds. In "tough spots" mode, usually redeal
// until the hand lands near one of the scenario's decision thresholds.
function dealHand(scenario, tough) {
  var cards = dealHoleCards();
  if (!tough || Math.random() > 0.75) return cards;
  for (var i = 0; i < 40; i++) {
    var hand = handNotation(cards);
    var p = handPercentile(hand, scenario.stack === "short");
    var lines = getRecommendation(Object.assign({}, scenario, { cards: cards, hand: hand })).lines;
    var nearLine = lines.some(function (line) { return Math.abs(p - line) <= 0.1; });
    if (nearLine) return cards;
    cards = dealHoleCards();
  }
  return cards;
}

// ===== STRATEGY ENGINE =====

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function pct(value) {
  return Math.round(value * 100) + "%";
}

function withArticle(word) {
  return (/^[aeiou]/.test(word) ? "an " : "a ") + word;
}

function getRecommendation(s) {
  var stage = GAME_STAGES[s.stage];
  var depth = STACK_DEPTHS[s.stack];
  var p = handPercentile(s.hand, s.stack === "short");
  var top = "top " + pct(p);

  if (s.stack === "short") {
    // Push/fold territory: shoving ranges widen as the stack shrinks
    var stackFactor = clamp(12 / s.stackBB, 0.8, 1.4);

    if (s.spot === "unopened") {
      var shoveLine = clamp(SHOVE_PCT[s.hero] * stackFactor * stage.shove, 0, 1);
      var action = p <= shoveLine ? "All-In" : "Fold";
      return {
        action: action,
        lines: [shoveLine],
        explanation: "With " + s.stackBB + "bb from the " + s.hero + " this is a push/fold spot. " +
          s.hand + " is in the " + top + " of hands and the " + s.hero + " shoving range here is about " +
          pct(shoveLine) + ", so " + (action === "All-In" ? "jam it in." : "it's a fold.") + " " + STAGE_NOTES[s.stage]
      };
    }

    var shortGroup = openerGroup(s.opener);
    var heroKey = s.hero === "SB" || s.hero === "BB" ? s.hero : positionGroup(s.hero);
    var jamLine = clamp(VS_OPEN_SHORT_PCT[shortGroup].jam * stackFactor * stage.callJam * HERO_VS_OPEN_MOD[heroKey].threeBet, 0, 1);
    var shortCallLine = s.hero === "BB" ? jamLine + 0.06 * stage.callJam : jamLine;

    var shortAction = p <= jamLine ? "All-In" : (p <= shortCallLine ? "Call" : "Fold");
    return {
      action: shortAction,
      lines: [jamLine, shortCallLine],
      explanation: "Facing a " + s.opener + " open with only " + s.stackBB + "bb, you can't flat and play postflop — it's jam or fold" +
        (s.hero === "BB" ? " (the BB can flat a few extra hands at a discount)" : "") + ". " +
        s.hand + " is in the " + top + " by all-in equity; the re-jam range vs " + withArticle(shortGroup) + "-position open is about " +
        pct(jamLine) + ". " + STAGE_NOTES[s.stage]
    };
  }

  if (s.spot === "unopened") {
    var openLine = clamp(OPEN_PCT[s.hero] * depth.open * stage.open, 0, 1);
    var openAction = p <= openLine ? "Raise" : "Fold";
    return {
      action: openAction,
      lines: [openLine],
      explanation: "Folded to you in the " + s.hero + " with " + s.stackBB + "bb. The " + s.hero + " opens roughly the " +
        pct(openLine) + " strongest hands in this spot and " + s.hand + " is in the " + top +
        (openAction === "Raise" ? ", so open-raise." : ", so it doesn't make the cut.") + " " + STAGE_NOTES[s.stage]
    };
  }

  var group = openerGroup(s.opener);
  var heroModKey = s.hero === "SB" || s.hero === "BB" ? s.hero : positionGroup(s.hero);
  var mod = HERO_VS_OPEN_MOD[heroModKey];
  var threeBetLine = clamp(VS_OPEN_PCT[group].threeBet * mod.threeBet * depth.threeBet * stage.threeBet, 0, 1);
  var callBand = VS_OPEN_PCT[group].call * mod.call * depth.call * stage.call;
  var callLine = clamp(threeBetLine + callBand, 0, 1);

  var vsAction = p <= threeBetLine ? "3-Bet" : (p <= callLine ? "Call" : "Fold");
  var callText = callBand > 0.005
    ? " and flat-calls the next " + pct(callBand)
    : " and rarely flat-calls at this stack depth";
  return {
    action: vsAction,
    lines: [threeBetLine, callLine],
    explanation: "The " + s.opener + " raises and you're in the " + s.hero + " with " + s.stackBB + "bb. Against " +
      withArticle(group) + "-position open, the " + s.hero + " 3-bets about the top " + pct(threeBetLine) + callText + ". " +
      s.hand + " is in the " + top + ", so " + vsAction.toLowerCase() + ". " + STAGE_NOTES[s.stage]
  };
}

function actionChoices(s) {
  if (s.stack === "short") {
    return s.spot === "unopened" ? ["All-In", "Fold"] : ["All-In", "Call", "Fold"];
  }
  return s.spot === "unopened" ? ["Raise", "Fold"] : ["3-Bet", "Call", "Fold"];
}
