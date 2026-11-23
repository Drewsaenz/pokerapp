// Practice table: hero plays full hands against 8 bots.
// Bot decisions live in bots.js; this file runs the table, the hand and the UI.

// ===== TABLE CONFIG =====

const SEAT_COUNT = 9;
const HERO_SEAT = 0;
const POS_BY_OFFSET = ["BTN", "SB", "BB", "UTG", "UTG+1", "UTG+2", "LJ", "HJ", "CO"];
const PREFLOP_ORDER = ["UTG", "UTG+1", "UTG+2", "LJ", "HJ", "CO", "BTN", "SB", "BB"];
const POSTFLOP_ORDER = ["SB", "BB", "UTG", "UTG+1", "UTG+2", "LJ", "HJ", "CO", "BTN"];
const STREET_LABELS = { preflop: "Pre-flop", flop: "Flop", turn: "Turn", river: "River" };

const BOT_NAMES = [
  "Rosa", "Dmitri", "Kenji", "Amara", "Theo", "Lucia", "Marcus", "Priya", "Sven", "Ines",
  "Olu", "Hana", "Rafa", "Mei", "Jonah", "Zara", "Tomas", "Leni", "Bo", "Carmen"
];

const CASH_BLINDS = { sb: 1, bb: 2, ante: 0 };
const TOURNEY_START = 20000;
// Big-blind ante from level 4
const TOURNEY_LEVELS = [
  { sb: 100, bb: 200, ante: 0 }, { sb: 150, bb: 300, ante: 0 }, { sb: 200, bb: 400, ante: 0 },
  { sb: 250, bb: 500, ante: 500 }, { sb: 300, bb: 600, ante: 600 }, { sb: 400, bb: 800, ante: 800 },
  { sb: 500, bb: 1000, ante: 1000 }, { sb: 600, bb: 1200, ante: 1200 }, { sb: 800, bb: 1600, ante: 1600 },
  { sb: 1000, bb: 2000, ante: 2000 }, { sb: 1500, bb: 3000, ante: 3000 }, { sb: 2000, bb: 4000, ante: 4000 }
];

const table = {
  settings: null,
  players: [],
  button: 0,
  handNo: 0,
  level: 0,
  handsAtLevel: 0,
  hand: null,
  viewing: null,
  sessionHands: [],
  running: false,
  over: false,
  topUps: 0,
  usedNames: new Set(),
  notice: ""
};

let pendingHero = null;

// ===== HELPERS =====

function sleep(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

function $(id) {
  return document.getElementById(id);
}

function el(tag, className, text) {
  var node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function fmtBB(chips, bb) {
  var v = Math.round((chips / bb) * 10) / 10;
  return (Number.isInteger(v) ? String(v) : v.toFixed(1)) + "bb";
}

function fmtChips(chips) {
  var money = table.settings && table.settings.mode === "cash";
  return (money ? "$" : "") + chips.toLocaleString("en-US");
}

function signedBB(chips, bb) {
  if (chips === 0) return "±0bb";
  return (chips > 0 ? "+" : "−") + fmtBB(Math.abs(chips), bb);
}

function cardText(card, ascii) {
  var suit = ascii ? ["s", "h", "d", "c"][card.suit] : SUITS[card.suit].sym;
  return RANKS[card.rank] + suit;
}

function cardsText(cards, ascii) {
  return cards.map(function (c) { return cardText(c, ascii); }).join(" ");
}

function players() {
  return table.players;
}

function positionOf(seat) {
  return POS_BY_OFFSET[(seat - table.button + SEAT_COUNT) % SEAT_COUNT];
}

function seatOfPos(pos) {
  return (table.button + POS_BY_OFFSET.indexOf(pos)) % SEAT_COUNT;
}

// Antes are dead money: in the pot, but not part of anyone's bet
function potTotal() {
  var dead = table.hand ? table.hand.dead : 0;
  return players().reduce(function (sum, p) { return sum + p.total; }, dead);
}

function liveCount() {
  return players().filter(function (p) { return !p.folded; }).length;
}

function activeCount() {
  return players().filter(function (p) { return !p.folded && !p.allIn; }).length;
}

function canAct(p) {
  return !p.folded && !p.allIn && p.stack > 0;
}

function botDelay() {
  var hero = players()[HERO_SEAT];
  if (hero.folded) return 90;
  return table.settings.speed === "fast" ? 220 : 650;
}

// ===== DECK & HAND EVALUATION =====

function shuffledDeck() {
  var deck = [];
  for (var r = 0; r < 13; r++) for (var s = 0; s < 4; s++) deck.push({ rank: r, suit: s });
  for (var i = deck.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var t = deck[i]; deck[i] = deck[j]; deck[j] = t;
  }
  return deck;
}

const RANK_WORDS = ["Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Jack", "Queen", "King", "Ace"];
const RANK_PLURAL = ["Twos", "Threes", "Fours", "Fives", "Sixes", "Sevens", "Eights", "Nines", "Tens", "Jacks", "Queens", "Kings", "Aces"];

// Highest card of a 5-card straight in the set, or -1. Ace plays low in the wheel.
function straightHigh(rankSet) {
  for (var hi = 12; hi >= 3; hi--) {
    var ok = true;
    for (var k = 0; k < 5; k++) {
      var r = hi - k;
      if (!rankSet.has(r < 0 ? 12 : r)) { ok = false; break; }
    }
    if (ok) return hi;
  }
  return -1;
}

// Best hand from 3-7 cards: score is [category, tiebreakers...], compared left to right
function evaluateHand(cards) {
  var counts = new Array(13).fill(0);
  var bySuit = [[], [], [], []];
  cards.forEach(function (c) { counts[c.rank]++; bySuit[c.suit].push(c.rank); });
  var rankSet = new Set(cards.map(function (c) { return c.rank; }));
  var uniqueDesc = Array.from(rankSet).sort(function (a, b) { return b - a; });

  function kickers(exclude, n) {
    return uniqueDesc.filter(function (r) { return exclude.indexOf(r) === -1; }).slice(0, n);
  }
  function made(cat, ranks, name) {
    return { score: [cat].concat(ranks), name: name };
  }

  var flush = bySuit.find(function (s) { return s.length >= 5; });
  if (flush) {
    var sf = straightHigh(new Set(flush));
    if (sf >= 0) return made(8, [sf], "Straight Flush, " + RANK_WORDS[sf] + "-high");
  }

  var groups = [];
  for (var r = 12; r >= 0; r--) if (counts[r]) groups.push({ r: r, n: counts[r] });
  groups.sort(function (a, b) { return b.n - a.n || b.r - a.r; });

  if (groups[0].n === 4) {
    return made(7, [groups[0].r].concat(kickers([groups[0].r], 1)), "Four of a Kind, " + RANK_PLURAL[groups[0].r]);
  }
  if (groups[0].n === 3 && groups[1] && groups[1].n >= 2) {
    return made(6, [groups[0].r, groups[1].r],
      "Full House, " + RANK_PLURAL[groups[0].r] + " full of " + RANK_PLURAL[groups[1].r]);
  }
  if (flush) {
    var top = flush.slice().sort(function (a, b) { return b - a; }).slice(0, 5);
    return made(5, top, "Flush, " + RANK_WORDS[top[0]] + "-high");
  }
  var st = straightHigh(rankSet);
  if (st >= 0) return made(4, [st], "Straight, " + RANK_WORDS[st] + "-high");
  if (groups[0].n === 3) {
    return made(3, [groups[0].r].concat(kickers([groups[0].r], 2)), "Three of a Kind, " + RANK_PLURAL[groups[0].r]);
  }
  if (groups[0].n === 2 && groups[1] && groups[1].n === 2) {
    var hiPair = groups[0].r, loPair = groups[1].r;
    return made(2, [hiPair, loPair].concat(kickers([hiPair, loPair], 1)),
      "Two Pair, " + RANK_PLURAL[hiPair] + " and " + RANK_PLURAL[loPair]);
  }
  if (groups[0].n === 2) {
    return made(1, [groups[0].r].concat(kickers([groups[0].r], 3)), "Pair of " + RANK_PLURAL[groups[0].r]);
  }
  return made(0, kickers([], 5), "High Card, " + RANK_WORDS[uniqueDesc[0]]);
}

function compareScore(a, b) {
  for (var i = 0; i < Math.max(a.length, b.length); i++) {
    var d = (a[i] === undefined ? -1 : a[i]) - (b[i] === undefined ? -1 : b[i]);
    if (d !== 0) return d;
  }
  return 0;
}

// Split total contributions into a main pot and side pots by all-in level
function buildPots() {
  var ps = players();
  var levels = Array.from(new Set(ps.map(function (p) { return p.total; }).filter(function (t) { return t > 0; })))
    .sort(function (a, b) { return a - b; });
  var pots = [];
  var prev = 0;
  levels.forEach(function (lvl) {
    var amount = 0;
    ps.forEach(function (p) { amount += Math.min(p.total, lvl) - Math.min(p.total, prev); });
    var eligible = [];
    ps.forEach(function (p, seat) { if (!p.folded && p.total >= lvl) eligible.push(seat); });
    prev = lvl;
    var last = pots[pots.length - 1];
    if (!eligible.length && last) { last.amount += amount; return; }
    if (last && last.eligible.join() === eligible.join()) { last.amount += amount; return; }
    pots.push({ amount: amount, eligible: eligible });
  });
  // Dead money above every live player's contribution goes to the last contested pot
  for (var i = pots.length - 1; i > 0; i--) {
    if (!pots[i].eligible.length) { pots[i - 1].amount += pots[i].amount; pots.splice(i, 1); }
  }
  if (pots.length) pots[0].amount += table.hand.dead;
  return pots;
}

// ===== SETTINGS & SESSION =====

function readSettings() {
  return {
    mode: $("set-mode").value,
    cashDepth: parseInt($("set-depth").value, 10),
    levelLength: parseInt($("set-level").value, 10),
    speed: $("set-speed").value
  };
}

function syncSettingsVisibility() {
  var cash = $("set-mode").value === "cash";
  $("field-depth").hidden = !cash;
  $("field-level").hidden = cash;
}

function blinds() {
  if (table.settings.mode === "cash") return CASH_BLINDS;
  return TOURNEY_LEVELS[Math.min(table.level, TOURNEY_LEVELS.length - 1)];
}

function startingStack() {
  return table.settings.mode === "cash" ? table.settings.cashDepth * CASH_BLINDS.bb : TOURNEY_START;
}

function currentStage() {
  if (table.settings.mode === "cash") return "cash";
  if (table.level <= 2) return "early";
  if (table.level <= 6) return "mid";
  if (table.level <= 9) return "late";
  return "final";
}

function nextBotName() {
  var free = BOT_NAMES.filter(function (n) { return !table.usedNames.has(n); });
  if (!free.length) { table.usedNames.clear(); free = BOT_NAMES.slice(); }
  var name = pick(free);
  table.usedNames.add(name);
  return name;
}

function makePlayer(name, stack, isHero) {
  return {
    name: name, stack: stack, isHero: isHero, cards: [], folded: false, allIn: false,
    bet: 0, total: 0, startStack: stack, pos: "", lastAction: "", shown: false, won: 0,
    style: isHero ? null : randomStyle(), range: null, aggr: 0
  };
}

function newSession() {
  if (table.running) return;
  table.settings = readSettings();
  table.level = 0;
  table.handsAtLevel = 0;
  table.handNo = 0;
  table.sessionHands = [];
  table.over = false;
  table.topUps = 0;
  table.usedNames = new Set();
  table.notice = "";
  var start = startingStack();
  table.players = [];
  for (var i = 0; i < SEAT_COUNT; i++) {
    table.players.push(i === HERO_SEAT ? makePlayer("You", start, true) : makePlayer(nextBotName(), start, false));
  }
  table.button = randomInt(0, SEAT_COUNT - 1);
  $("session-review-out").replaceChildren();
  playHand();
}

// Reloads, replacements and blind levels between hands
function betweenHands() {
  var notes = [];
  var start = startingStack();
  var cash = table.settings.mode === "cash";
  var alive = players().filter(function (p) { return p.stack > 0; });
  var avg = alive.length ? Math.round(alive.reduce(function (s, p) { return s + p.stack; }, 0) / alive.length / 100) * 100 : start;

  players().forEach(function (p, seat) {
    if (p.isHero) return;
    if (cash && p.stack < start * 0.4) {
      notes.push(p.name + " reloads to " + fmtBB(start, CASH_BLINDS.bb) + ".");
      p.stack = start;
    } else if (!cash && p.stack === 0) {
      table.usedNames.delete(p.name);
      var fresh = makePlayer(nextBotName(), Math.max(avg, blinds().bb * 10), false);
      notes.push(p.name + " is out. " + fresh.name + " takes the seat.");
      table.players[seat] = fresh;
    }
  });

  if (!cash) {
    table.handsAtLevel += 1;
    if (table.handsAtLevel >= table.settings.levelLength) {
      table.level += 1;
      table.handsAtLevel = 0;
      var b = blinds();
      notes.push("Blinds up: " + b.sb + "/" + b.bb + (b.ante ? ", ante " + b.ante : "") + ".");
    }
  }
  table.button = (table.button + 1) % SEAT_COUNT;
  table.notice = notes.join(" ");
}

// ===== HAND FLOW =====

function post(seat, amount, label) {
  var p = players()[seat];
  var paid = Math.min(amount, p.stack);
  p.stack -= paid;
  p.bet += paid;
  p.total += paid;
  if (p.stack === 0) p.allIn = true;
  record({ street: "preflop", seat: seat, type: "post", label: label, to: p.bet, add: paid, allIn: p.allIn });
}

function postAnte(seat, amount) {
  var p = players()[seat];
  var paid = Math.min(amount, p.stack);
  p.stack -= paid;
  table.hand.dead += paid;
  if (p.stack === 0) p.allIn = true;
  record({ street: "preflop", seat: seat, type: "post", label: "ante", to: 0, add: paid, allIn: p.allIn });
}

function record(action) {
  var p = players()[action.seat];
  action.name = p ? p.name : "";
  action.pos = p ? p.pos : "";
  action.isHero = p ? p.isHero : false;
  table.hand.actions.push(action);
}

async function playHand() {
  if (table.running || table.over) return;
  table.running = true;
  pendingHero = null;

  var b = blinds();
  var deck = shuffledDeck();
  players().forEach(function (p, seat) {
    var a = deck.pop(), c = deck.pop();
    p.cards = a.rank >= c.rank ? [a, c] : [c, a];
    p.folded = false; p.allIn = false; p.bet = 0; p.total = 0;
    p.startStack = p.stack; p.pos = positionOf(seat); p.lastAction = ""; p.shown = false; p.won = 0;
    p.range = { pct: 1, shove: false }; p.aggr = 0;
  });

  var hero = players()[HERO_SEAT];
  table.hand = {
    no: ++table.handNo,
    mode: table.settings.mode,
    stage: currentStage(),
    level: table.level,
    sb: b.sb, bb: b.bb, ante: b.ante,
    deck: deck,
    board: [],
    dead: 0,
    actions: [],
    seats: players().map(function (p) { return { name: p.name, pos: p.pos, stack: p.stack, isHero: p.isHero, style: p.style }; }),
    pfAggressor: null,
    heroPos: hero.pos,
    heroCards: hero.cards.slice(),
    heroHand: handNotation(hero.cards),
    heroChart: null,
    heroFirst: null,
    vpip: false,
    results: [],
    showdown: [],
    heroNet: 0,
    notice: table.notice,
    review: null,
    done: false
  };
  table.viewing = table.hand;
  table.notice = "";

  if (b.ante) postAnte(seatOfPos("BB"), b.ante);
  post(seatOfPos("SB"), b.sb, "small blind");
  post(seatOfPos("BB"), b.bb, "big blind");
  renderAll();

  await bettingRound("preflop");

  var streets = [["flop", 3], ["turn", 1], ["river", 1]];
  for (var i = 0; i < streets.length; i++) {
    if (liveCount() <= 1) break;
    var street = streets[i][0];
    for (var k = 0; k < streets[i][1]; k++) table.hand.board.push(deck.pop());
    players().forEach(function (p) { p.bet = 0; if (!p.folded && !p.allIn) p.lastAction = ""; });
    table.hand.actions.push({ street: street, type: "street", board: table.hand.board.slice(), pot: potTotal() });
    renderAll();
    await sleep(activeCount() >= 2 ? botDelay() : Math.max(botDelay(), 700));
    if (activeCount() >= 2) await bettingRound(street);
  }

  settle();
  table.running = false;
  renderAll();
}

async function bettingRound(street) {
  var h = table.hand;
  var order = (street === "preflop" ? PREFLOP_ORDER : POSTFLOP_ORDER).map(seatOfPos);
  var currentBet = street === "preflop" ? h.bb : 0;
  var minRaise = h.bb;
  var raises = 0;
  var lastRaiser = null;
  var raiserAllIn = false;
  var pending = new Set(order.filter(function (s) { return canAct(players()[s]); }));
  var ptr = 0;

  while (pending.size && liveCount() > 1) {
    var seat = null;
    for (var k = 0; k < order.length; k++) {
      var candidate = order[(ptr + k) % order.length];
      if (pending.has(candidate)) { seat = candidate; ptr = (ptr + k + 1) % order.length; break; }
    }
    var p = players()[seat];
    var toCall = Math.max(0, currentBet - p.bet);
    pending.delete(seat);
    if (activeCount() === 1 && toCall === 0) continue;

    var ctx = {
      street: street, seat: seat, toCall: toCall, currentBet: currentBet, minRaise: minRaise,
      raises: raises, lastRaiser: lastRaiser, raiserAllIn: raiserAllIn, pot: potTotal(), bb: h.bb
    };
    table.acting = seat;
    renderAll();

    var decision;
    if (p.isHero) {
      decision = await heroAct(ctx);
    } else {
      await sleep(botDelay());
      decision = street === "preflop" ? botPreflop(seat, ctx) : botPostflop(seat, ctx);
    }

    var raised = applyDecision(seat, decision, ctx);
    if (raised) {
      var raiseSize = p.bet - currentBet;
      if (raiseSize >= minRaise) minRaise = raiseSize;
      currentBet = p.bet;
      raises += 1;
      lastRaiser = seat;
      raiserAllIn = p.allIn;
      pending = new Set(order.filter(function (s) { return s !== seat && canAct(players()[s]); }));
    }
  }
  table.acting = null;
}

// Applies a decision, records it, and returns true if it raised the bet
function applyDecision(seat, d, ctx) {
  var p = players()[seat];
  var h = table.hand;
  var heroFirst = p.isHero && ctx.street === "preflop" && h.heroFirst === null;
  var type = d.type;
  if (type === "check" && ctx.toCall > 0) type = "call";
  if (type === "call" && ctx.toCall === 0) type = "check";

  if (type === "fold") {
    p.folded = true;
    p.lastAction = "Fold";
    record({ street: ctx.street, seat: seat, type: "fold" });
    if (heroFirst) h.heroFirst = "Fold";
    return false;
  }
  if (type === "check") {
    p.lastAction = "Check";
    record({ street: ctx.street, seat: seat, type: "check" });
    if (heroFirst) h.heroFirst = "Check";
    return false;
  }

  var to = type === "call" ? ctx.currentBet : Math.min(d.to, p.stack + p.bet);
  if (type === "raise" && to <= ctx.currentBet) type = "call";
  if (type === "call") to = Math.min(ctx.currentBet, p.stack + p.bet);

  var add = to - p.bet;
  p.stack -= add;
  p.bet = to;
  p.total += add;
  if (p.stack === 0) p.allIn = true;
  if (p.isHero && ctx.street === "preflop") h.vpip = true;

  var kind = type === "call" ? "call" : (ctx.currentBet === 0 ? "bet" : "raise");
  p.lastAction = (kind === "call" ? "Call " : kind === "bet" ? "Bet " : "Raise ") + fmtBB(kind === "call" ? add : to, h.bb) +
    (p.allIn ? " · all-in" : "");
  record({ street: ctx.street, seat: seat, type: kind, to: to, add: add, allIn: p.allIn });
  if (ctx.street === "preflop") {
    updateRange(p, kind, ctx);
    if (kind !== "call") h.pfAggressor = seat;
  } else if (kind !== "call") {
    p.aggr += 1;
  }

  if (heroFirst) {
    if (kind === "call") h.heroFirst = "Call";
    else if (p.allIn && (h.heroChart && h.heroChart.stack === "short")) h.heroFirst = "All-In";
    else h.heroFirst = ctx.raises === 0 ? "Raise" : "3-Bet";
    h.heroFirstAllIn = p.allIn;
  }
  return kind !== "call";
}

function settle() {
  var h = table.hand;
  var ps = players();
  var live = [];
  ps.forEach(function (p, seat) { if (!p.folded) live.push(seat); });

  if (live.length === 1) {
    var winner = ps[live[0]];
    var pot = potTotal();
    winner.stack += pot;
    winner.won = pot;
    var uncalled = winner.total - Math.max.apply(null, ps.filter(function (p, s) { return s !== live[0]; }).map(function (p) { return p.total; }));
    h.results.push(winner.name + " wins the pot (" + fmtBB(pot - Math.max(0, uncalled), h.bb) + "), no showdown.");
  } else {
    while (h.board.length < 5) h.board.push(h.deck.pop());
    var hands = {};
    live.forEach(function (seat) {
      hands[seat] = evaluateHand(ps[seat].cards.concat(h.board));
      ps[seat].shown = true;
      h.showdown.push({ seat: seat, name: ps[seat].name, pos: ps[seat].pos, cards: ps[seat].cards.slice(), hand: hands[seat].name });
    });
    var pots = buildPots();
    pots.forEach(function (pot, i) {
      if (pot.eligible.length === 1) {
        ps[pot.eligible[0]].stack += pot.amount;
        ps[pot.eligible[0]].won += pot.amount;
        h.results.push(ps[pot.eligible[0]].name + " gets " + fmtBB(pot.amount, h.bb) + " uncalled returned.");
        return;
      }
      var best = null;
      var winners = [];
      pot.eligible.forEach(function (seat) {
        var cmp = best === null ? 1 : compareScore(hands[seat].score, best);
        if (cmp > 0) { best = hands[seat].score; winners = [seat]; }
        else if (cmp === 0) winners.push(seat);
      });
      var share = Math.floor(pot.amount / winners.length);
      var odd = pot.amount - share * winners.length;
      var orderedWinners = POSTFLOP_ORDER.map(seatOfPos).filter(function (s) { return winners.indexOf(s) !== -1; });
      orderedWinners.forEach(function (seat, idx) {
        var amt = share + (idx === 0 ? odd : 0);
        ps[seat].stack += amt;
        ps[seat].won += amt;
      });
      var potName = pots.length > 1 ? (i === 0 ? "the main pot" : "side pot " + i) : "the pot";
      var names = orderedWinners.map(function (s) { return ps[s].name; }).join(" and ");
      h.results.push(names + (winners.length > 1 ? " split " : " wins ") + potName + " (" + fmtBB(pot.amount, h.bb) + ") with " +
        hands[orderedWinners[0]].name + ".");
    });
  }

  var hero = ps[HERO_SEAT];
  h.heroNet = hero.stack - hero.startStack;
  h.finalStacks = ps.map(function (p) { return p.stack; });
  h.done = true;
  table.acting = null;
  table.sessionHands.unshift(h);

  if (table.settings.mode === "tournament" && hero.stack === 0) {
    table.over = true;
  } else {
    betweenHands();
  }
}

// ===== BOTS =====

function effectiveStack(seat) {
  var me = players()[seat];
  var mine = me.stack + me.bet;
  var biggestOther = 0;
  players().forEach(function (p, s) {
    if (s !== seat && !p.folded) biggestOther = Math.max(biggestOther, p.stack + p.bet);
  });
  return Math.min(mine, biggestOther);
}

function limperCount() {
  var bb = table.hand.bb;
  return players().filter(function (p) { return !p.folded && p.pos !== "BB" && p.bet >= bb; }).length;
}

// The chart scenario for a pre-flop spot, or null when the spot is outside what the chart covers
function preflopScenario(seat, ctx) {
  var p = players()[seat];
  var h = table.hand;
  if (ctx.raises > 1) return null;
  if (ctx.raises === 1 && (ctx.raiserAllIn || ctx.toCall >= 0.35 * (p.stack + p.bet))) return null;
  if (ctx.raises === 0 && p.pos === "BB") return null;
  var effBB = Math.max(1, Math.round(effectiveStack(seat) / h.bb));
  var scenario = {
    stage: h.stage,
    stack: effBB <= 18 ? "short" : (effBB <= 60 ? "mid" : "deep"),
    stackBB: effBB,
    hero: p.pos,
    spot: ctx.raises === 0 ? "unopened" : "facingRaise",
    opener: ctx.raises === 0 ? null : players()[ctx.lastRaiser].pos,
    cards: p.cards,
    hand: handNotation(p.cards)
  };
  return scenario;
}

function sizedRaise(seat, ctx, to) {
  var p = players()[seat];
  var maxTo = p.stack + p.bet;
  to = Math.round(Math.max(to, ctx.currentBet + ctx.minRaise));
  if (to >= 0.45 * maxTo) return { type: "raise", to: maxTo };
  return { type: "raise", to: to };
}

function botPreflop(seat, ctx) {
  var p = players()[seat];
  var bb = table.hand.bb;
  var hand = handNotation(p.cards);
  var pPlay = handPercentile(hand, false);
  var pShove = handPercentile(hand, true);
  var maxTo = p.stack + p.bet;

  if (ctx.raises === 0 && p.pos === "BB") {
    return pPlay <= 0.1 ? sizedRaise(seat, ctx, bb * (3.5 + limperCount())) : { type: "check" };
  }

  var sc = preflopScenario(seat, ctx);
  if (sc) {
    var rec = styledPreflop(seat, ctx, sc);
    if (rec === "All-In") return { type: "raise", to: maxTo };
    if (rec === "Call") return { type: "call" };
    if (rec === "Raise") return sizedRaise(seat, ctx, bb * ((sc.stack === "short" ? 2.1 : 2.5) + limperCount()));
    if (rec === "3-Bet") {
      var callers = players().filter(function (x, s) {
        return s !== ctx.lastRaiser && !x.folded && x.bet === ctx.currentBet;
      }).length;
      return sizedRaise(seat, ctx, ctx.currentBet * (3 + callers));
    }
    if (ctx.toCall === 0) return { type: "check" };
    if (ctx.raises === 0 && p.pos === "SB" && limperCount() > 0 && pPlay <= 0.35) return { type: "call" };
    return { type: "fold" };
  }

  // 3-bet pots, all-ins and big raises: continue on price, jam the very top
  if (pPlay <= 0.025) return { type: "raise", to: maxTo };
  var required = ctx.toCall / (ctx.pot + ctx.toCall);
  var continuePct = clamp((0.55 - required) * 0.45 * styleOf(p).call, 0.02, 0.35);
  if (pShove <= continuePct) return { type: "call" };
  return ctx.toCall === 0 ? { type: "check" } : { type: "fold" };
}

// ===== HERO =====

function heroAct(ctx) {
  var h = table.hand;
  if (ctx.street === "preflop" && h.heroChart === null) {
    var sc = preflopScenario(HERO_SEAT, ctx);
    if (sc) {
      var rec = getRecommendation(sc);
      h.heroChart = {
        action: rec.action,
        explanation: rec.explanation,
        stack: sc.stack,
        limpers: ctx.raises === 0 ? limperCount() : 0
      };
    } else {
      h.heroChart = { action: null, stack: null, reason: ctx.raises === 0 ? "a limped pot in the big blind" : "a re-raised or all-in pot" };
    }
  }
  return new Promise(function (resolve) {
    pendingHero = { ctx: ctx, resolve: resolve };
    renderControls();
  });
}

function heroDecide(decision) {
  if (!pendingHero) return;
  var resolve = pendingHero.resolve;
  pendingHero = null;
  renderControls();
  resolve(decision);
}

function raisePresets(ctx) {
  var hero = players()[HERO_SEAT];
  var bb = ctx.bb;
  var maxTo = hero.stack + hero.bet;
  var minTo = ctx.currentBet + ctx.minRaise;
  var list = [];
  if (ctx.street === "preflop") {
    if (ctx.raises === 0) {
      var limpers = limperCount();
      list.push({ label: "2.5bb", to: bb * (2.5 + limpers) });
      list.push({ label: "3bb", to: bb * (3 + limpers) });
    } else {
      list.push({ label: "3×", to: ctx.currentBet * 3 });
      list.push({ label: "4×", to: ctx.currentBet * 4 });
    }
  } else if (ctx.currentBet === 0) {
    [["⅓ pot", 1 / 3], ["½ pot", 0.5], ["¾ pot", 0.75], ["Pot", 1]].forEach(function (f) {
      list.push({ label: f[0], to: Math.max(bb, ctx.pot * f[1]) });
    });
  } else {
    list.push({ label: "2.5×", to: ctx.currentBet * 2.5 });
    list.push({ label: "3×", to: ctx.currentBet * 3 });
  }
  var seen = new Set();
  return list
    .map(function (x) { return { label: x.label, to: Math.round(Math.max(x.to, minTo)) }; })
    .filter(function (x) {
      if (x.to >= maxTo || seen.has(x.to)) return false;
      seen.add(x.to);
      return true;
    });
}

// ===== RENDERING: TABLE =====

function seatPoint(seat, rx, ry) {
  var angle = (90 + seat * (360 / SEAT_COUNT)) * Math.PI / 180;
  return { x: 50 + rx * Math.cos(angle), y: 50 + ry * Math.sin(angle) };
}

function cardEl(card, size) {
  var node = el("div", "pcard " + (size || "") + " " + SUITS[card.suit].color);
  node.setAttribute("aria-label", RANKS[card.rank] + " of " + SUITS[card.suit].name);
  node.append(el("span", "pcard-rank", RANKS[card.rank]), el("span", "pcard-suit", SUITS[card.suit].sym));
  return node;
}

function cardBack(size) {
  var node = el("div", "pcard back " + (size || ""));
  node.setAttribute("aria-hidden", "true");
  return node;
}

function renderTable() {
  var felt = $("felt");
  felt.querySelectorAll(".seat, .bet-chip, .dealer-btn").forEach(function (n) { n.remove(); });
  var h = table.hand;
  if (!h) return;

  var winnerSeats = new Set();
  if (h.done) players().forEach(function (p, s) { if (p.won > 0) winnerSeats.add(s); });

  players().forEach(function (p, seat) {
    var pt = seatPoint(seat, 44, 41);
    var node = el("div", "seat");
    if (p.isHero) node.classList.add("hero");
    if (p.folded) node.classList.add("folded");
    if (table.acting === seat) node.classList.add("acting");
    if (winnerSeats.has(seat)) node.classList.add("winner");
    node.style.left = pt.x + "%";
    node.style.top = pt.y + "%";

    var cards = el("div", "seat-cards");
    if (!p.folded || p.isHero) {
      p.cards.forEach(function (c) {
        cards.append(p.isHero || p.shown ? cardEl(c, p.isHero ? "md" : "sm") : cardBack("sm"));
      });
    }
    var plate = el("div", "seat-plate");
    var top = el("div", "seat-top");
    top.append(el("span", "seat-name", p.name), el("span", "seat-pos", p.pos + (p.style ? " · " + styleOf(p).label : "")));
    if (p.style) node.title = p.name + " plays " + styleOf(p).name;
    var stack = el("div", "seat-stack", p.allIn && !h.done ? "All-in" : fmtBB(p.stack, h.bb));
    stack.title = fmtChips(p.stack);
    plate.append(top, stack);
    var act = el("div", "seat-act", winnerSeats.has(seat) ? "Wins " + fmtBB(p.won, h.bb) : p.lastAction);
    node.append(cards, plate, act);
    felt.append(node);

    if (p.bet > 0 && !h.done) {
      var bp = seatPoint(seat, 27, 22);
      var chip = el("div", "bet-chip", fmtBB(p.bet, h.bb));
      chip.style.left = bp.x + "%";
      chip.style.top = bp.y + "%";
      felt.append(chip);
    }
  });

  var dp = seatPoint(table.button + 0.35, 35, 31);
  var dealer = el("div", "dealer-btn", "D");
  dealer.style.left = dp.x + "%";
  dealer.style.top = dp.y + "%";
  dealer.title = "Dealer button";
  felt.append(dealer);

  $("pot").textContent = "Pot " + fmtBB(potTotal(), h.bb);
  var board = $("board");
  board.replaceChildren();
  for (var i = 0; i < 5; i++) {
    board.append(h.board[i] ? cardEl(h.board[i], "lg") : el("div", "pcard slot lg"));
  }
  var stageLabel = GAME_STAGES[h.stage].label;
  $("stage-line").textContent = stageLabel + " · " + fmtChips(h.sb) + "/" + fmtChips(h.bb) + (h.ante ? " · ante " + fmtChips(h.ante) : "") +
    " · Hand " + h.no;
}

// ===== RENDERING: CONTROLS =====

function renderControls() {
  var box = $("controls");
  box.replaceChildren();
  var h = table.hand;

  if (!h) {
    var startBtn = el("button", "btn primary big", "Deal first hand");
    startBtn.type = "button";
    startBtn.addEventListener("click", newSession);
    box.append(startBtn);
    return;
  }

  if (table.over) {
    var out = el("p", "controls-note", "You busted on hand " + h.no + " in level " + (h.level + 1) + ". Review the hand, then start a new tournament.");
    var again = el("button", "btn primary", "New tournament");
    again.type = "button";
    again.addEventListener("click", function () { table.over = false; newSession(); });
    box.append(out, again);
    return;
  }

  if (!table.running) {
    var hero = players()[HERO_SEAT];
    var row = el("div", "controls-row");
    var next = el("button", "btn primary big", "Deal next hand");
    next.type = "button";
    next.id = "deal-next";
    var cash = table.settings.mode === "cash";
    var start = startingStack();
    next.disabled = cash && hero.stack < CASH_BLINDS.bb;
    next.addEventListener("click", playHand);
    row.append(next);
    if (cash && hero.stack < start) {
      var top = el("button", "btn", "Top up to " + fmtBB(start, CASH_BLINDS.bb));
      top.type = "button";
      top.addEventListener("click", function () {
        hero.stack = start;
        table.topUps += 1;
        renderAll();
      });
      row.append(top);
    }
    box.append(row, el("p", "controls-note", "Enter deals the next hand."));
    return;
  }

  if (!pendingHero) {
    var actor = table.acting !== null && table.acting !== undefined ? players()[table.acting] : null;
    box.append(el("p", "controls-note waiting", actor && !actor.isHero ? actor.name + " (" + actor.pos + ") is thinking…" : "Dealing…"));
    return;
  }

  var ctx = pendingHero.ctx;
  var me = players()[HERO_SEAT];
  var bb = ctx.bb;
  var maxTo = me.stack + me.bet;

  var info = el("p", "controls-info");
  info.textContent = STREET_LABELS[ctx.street] + " · Pot " + fmtBB(ctx.pot, bb) +
    (ctx.toCall > 0 ? " · " + fmtBB(Math.min(ctx.toCall, me.stack), bb) + " to call" : "") +
    " · Your stack " + fmtBB(me.stack, bb);
  box.append(info);

  var row = el("div", "controls-row");
  function addBtn(label, cls, decision, key) {
    var b = el("button", "btn " + cls, label);
    b.type = "button";
    if (key) b.dataset.key = key;
    b.addEventListener("click", function () { heroDecide(decision); });
    row.append(b);
    return b;
  }
  if (ctx.toCall > 0) addBtn("Fold", "fold", { type: "fold" }, "f");
  if (ctx.toCall === 0) addBtn("Check", "check", { type: "check" }, "c");
  else addBtn("Call " + fmtBB(Math.min(ctx.toCall, me.stack), bb) + (me.stack <= ctx.toCall ? " (all-in)" : ""), "call", { type: "call" }, "c");

  var canRaise = maxTo > ctx.currentBet && me.stack > ctx.toCall;
  var verb = ctx.currentBet === 0 ? "Bet" : "Raise to";
  if (canRaise) {
    raisePresets(ctx).forEach(function (preset) {
      var amount = fmtBB(preset.to, bb);
      addBtn(verb + " " + amount + (preset.label === amount ? "" : " (" + preset.label + ")"), "raise", { type: "raise", to: preset.to });
    });
    addBtn("All-in " + fmtBB(maxTo, bb), "allin", { type: "raise", to: maxTo });
  }
  box.append(row);

  if (canRaise) {
    var form = el("form", "custom-raise");
    var minTo = Math.min(maxTo, ctx.currentBet + ctx.minRaise);
    var label = el("label", null, verb + " (bb)");
    label.htmlFor = "custom-amount";
    var input = el("input");
    input.id = "custom-amount";
    input.type = "number";
    input.step = "0.5";
    input.min = String(Math.round((minTo / bb) * 10) / 10);
    input.max = String(Math.round((maxTo / bb) * 10) / 10);
    input.placeholder = input.min + "–" + input.max;
    var go = el("button", "btn ghost", verb);
    go.type = "submit";
    var err = el("span", "custom-error");
    form.append(label, input, go, err);
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var chips = Math.round(parseFloat(input.value) * bb);
      if (!isFinite(chips) || chips < minTo) {
        err.textContent = "Minimum is " + fmtBB(minTo, bb) + ".";
        return;
      }
      heroDecide({ type: "raise", to: Math.min(chips, maxTo) });
    });
    box.append(form);
  }
  box.append(el("p", "controls-note", "Keys: F fold · C check or call"));
}

// ===== RENDERING: HAND PANEL =====

function actionLine(a, bb) {
  var you = a.isHero;
  var who = you ? "You" : a.name;
  function verb(base) { return you ? base : base + "s"; }
  if (a.type === "post") return who + " " + verb("post") + " " + a.label + " " + fmtBB(a.add, bb);
  if (a.type === "fold") return who + " " + verb("fold");
  if (a.type === "check") return who + " " + verb("check");
  if (a.type === "call") return who + " " + verb("call") + " " + fmtBB(a.add, bb) + (a.allIn ? (you ? " and are all-in" : " and is all-in") : "");
  if (a.type === "bet") return who + " " + verb("bet") + " " + fmtBB(a.to, bb) + (a.allIn ? " (all-in)" : "");
  return who + " " + verb("raise") + " to " + fmtBB(a.to, bb) + (a.allIn ? " (all-in)" : "");
}

function renderPanel() {
  var h = table.viewing;
  var log = $("hand-log");
  log.replaceChildren();
  $("hand-result").replaceChildren();
  $("chart-check").replaceChildren();
  if (!h) {
    $("hand-title").textContent = "No hand yet";
    $("hand-sub").textContent = "Pick a game and deal. Every hand you play is logged here for review.";
    renderReview();
    return;
  }
  $("hand-title").textContent = "Hand " + h.no + (h === table.hand && !h.done ? " · in progress" : "");
  $("hand-sub").textContent = "You: " + h.heroPos + " with " + cardsText(h.heroCards) + " · " + GAME_STAGES[h.stage].label +
    " · " + fmtChips(h.sb) + "/" + fmtChips(h.bb) + (h.ante ? " ante " + fmtChips(h.ante) : "");

  if (h.notice) log.append(el("li", "log-notice", h.notice));
  var street = null;
  var group = null;
  h.actions.forEach(function (a) {
    if (a.type === "street" || street === null) {
      street = a.type === "street" ? a.street : "preflop";
      var head = el("li", "log-street");
      head.append(el("span", "log-street-name", STREET_LABELS[street]));
      if (a.type === "street") head.append(el("span", "log-board", cardsText(a.board) + " · pot " + fmtBB(a.pot, h.bb)));
      log.append(head);
      group = el("li", "log-actions");
      log.append(group);
      if (a.type === "street") return;
    }
    var line = el("span", "log-action" + (a.isHero ? " hero" : ""), actionLine(a, h.bb));
    group.append(line);
  });

  if (h.done) {
    var res = $("hand-result");
    if (h.showdown.length) {
      var sd = el("ul", "showdown");
      h.showdown.forEach(function (s) {
        sd.append(el("li", null, (s.seat === HERO_SEAT ? "You" : s.name) + " (" + s.pos + "): " + cardsText(s.cards) + " · " + s.hand));
      });
      res.append(sd);
    }
    h.results.forEach(function (r) { res.append(el("p", "result-line", r.replace(/^You wins/, "You win").replace(/^You split/, "You split").replace(/^You gets/, "You get"))); });
    var net = el("p", "net " + (h.heroNet > 0 ? "up" : h.heroNet < 0 ? "down" : "flat"), "Your result: " + signedBB(h.heroNet, h.bb));
    res.append(net);
    renderChartCheck(h);
  }
  renderReview();
}

function chartVerdict(h) {
  var c = h.heroChart;
  if (!c || !c.action || !h.heroFirst) return null;
  var you = h.heroFirst;
  var chart = c.action;
  if (you === chart) return "match";
  var aggressive = ["Raise", "3-Bet", "All-In"];
  if (aggressive.indexOf(you) !== -1 && aggressive.indexOf(chart) !== -1) return "close";
  if (you === "Check" && chart === "Fold") return "match";
  return "miss";
}

function renderChartCheck(h) {
  var box = $("chart-check");
  var c = h.heroChart;
  if (!c) return;
  if (!c.action) {
    box.append(el("p", "chart-note", "Chart check: not covered (" + c.reason + ")."));
    return;
  }
  var verdict = chartVerdict(h);
  var chip = el("span", "chip " + verdict, verdict === "match" ? "Matches chart" : verdict === "close" ? "Close to chart" : "Off chart");
  var line = el("p", "chart-line");
  line.append(chip, document.createTextNode(" You: " + h.heroFirst + " · Chart: " + c.action +
    (c.limpers ? " (chart assumes no limpers; there were " + c.limpers + ")" : "")));
  box.append(line);
}

// ===== HAND HISTORY TEXT (for Claude) =====

function historyText(h) {
  var bb = h.bb;
  var lines = [];
  var game = h.mode === "cash"
    ? "Cash game, blinds $" + h.sb + "/$" + h.bb
    : "Tournament, " + GAME_STAGES[h.stage].label.replace("Tournament · ", "").toLowerCase() + " stage, level " + (h.level + 1) +
      ": blinds " + h.sb + "/" + h.bb + (h.ante ? ", big-blind ante " + h.ante : "");
  lines.push("Hand #" + h.no + " — " + game + ", 9-handed. Amounts in big blinds.");
  lines.push("Hero: " + h.heroPos + " with " + cardsText(h.heroCards, true) + " (" + h.heroHand + "), stack " +
    fmtBB(h.seats[HERO_SEAT].stack, bb) + ".");
  var stacks = PREFLOP_ORDER.map(function (pos) {
    var s = h.seats.find(function (x) { return x.pos === pos; });
    return pos + (s.isHero ? " (Hero)" : " (" + BOT_STYLES[s.style].name + ")") + " " + fmtBB(s.stack, bb);
  });
  lines.push("Stacks: " + stacks.join(", ") + ".");

  var current = "Pre-flop";
  var buffer = [];
  function flush() {
    if (buffer.length) lines.push(current + ": " + buffer.join(", ") + ".");
    buffer = [];
  }
  h.actions.forEach(function (a) {
    if (a.type === "street") {
      flush();
      current = STREET_LABELS[a.street] + " [" + cardsText(a.board, true) + "] (pot " + fmtBB(a.pot, bb) + ")";
      return;
    }
    var who = a.isHero ? "Hero" : a.pos;
    var text = actionLine(Object.assign({}, a, { isHero: false, name: who }), bb);
    buffer.push(text);
  });
  flush();
  if (h.showdown.length) {
    lines.push("Board: " + cardsText(h.board, true) + ".");
    lines.push("Showdown: " + h.showdown.map(function (s) {
      return (s.seat === HERO_SEAT ? "Hero" : s.pos) + " " + cardsText(s.cards, true) + " (" + s.hand + ")";
    }).join("; ") + ".");
  }
  lines.push("Result: " + h.results.map(function (r) {
    return h.seats.reduce(function (text, s) { return s.isHero ? text.split(s.name + " ").join("Hero ") : text.split(s.name + " ").join(s.pos + " "); }, r);
  }).join(" ") + " Hero net " + signedBB(h.heroNet, bb) + ".");
  if (h.heroChart && h.heroChart.action) {
    lines.push("Pre-flop chart reference for Hero's first decision: " + h.heroChart.action + ". " + h.heroChart.explanation);
  }
  return lines.join("\n");
}

// ===== CLAUDE REVIEW =====

const BOT_RULES =
  "The opponents are bots, each with a labelled style: tight-aggressive, loose-aggressive, tight-passive or calling station. " +
  "Pre-flop they play chart ranges widened or narrowed by style. Post-flop they estimate each opponent's range from the " +
  "actions in the hand, simulate equity against it, and then value-bet, slow-play, c-bet, semi-bluff, bluff, raise, call " +
  "or fold with frequencies set by their style. They never see Hero's cards.";

function handPrompt(h) {
  return [
    "You are a poker coach reviewing one hand from a no-limit Texas Hold'em practice app. The player is \"Hero\".",
    BOT_RULES,
    "Judge Hero's decisions as you would against real opponents, and note where the opponent's labelled style should change Hero's play (for example, value-bet thinner against a calling station, fold more to a tight-passive player's raise).",
    "",
    historyText(h),
    "",
    "Reply in plain text, under 200 words, with exactly these four labelled lines and nothing else:",
    "Verdict: Good, Close spot, or Mistake, followed by a short reason.",
    "Pre-flop: one to three sentences on Hero's pre-flop play, using position, stack depth and stage.",
    "Post-flop: one to three sentences, or \"Hand ended pre-flop.\"",
    "Takeaway: one rule of thumb Hero can use next time.",
    "Use bb for amounts. No markdown, bullet points or headings."
  ].join("\n");
}

function sessionPrompt(hands) {
  return [
    "You are a poker coach reviewing a block of hands from a no-limit Texas Hold'em practice app. The player is \"Hero\".",
    BOT_RULES,
    "",
    hands.map(historyText).join("\n\n"),
    "",
    "Find Hero's two or three most costly patterns across these hands (leaks), and anything Hero is doing well.",
    "Reply in plain text, under 300 words, as labelled lines only:",
    "Leak 1: the pattern, the hand numbers that show it, and the fix.",
    "Leak 2: same format (and Leak 3 only if there is a real third).",
    "Strength: one thing Hero is doing right.",
    "Drill: one concrete exercise for the next session.",
    "Use bb for amounts. No markdown, bullet points or headings."
  ].join("\n");
}

let sampleFn = null;
let sampleState = "pending";
let activeReview = null;

(async function connectClaude() {
  try {
    sampleFn = window.claude && typeof window.claude.use === "function" ? await window.claude.use("sample") : null;
  } catch (e) {
    sampleFn = null;
  }
  sampleState = sampleFn ? "ready" : "absent";
  renderReview();
  renderSession();
})();

const REVIEW_ERRORS = {
  not_granted: "Claude access was turned off for this page. Copy the hand history and paste it into a chat instead.",
  sampling_disabled: "Claude isn't available on this account. Copy the hand history and paste it into a chat instead.",
  rate_limited: "Too many reviews in a short time. Wait a minute, then try again.",
  session_expired: "Your Claude session expired. Sign in again, then retry.",
  refused: "Claude declined to review this one. Try copying the history into a chat.",
  empty_completion: "Claude returned an empty review. Try again.",
  prompt_too_large: "That's too much history to review at once. Try fewer hands."
};

function renderFeedback(container, text) {
  container.replaceChildren();
  text.split("\n").forEach(function (raw) {
    var line = raw.replace(/\*\*/g, "").replace(/^#+\s*/, "").trim();
    if (!line) return;
    var p = el("p", "fb-line");
    var m = line.match(/^(Verdict|Pre-flop|Preflop|Post-flop|Postflop|Takeaway|Leak \d|Strength|Drill)\s*:\s*/i);
    if (m) {
      p.append(el("strong", null, m[1] + ": "), document.createTextNode(line.slice(m[0].length)));
      if (/^verdict/i.test(m[1])) {
        var v = line.slice(m[0].length).toLowerCase();
        p.classList.add(v.indexOf("mistake") === 0 ? "bad" : v.indexOf("good") === 0 ? "good" : "close");
      }
    } else {
      p.textContent = line;
    }
    container.append(p);
  });
}

async function runReview(prompt, output, onDone) {
  if (!sampleFn || activeReview) return;
  var ctl = new AbortController();
  activeReview = ctl;
  output.replaceChildren(el("p", "fb-thinking", "Claude is reviewing…"));
  renderReview();
  renderSession();
  try {
    var result = await sampleFn(prompt, {
      signal: ctl.signal,
      onText: function (u) { renderFeedback(output, u.text); }
    });
    renderFeedback(output, result.text);
    if (result.truncated) output.append(el("p", "fb-note", "The review was cut short."));
    if (onDone) onDone(result.text);
  } catch (e) {
    if (e && e.text) renderFeedback(output, e.text);
    else output.replaceChildren();
    if (!e || e.code !== "cancelled") {
      output.append(el("p", "fb-note", REVIEW_ERRORS[e && e.code] || "The review didn't finish. Try again in a moment."));
    }
    if (e && (e.code === "not_granted" || e.code === "sampling_disabled")) sampleState = "absent";
  } finally {
    activeReview = null;
    renderReview();
    renderSession();
  }
}

function copyText(text, fallbackHost) {
  function fallback() {
    fallbackHost.replaceChildren();
    var area = el("textarea", "copy-fallback");
    area.value = text;
    area.readOnly = true;
    area.rows = 8;
    fallbackHost.append(el("p", "fb-note", "Copy this hand history and paste it into a chat:"), area);
    area.focus();
    area.select();
  }
  var settled = false;
  // Some app views never settle the clipboard promise; show the text after a second either way
  var timer = setTimeout(function () { if (!settled) { settled = true; fallback(); } }, 1000);
  try {
    navigator.clipboard.writeText(text).then(function () {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fallbackHost.replaceChildren(el("p", "fb-note", "Hand history copied. Paste it into a chat with Claude."));
    }, function () {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fallback();
    });
  } catch (e) {
    settled = true;
    clearTimeout(timer);
    fallback();
  }
}

function renderReview() {
  var h = table.viewing;
  var actions = $("review-actions");
  var out = $("review-out");
  actions.replaceChildren();
  if (!h || !h.done) {
    out.replaceChildren();
    if (h && !h.done) actions.append(el("p", "fb-note", "Feedback is available when the hand ends."));
    return;
  }
  if (h.review) renderFeedback(out, h.review);
  else if (!activeReview) out.replaceChildren();

  if (sampleState === "ready") {
    var ask = el("button", "btn primary", h.review ? "Review again" : "Get Claude's feedback");
    ask.type = "button";
    ask.disabled = !!activeReview;
    ask.addEventListener("click", function () {
      runReview(handPrompt(h), out, function (text) { h.review = text; });
    });
    actions.append(ask);
  } else if (sampleState === "pending") {
    var wait = el("button", "btn primary", "Connecting to Claude…");
    wait.type = "button";
    wait.disabled = true;
    actions.append(wait);
  }
  if (activeReview) {
    var stop = el("button", "btn ghost", "Stop");
    stop.type = "button";
    stop.addEventListener("click", function () { if (activeReview) activeReview.abort(); });
    actions.append(stop);
  }
  var copy = el("button", "btn ghost", "Copy hand history");
  copy.type = "button";
  copy.addEventListener("click", function () { copyText(historyText(h), out); });
  actions.append(copy);
  if (sampleState === "absent") {
    actions.append(el("p", "fb-note", "In-page feedback works when this page is opened in Claude. Here, copy the history and paste it into a chat."));
  }
}

// ===== RENDERING: SESSION =====

function renderSession() {
  var hands = table.sessionHands;
  var stats = $("stats");
  stats.replaceChildren();
  var netBB = hands.reduce(function (s, h) { return s + h.heroNet / h.bb; }, 0);
  var vpip = hands.length ? Math.round(hands.filter(function (h) { return h.vpip; }).length / hands.length * 100) : 0;
  var charted = hands.filter(function (h) { return chartVerdict(h) !== null; });
  var onChart = charted.filter(function (h) { return chartVerdict(h) !== "miss"; }).length;
  var tiles = [
    ["Hands", String(hands.length)],
    ["Net", hands.length ? (netBB >= 0 ? "+" : "−") + Math.abs(Math.round(netBB * 10) / 10) + "bb" : "–"],
    ["VPIP", hands.length ? vpip + "%" : "–"],
    ["On chart", charted.length ? Math.round(onChart / charted.length * 100) + "%" : "–"]
  ];
  tiles.forEach(function (t) {
    var d = el("div");
    d.append(el("dt", null, t[0]), el("dd", null, t[1]));
    stats.append(d);
  });

  var sessionBtn = $("review-session");
  sessionBtn.hidden = sampleState !== "ready";
  sessionBtn.disabled = hands.length < 3 || !!activeReview;
  sessionBtn.textContent = hands.length < 3 ? "Review my session (after 3 hands)" : "Review my last " + Math.min(10, hands.length) + " hands";

  var list = $("hand-list");
  list.replaceChildren();
  hands.slice(0, 50).forEach(function (h) {
    var li = el("li");
    var b = el("button", "hand-row" + (h === table.viewing ? " current" : ""));
    b.type = "button";
    b.append(
      el("span", "hr-no", "#" + h.no),
      el("span", "hr-pos", h.heroPos),
      el("span", "hr-cards", cardsText(h.heroCards)),
      el("span", "hr-chart " + (chartVerdict(h) || "none"), chartVerdict(h) === "miss" ? "off chart" : ""),
      el("span", "hr-net " + (h.heroNet > 0 ? "up" : h.heroNet < 0 ? "down" : "flat"), signedBB(h.heroNet, h.bb))
    );
    if (h.review) b.append(el("span", "hr-reviewed", "reviewed"));
    b.addEventListener("click", function () {
      table.viewing = h;
      renderPanel();
      renderSession();
    });
    li.append(b);
    list.append(li);
  });
}

function renderAll() {
  renderTable();
  renderControls();
  if (table.viewing === table.hand) renderPanel();
  renderSession();
}

// ===== WIRING =====

$("set-mode").addEventListener("change", syncSettingsVisibility);
$("new-session").addEventListener("click", function () {
  if (table.running) return;
  newSession();
});
$("set-speed").addEventListener("change", function () {
  if (table.settings) table.settings.speed = $("set-speed").value;
});
$("review-session").addEventListener("click", function () {
  var hands = table.sessionHands.slice(0, 10).reverse();
  runReview(sessionPrompt(hands), $("session-review-out"));
});

document.addEventListener("keydown", function (e) {
  if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT" || e.target.tagName === "TEXTAREA") return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (pendingHero) {
    var key = e.key.toLowerCase();
    var btn = document.querySelector('#controls [data-key="' + key + '"]');
    if (btn) { e.preventDefault(); btn.click(); }
    return;
  }
  if (e.key === "Enter" && !table.running) {
    var next = $("deal-next");
    if (next && !next.disabled) { e.preventDefault(); next.click(); }
  }
});

syncSettingsVisibility();
renderPanel();
renderSession();
renderControls();
