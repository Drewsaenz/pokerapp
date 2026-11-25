// Practice table: hero plays full hands against 8 bots.
// Bot decisions live in bots.js; this file runs the table, the hand and the UI.

// ===== TABLE CONFIG =====

const HERO_SEAT = 0;
// Seats after the blinds, earliest first. Short-handed tables drop the earliest ones,
// so a 6-handed table runs LJ, HJ, CO, BTN, SB, BB and uses those seats' ranges.
const EARLY_TO_LATE = ["UTG", "UTG+1", "UTG+2", "LJ", "HJ", "CO"];
const MIN_PLAYERS = 3;
const MAX_PLAYERS = 9;
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
  var money = table.settings && isCash();
  return (money ? "$" : "") + chips.toLocaleString("en-US");
}

function signedBB(chips, bb) {
  if (chips === 0) return "±0bb";
  return (chips > 0 ? "+" : "−") + fmtBB(Math.abs(chips), bb);
}

function cardText(card, ascii) {
  var suit = ascii ? ["s", "h", "d", "c"][card.suit] : SUITS[card.suit].sym;
  return (ascii ? RANKS[card.rank] : faceRank(card.rank)) + suit;
}

function cardsText(cards, ascii) {
  return cards.map(function (c) { return cardText(c, ascii); }).join(" ");
}

function players() {
  return table.players;
}

function seatCount() {
  return table.players.length || MAX_PLAYERS;
}

// Positions by seats clockwise from the button
function positionsFor(n) {
  return ["BTN", "SB", "BB"].concat(EARLY_TO_LATE.slice(MAX_PLAYERS - n));
}

function positionOf(seat) {
  var n = seatCount();
  return positionsFor(n)[(seat - table.button + n) % n];
}

// Seats in acting order for a street, skipping positions this table size doesn't have
function actingOrder(street) {
  return (street === "preflop" ? PREFLOP_ORDER : POSTFLOP_ORDER).map(seatOfPos).filter(function (s) { return s >= 0; });
}

function seatOfPos(pos) {
  var n = seatCount();
  var idx = positionsFor(n).indexOf(pos);
  return idx < 0 ? -1 : (table.button + idx) % n;
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
    tableSize: $("set-size").value,
    speed: $("set-speed").value
  };
}

function isCash() {
  return !table.settings || table.settings.mode !== "tournament";
}

function isLive() {
  return !!table.settings && table.settings.mode === "live";
}

function modeLabel(stage, mode) {
  return mode === "live" ? "Live $1/2" : GAME_STAGES[stage].label;
}

// Live card-room bots buy in anywhere from the $100 minimum to the $300 maximum, mostly near the top
function botBuyIn() {
  if (!isLive()) return startingStack();
  return (Math.random() < 0.6 ? randomInt(125, 150) : randomInt(50, 125)) * CASH_BLINDS.bb;
}

function syncSettingsVisibility() {
  var cash = $("set-mode").value !== "tournament";
  $("field-depth").hidden = !cash;
  $("field-level").hidden = cash;
}

function blinds() {
  if (isCash()) return CASH_BLINDS;
  return TOURNEY_LEVELS[Math.min(table.level, TOURNEY_LEVELS.length - 1)];
}

function startingTableSize() {
  var size = table.settings.tableSize;
  if (size === "varies") return randomInt(5, MAX_PLAYERS);
  return parseInt(size, 10) || MAX_PLAYERS;
}

// In a "varies" cash game, players leave and sit down between hands, like a real card room
function tableChurn() {
  var notes = [];
  var n = seatCount();
  if (n > 4 && Math.random() < 0.12) {
    var leave = randomInt(1, n - 1);
    var gone = table.players[leave];
    table.players.splice(leave, 1);
    table.usedNames.delete(gone.name);
    if (leave < table.button) table.button -= 1;
    table.button = table.button % table.players.length;
    notes.push(gone.name + " leaves the table.");
  } else if (n < MAX_PLAYERS && Math.random() < 0.15) {
    var at = randomInt(1, n);
    var fresh = makePlayer(nextBotName(), botBuyIn(), false);
    table.players.splice(at, 0, fresh);
    if (at <= table.button) table.button += 1;
    notes.push(fresh.name + " sits down.");
  }
  if (notes.length) notes.push("Now " + table.players.length + "-handed.");
  return notes;
}

function startingStack() {
  return isCash() ? table.settings.cashDepth * CASH_BLINDS.bb : TOURNEY_START;
}

function currentStage() {
  if (isCash()) return "cash";
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
    style: isHero ? null : randomStyle(isLive()), range: null, aggr: 0
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
  var size = startingTableSize();
  for (var i = 0; i < size; i++) {
    table.players.push(i === HERO_SEAT ? makePlayer("You", start, true) : makePlayer(nextBotName(), botBuyIn(), false));
  }
  table.button = randomInt(0, size - 1);
  $("session-review-out").replaceChildren();
  startSessionRecord();
  saveTable();
  renderProgress();
  renderSetupHint();
  playHand();
}

// Reloads, replacements and blind levels between hands
function betweenHands() {
  var notes = [];
  var start = startingStack();
  var cash = isCash();
  var alive = players().filter(function (p) { return p.stack > 0; });
  var avg = alive.length ? Math.round(alive.reduce(function (s, p) { return s + p.stack; }, 0) / alive.length / 100) * 100 : start;

  players().forEach(function (p, seat) {
    if (p.isHero) return;
    if (cash && p.stack < start * 0.4) {
      p.stack = botBuyIn();
      notes.push(p.name + " reloads to " + fmtBB(p.stack, CASH_BLINDS.bb) + ".");
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
  if (cash && table.settings.tableSize === "varies") notes = notes.concat(tableChurn());
  table.button = (table.button + 1) % seatCount();
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
    live: isLive(),
    straddle: 0,
    straddleSeat: null,
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
    checks: [],
    pendingCheck: null,
    vpip: false,
    results: [],
    showdown: [],
    heroNet: 0,
    notice: table.notice,
    sessionId: table.sessionId,
    at: Date.now(),
    review: null,
    done: false
  };
  table.viewing = table.hand;
  table.notice = "";

  if (b.ante) postAnte(seatOfPos("BB"), b.ante);
  post(seatOfPos("SB"), b.sb, "small blind");
  post(seatOfPos("BB"), b.bb, "big blind");
  // Live rooms: the first seat after the blinds sometimes posts a $5 straddle and acts last pre-flop
  if (isLive() && seatCount() >= 4 && Math.random() < 0.3) {
    var straddler = actingOrder("preflop")[0];
    if (players()[straddler].stack > b.bb * 10) {
      table.hand.straddle = Math.round(b.bb * 2.5);
      table.hand.straddleSeat = straddler;
      post(straddler, table.hand.straddle, "straddle");
    }
  }
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
  recordHand(table.hand);
  renderAll();
}

async function bettingRound(street) {
  var h = table.hand;
  var order = actingOrder(street);
  if (street === "preflop" && h.straddle) {
    // The straddler acts last before the flop
    var at = order.indexOf(h.straddleSeat);
    order = order.slice(at + 1).concat(order.slice(0, at + 1));
  }
  var currentBet = street === "preflop" ? (h.straddle || h.bb) : 0;
  var minRaise = street === "preflop" ? (h.straddle || h.bb) : h.bb;
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
  var heroPre = p.isHero && ctx.street === "preflop";
  var type = d.type;
  if (type === "check" && ctx.toCall > 0) type = "call";
  if (type === "call" && ctx.toCall === 0) type = "check";

  if (type === "fold") {
    p.folded = true;
    p.lastAction = "Fold";
    record({ street: ctx.street, seat: seat, type: "fold" });
    if (heroPre) logHeroCheck("Fold");
    return false;
  }
  if (type === "check") {
    p.lastAction = "Check";
    record({ street: ctx.street, seat: seat, type: "check" });
    if (heroPre) logHeroCheck("Check");
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

  if (heroPre) {
    var label = kind === "call" ? "Call" : p.allIn ? "All-In" : (["Raise", "3-Bet", "4-Bet"][ctx.raises] || "5-Bet");
    logHeroCheck(label);
  }
  return kind !== "call";
}

function settle() {
  var h = table.hand;
  var ps = players();
  // The cards that would have been dealt next, in order, and everyone's hole cards
  h.runout = h.deck.slice(h.deck.length - (5 - h.board.length)).reverse();
  h.holeCards = ps.map(function (p) { return p.cards.slice(); });
  var live = [];
  ps.forEach(function (p, seat) { if (!p.folded) live.push(seat); });

  if (live.length === 1) {
    var winner = ps[live[0]];
    var pot = potTotal();
    winner.stack += pot;
    winner.won = pot;
    var uncalled = winner.total - Math.max.apply(null, ps.filter(function (p, s) { return s !== live[0]; }).map(function (p) { return p.total; }));
    h.potWon = pot - Math.max(0, uncalled);
    h.results.push(winner.name + " wins the pot (" + fmtBB(h.potWon, h.bb) + "), no showdown.");
  } else {
    while (h.board.length < 5) h.board.push(h.deck.pop());
    var hands = {};
    live.forEach(function (seat) {
      hands[seat] = evaluateHand(ps[seat].cards.concat(h.board));
      ps[seat].shown = true;
      h.showdown.push({ seat: seat, name: ps[seat].name, pos: ps[seat].pos, cards: ps[seat].cards.slice(), hand: hands[seat].name });
    });
    var pots = buildPots();
    h.potWon = pots.filter(function (pot) { return pot.eligible.length > 1; })
      .reduce(function (sum, pot) { return sum + pot.amount; }, 0);
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
      var orderedWinners = actingOrder("flop").filter(function (s) { return winners.indexOf(s) !== -1; });
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

// Players already in for the current bet besides the raiser (callers, or all-in for less)
function callersOfBet(seat, ctx) {
  return players().filter(function (x, s) {
    return s !== seat && s !== ctx.lastRaiser && !x.folded && x.bet > 0 && (x.bet >= ctx.currentBet || x.allIn);
  }).length;
}

// Each extra player already in shrinks the range that can profitably continue
const MULTIWAY_SHRINK = 0.3;

// Equity needed to call, counting only what this player can actually put in and win:
// a short stack calls at most its stack and wins at most that much from each opponent.
function callPrice(seat, ctx) {
  var me = players()[seat];
  var call = Math.min(ctx.toCall, me.stack);
  var cap = me.total + call;
  var winnable = table.hand.dead || 0;
  players().forEach(function (x) { winnable += Math.min(x.total, cap); });
  return call / (winnable + call);
}

function limperCount() {
  var h = table.hand;
  var level = h.straddle || h.bb;
  return players().filter(function (p, s) {
    return !p.folded && p.pos !== "BB" && s !== h.straddleSeat && p.bet >= level;
  }).length;
}

// Live open size: $10-15 (5-7.5bb), $20-30 over a straddle, plus $3-5 per limper
function liveOpenTo() {
  var h = table.hand;
  var base = h.straddle ? h.straddle * (4 + Math.random() * 2) : h.bb * (5 + Math.random() * 2.5);
  return Math.round(base + limperCount() * h.bb * (1.5 + Math.random()));
}

// Pairs, suited aces and suited connectors: hands that make big, hidden hands in multiway pots
function isSpeculative(hand) {
  if (hand.length === 2) return true;
  if (hand[2] !== "s") return false;
  var order = "23456789TJQKA";
  return hand[0] === "A" || order.indexOf(hand[0]) - order.indexOf(hand[1]) <= 2;
}

// The chart scenario for a pre-flop spot, or null when the spot is outside what the chart covers
function preflopScenario(seat, ctx) {
  var p = players()[seat];
  var h = table.hand;
  if (ctx.raises > 1) return null;
  if (ctx.raises === 1 && (ctx.raiserAllIn || ctx.toCall >= 0.35 * (p.stack + p.bet))) return null;
  if (ctx.raises === 0 && ctx.toCall === 0) return null;
  if (ctx.raises === 0 && h.straddle && (p.pos === "SB" || p.pos === "BB")) return null;
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

  var live = table.hand.live;
  var st = styleOf(p);
  if (ctx.raises === 0 && ctx.toCall === 0) {
    var isoTo = live ? liveOpenTo() : bb * (3.5 + limperCount());
    return pPlay <= 0.1 ? sizedRaise(seat, ctx, isoTo) : { type: "check" };
  }
  if (live && ctx.raises === 0 && table.hand.straddle && (p.pos === "SB" || p.pos === "BB")) {
    if (pPlay <= 0.06) return sizedRaise(seat, ctx, liveOpenTo());
    return pPlay <= (p.pos === "BB" ? 0.3 : 0.18) * st.call ? { type: "call" } : { type: "fold" };
  }

  var sc = preflopScenario(seat, ctx);
  if (sc) {
    var rec = styledPreflop(seat, ctx, sc);
    if (live && sc.stack !== "short") {
      // Stations raise only their best hands and limp the rest
      if (ctx.raises === 0 && rec === "Raise" && p.style === "CALL" && pPlay > 0.06) rec = "Call";
      // Loose players limp in, and over-limp behind other limpers
      if (ctx.raises === 0 && rec === "Fold" && pPlay <= (LIVE_LIMP[p.style] || 0) + (limperCount() ? 0.08 : 0)) rec = "Call";
      // Passive players 3-bet only premiums (JJ+, AK); the rest of their 3-bets become calls
      if (rec === "3-Bet" && (p.style === "CALL" || p.style === "NIT") && pPlay > 0.035) rec = "Call";
      // Facing a raise: call wide, wider still after limping and with more players in
      if (ctx.raises === 1 && rec === "Fold") {
        var blindIn = p.pos === "BB" ? bb : (p.pos === "SB" ? table.hand.sb : 0);
        var limped = p.bet > blindIn;
        var loose = (LIVE_CALL[p.style] || 0.15) * (limped ? 1.4 : 1) * (ctx.toCall <= bb * 8 ? 1 : 0.5) +
          0.04 * callersOfBet(seat, ctx);
        if (pPlay <= Math.min(loose, 0.6)) rec = "Call";
      }
    }
    if (rec === "All-In") return { type: "raise", to: maxTo };
    if (rec === "Call") return { type: "call" };
    if (rec === "Raise") return sizedRaise(seat, ctx, live && sc.stack !== "short" ? liveOpenTo() : bb * ((sc.stack === "short" ? 2.1 : 2.5) + limperCount()));
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

  // 3-bet pots, all-ins and big raises
  if (pPlay <= 0.025) return { type: "raise", to: maxTo };
  if (ctx.toCall === 0) return { type: "check" };
  var callers = callersOfBet(seat, ctx);
  var shrink = Math.pow(MULTIWAY_SHRINK, callers);
  var bigBet = ctx.raiserAllIn || ctx.toCall >= 0.35 * maxTo;
  if (bigBet) {
    // Calling off a stack: priced against the raiser, tighter for every player already in
    var required = callPrice(seat, ctx);
    var continuePct = clamp((0.55 - required) * 0.45 * styleOf(p).call, 0.02, 0.35) * shrink;
    return pShove <= continuePct ? { type: "call" } : { type: "fold" };
  }
  // Facing a 3-bet or more: a narrow, fixed calling band that doesn't widen as the pot grows.
  // Players who already put money in (opened or called) defend more than cold callers.
  var blindPost = p.pos === "BB" ? table.hand.bb : (p.pos === "SB" ? table.hand.sb : 0);
  var invested = p.bet > blindPost;
  var band = (invested ? 0.05 : 0.012) * styleOf(p).call * shrink;
  return pPlay <= 0.025 + band ? { type: "call" } : { type: "fold" };
}

// ===== HERO =====

function heroAct(ctx) {
  var h = table.hand;
  if (ctx.street === "preflop") {
    h.pendingCheck = heroChartFor(ctx);
    if (h.pendingCheck) h.pendingCheck.effBB = Math.round(effectiveStack(HERO_SEAT) / h.bb);
  }
  return new Promise(function (resolve) {
    pendingHero = { ctx: ctx, resolve: resolve };
    renderControls();
  });
}

function logHeroCheck(you) {
  var h = table.hand;
  var c = h.pendingCheck;
  h.pendingCheck = null;
  if (!c) return;
  h.checks.push({ spot: c.spot, chart: c.action, you: you, explanation: c.explanation, limpers: c.limpers || 0, effBB: c.effBB });
}

function heroActsAfter(seat) {
  var order = POSTFLOP_ORDER;
  return order.indexOf(players()[HERO_SEAT].pos) > order.indexOf(players()[seat].pos);
}

// Live isolation size: $12-15 (4-5x a straddle) plus about $4 per limper
function liveIsoSize() {
  var h = table.hand;
  return Math.round((h.straddle ? h.straddle * 4 : h.bb * 6.5) + limperCount() * h.bb * 2);
}

// Live $1/2 adjustments on top of the online-style chart
function liveAdjust(base, sc, rec, ctx) {
  var h = table.hand;
  var hand = sc.hand;
  var p = handPercentile(hand, false);
  var group = positionGroup(sc.hero);
  var offsuit = hand.length === 3 && hand[2] === "o";
  var late = group === "late";
  var out = Object.assign({}, base);

  if (sc.spot === "unopened") {
    var limpers = limperCount();
    var openLine = rec.lines[0];
    if (limpers) {
      out.spot = "Limpers in front of you";
      // Isolate strong hands big, over-limp hands that make big hands multiway, fold the rest
      if (p <= openLine * 0.8) {
        out.action = "Raise";
        out.explanation = "Live $1/2 with " + limpers + (limpers === 1 ? " limper" : " limpers") + ": isolate your strong hands with a big raise, about " +
          fmtChips(liveIsoSize()) + ", so you play against fewer, weaker hands. " + hand + " is in the top " + pct(p) + ", strong enough to raise.";
      } else if (isSpeculative(hand) && (late || p <= 0.35)) {
        out.action = "Call";
        out.explanation = "Live $1/2 with limpers: " + hand + " isn't strong enough to isolate, but it makes sets, straights and flushes that get paid in " +
          "multiway pots. Over-limp" + (late ? " in position" : "") + " and play for a big hand.";
      } else {
        out.action = "Fold";
        out.explanation = "Live $1/2 with limpers: " + hand + " is too weak to isolate and doesn't make the big hands that win multiway pots, so fold.";
      }
      return out;
    }
    // Folded to you: same range, but tighter with dominated offsuit hands early, and live sizing
    if (rec.action === "Raise" && offsuit && (group === "early" || group === "middle") && p > openLine * 0.6) {
      out.action = "Fold";
      out.explanation = "Live $1/2: offsuit hands like " + hand + " get dominated in the big multiway pots these games create, so fold them from " +
        sc.hero + " even though an online chart opens them.";
      return out;
    }
    if (rec.action === "Raise") out.explanation = rec.explanation + " Live sizing: open to about " + fmtChips(h.straddle ? h.straddle * 4 : h.bb * 6.5) + ".";
    return out;
  }

  // Facing a raise: live opens are big and draw callers, so call tighter unless the hand plays well multiway
  var callers = callersOfBet(HERO_SEAT, ctx);
  var threeBet = rec.lines[0];
  var callTop = rec.lines[1];
  var bigOpen = ctx.currentBet >= h.bb * 5;
  var shrink = Math.pow(0.7, callers) * (bigOpen ? 0.8 : 1);
  var callLine = threeBet + (callTop - threeBet) * shrink;
  // Deep in a live game, pairs (anywhere) and suited speculative hands (in position) can call to hit a big hand
  var setMine = sc.stackBB >= 100 && isSpeculative(hand) && (hand.length === 2 || late) && p <= 0.6;
  var speculativeCall = false;
  if (p <= threeBet) out.action = "3-Bet";
  else if (p <= callLine) out.action = "Call";
  else if (setMine) { out.action = "Call"; speculativeCall = true; }
  else out.action = "Fold";
  if (!speculativeCall) {
    out.explanation = "Live $1/2: the " + sc.opener + " opened to " + fmtChips(ctx.currentBet) +
      (callers ? " and " + callers + (callers === 1 ? " player has" : " players have") + " already called" : "") +
      ". Big live opens and multiway pots shrink your calling range: 3-bet about the top " + pct(threeBet) +
      " for value and call only about the next " + pct(callLine - threeBet) + ". " + hand + " is in the top " + pct(p) + ".";
  } else {
    out.explanation = "Live $1/2: " + hand + " is outside the normal calling range, but deep-stacked " +
      (hand.length === 2 ? "pairs set-mine" : "suited hands play") + " well in multiway pots where opponents pay off big hands. Call" +
      (late ? " in position" : "") + " and fold if you miss.";
  }
  return out;
}

// The chart's answer for any hero pre-flop decision
function heroChartFor(ctx, handOverride) {
  var p = players()[HERO_SEAT];
  var h = table.hand;
  var sc = preflopScenario(HERO_SEAT, ctx);
  if (sc && handOverride) sc.hand = handOverride;
  if (sc) {
    var rec = getRecommendation(sc);
    var base = {
      spot: sc.spot === "unopened" ? "Folded to you" : "Facing a raise",
      action: rec.action,
      explanation: rec.explanation,
      limpers: ctx.raises === 0 ? limperCount() : 0
    };
    return h.live && sc.stack !== "short" ? liveAdjust(base, sc, rec, ctx) : base;
  }
  var hand = handOverride || handNotation(p.cards);
  var pPlay = handPercentile(hand, false);
  var pShove = handPercentile(hand, true);
  var tight = h.stage === "late" || h.stage === "final" ? 0.8 : 1;
  var stageNote = tight < 1 ? " " + STAGE_NOTES[h.stage] : "";

  if (ctx.raises === 0 && ctx.toCall === 0) {
    var straddler = h.straddle && p.pos !== "BB";
    return {
      spot: straddler ? "Limpers, you have the straddle option" : "Limpers, you're in the big blind",
      action: pPlay <= 0.1 ? "Raise" : "Check",
      explanation: "Only limpers in front of you" + (straddler ? " and you straddled" : "") + ". Raise your top 10% or so to punish the limps" +
        (h.live ? " (about " + fmtChips(liveIsoSize()) + ")" : "") + ", and check everything else to see a free flop. " +
        hand + " is in the top " + pct(pPlay) + "."
    };
  }

  if (ctx.raises === 0 && h.straddle && (p.pos === "SB" || p.pos === "BB")) {
    var defend = p.pos === "BB" ? 0.25 : 0.15;
    return {
      spot: "Facing the straddle from the " + p.pos,
      action: pPlay <= 0.06 ? "Raise" : (pPlay <= defend ? "Call" : "Fold"),
      explanation: "The " + fmtChips(h.straddle) + " straddle makes this a bigger, deeper-priced pot and you'll be out of position. " +
        "Raise only premiums (about the top 6%), call with the next " + pct(defend - 0.06) + " of hands that play well multiway, and fold the rest. " +
        hand + " is in the top " + pct(pPlay) + "."
    };
  }

  var bigBet = ctx.raiserAllIn || ctx.toCall >= 0.35 * (p.stack + p.bet);
  if (bigBet) {
    var required = callPrice(HERO_SEAT, ctx);
    var callers = callersOfBet(HERO_SEAT, ctx);
    var callPct = clamp((0.55 - required) * 0.45 * tight, 0.02, 0.3) * Math.pow(MULTIWAY_SHRINK, callers);
    var go = pShove <= callPct;
    var multiway = callers
      ? " " + (callers === 1 ? "Another player has" : callers + " other players have") + " already called, so you have to beat " +
        (callers + 1) + " strong ranges, not one. That cuts it to"
      : " Against a range this strong that means";
    return {
      spot: ctx.raiserAllIn ? "Facing an all-in" : "Facing a raise that commits your stack",
      action: go ? (ctx.raiserAllIn ? "Call" : "All-In") : "Fold",
      explanation: "It costs " + fmtBB(Math.min(ctx.toCall, p.stack), h.bb) + " to continue, and counting only what you can win from each player, you need about " +
        pct(required) + " equity." + multiway + " roughly the top " + pct(callPct) +
        " of hands by all-in equity; " + hand + " is in the top " + pct(pShove) + "." + stageNote
    };
  }

  var heroActions = h.actions.filter(function (a) { return a.isHero && a.street === "preflop" && a.type !== "post"; });
  var heroOpened = heroActions.some(function (a) { return a.type === "raise"; });
  if (ctx.raises >= 3) {
    var line4 = 0.02 * tight;
    return {
      spot: "Facing a 4-bet",
      action: pPlay <= line4 ? "All-In" : "Fold",
      explanation: "After you 3-bet and get 4-bet, continue only with the very top, about the top " + pct(line4) +
        " (QQ+, AK suited). " + hand + " is in the top " + pct(pPlay) + "." + stageNote
    };
  }

  if (ctx.raises === 2) {
    var cold = !heroOpened;
    var effBB = Math.round(effectiveStack(HERO_SEAT) / h.bb);
    var short = effBB <= 40;
    var ip = heroActsAfter(ctx.lastRaiser);
    var fourLine = (cold ? 0.03 : 0.035) * tight;
    var callBand = short ? 0 : (cold ? (ip ? 0.012 : 0) : (ip ? 0.07 : 0.04) * tight);
    var action = pPlay <= fourLine ? (short ? "All-In" : "4-Bet") : (pPlay <= fourLine + callBand ? "Call" : "Fold");
    var who = players()[ctx.lastRaiser].pos;
    return {
      spot: heroOpened ? "Facing a 3-bet after you opened" : (heroActions.length ? "Facing a 3-bet after you called" : "Facing a raise and a 3-bet"),
      action: action,
      explanation: (cold
        ? "Someone opened and the " + who + " 3-bet before it reached you, so both ranges are strong. 4-bet about the top " + pct(fourLine) +
          (callBand ? ", call the next " + pct(callBand) + " in position" : "") + ", and fold the rest."
        : "The " + who + " 3-bet your open. 4-bet about the top " + pct(fourLine) +
          (callBand ? ", call the next " + pct(callBand) + (ip ? " since you'll have position" : " out of position") : (short ? "; at " + effBB + "bb there's no room to call and play post-flop" : "")) +
          ", and fold the rest.") +
        " " + hand + " is in the top " + pct(pPlay) + "." + stageNote
    };
  }
  return null;
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
    if (ctx.raises === 0 && table.hand.live) {
      // Live sizes: $12 / $15 (or 4x / 5x a straddle) plus $4 per limper
      var unit = table.hand.straddle;
      var perLimper = limperCount() * bb * 2;
      [unit ? unit * 4 : bb * 6, unit ? unit * 5 : bb * 7.5].forEach(function (to) {
        to = Math.round(to + perLimper);
        list.push({ label: fmtChips(to), to: to });
      });
    } else if (ctx.raises === 0) {
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
  var angle = (90 + seat * (360 / seatCount())) * Math.PI / 180;
  return { x: 50 + rx * Math.cos(angle), y: 50 + ry * Math.sin(angle) };
}

function cardEl(card, size) {
  var node = el("div", "pcard " + (size || "") + " " + SUITS[card.suit].color);
  node.setAttribute("aria-label", faceRank(card.rank) + " of " + SUITS[card.suit].name);
  node.append(el("span", "pcard-rank", faceRank(card.rank)), el("span", "pcard-suit", SUITS[card.suit].sym));
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
  if (!players().length) return;
  var bb = h ? h.bb : blinds().bb;
  var done = !h || h.done;

  var winnerSeats = new Set();
  if (h && h.done) players().forEach(function (p, s) { if (p.won > 0) winnerSeats.add(s); });
  var revealed = h && h.revealed && canShowRest(h) ? restOfHand(h) : null;
  var revealSeats = new Set(revealed ? revealed.hands.map(function (x) { return x.seat; }) : []);

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
    if (h && h.revealed && h.holeCards && revealSeats.has(seat)) {
      h.holeCards[seat].forEach(function (c) { cards.append(cardEl(c, p.isHero ? "md" : "sm")); });
    } else if (!p.folded || p.isHero) {
      p.cards.forEach(function (c) {
        cards.append(p.isHero || p.shown ? cardEl(c, p.isHero ? "md" : "sm") : cardBack("sm"));
      });
    }
    var plate = el("div", "seat-plate");
    var top = el("div", "seat-top");
    top.append(el("span", "seat-name", p.name), el("span", "seat-pos", p.pos + (p.style ? " · " + styleOf(p).label : "")));
    if (p.style) node.title = p.name + " plays " + styleOf(p).name;
    var stack = el("div", "seat-stack", p.allIn && !done ? "All-in" : fmtBB(p.stack, bb));
    stack.title = fmtChips(p.stack);
    plate.append(top, stack);
    var act = el("div", "seat-act", winnerSeats.has(seat) ? "Wins " + fmtBB(p.won, bb) : p.lastAction);
    node.append(cards, plate, act);
    felt.append(node);

    if (p.bet > 0 && !done) {
      var bp = seatPoint(seat, 27, 22);
      var chip = el("div", "bet-chip", fmtBB(p.bet, bb));
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

  if (!h) {
    $("pot").textContent = "";
    $("board").replaceChildren();
    for (var s = 0; s < 5; s++) $("board").append(el("div", "pcard slot lg"));
    var b = blinds();
    $("stage-line").textContent = modeLabel(currentStage(), table.settings.mode) + " · " + fmtChips(b.sb) + "/" + fmtChips(b.bb) + " · your saved table";
    return;
  }

  $("pot").textContent = "Pot " + fmtBB(h.done && h.potWon !== undefined ? h.potWon : potTotal(), h.bb);
  var board = $("board");
  board.replaceChildren();
  for (var i = 0; i < 5; i++) {
    if (h.board[i]) board.append(cardEl(h.board[i], "lg"));
    else if (revealed) {
      var ghost = cardEl(revealed.board[i], "lg");
      ghost.classList.add("ghost");
      ghost.title = "Would have come next";
      board.append(ghost);
    } else board.append(el("div", "pcard slot lg"));
  }
  var stageLabel = modeLabel(h.stage, h.mode) + (h.straddle ? " · " + fmtChips(h.straddle) + " straddle" : "");
  $("stage-line").textContent = stageLabel + " · " + fmtChips(h.sb) + "/" + fmtChips(h.bb) + (h.ante ? " · ante " + fmtChips(h.ante) : "") +
    " · Hand " + h.no;
}

// ===== RENDERING: CONTROLS =====

// ===== RANGE VIEW =====

const RANGE_RANKS = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"];
const RANGE_STYLE = {
  "Raise": ["r-raise", "Raise"], "3-Bet": ["r-3bet", "3-bet"], "4-Bet": ["r-3bet", "4-bet"],
  "All-In": ["r-allin", "All-in"], "Call": ["r-call", "Call"], "Check": ["r-check", "Check"], "Fold": ["r-fold", "Fold"]
};
let rangeOpen = false;

function rangeHandAt(r, c) {
  if (r === c) return RANGE_RANKS[r] + RANGE_RANKS[c];
  return r < c ? RANGE_RANKS[r] + RANGE_RANKS[c] + "s" : RANGE_RANKS[c] + RANGE_RANKS[r] + "o";
}

let rangeCache = { ctx: null, data: null };

// The chart's action for every starting hand in the current decision, computed once per decision
function rangeData(ctx) {
  if (rangeCache.ctx === ctx) return rangeCache.data;
  var me = players()[HERO_SEAT];
  var cells = [];
  var combos = {};
  for (var r = 0; r < 13; r++) {
    for (var c = 0; c < 13; c++) {
      var hand = rangeHandAt(r, c);
      var chart = heroChartFor(ctx, hand);
      var action = chart ? chart.action : "Fold";
      combos[action] = (combos[action] || 0) + (hand.length === 2 ? 6 : (hand[2] === "s" ? 4 : 12));
      cells.push({ hand: hand, action: action, pair: r === c });
    }
  }
  var data = { cells: cells, combos: combos, mine: handNotation(me.cards), myChart: heroChartFor(ctx) };
  rangeCache = { ctx: ctx, data: data };
  return data;
}

// Colors-only chart in the corner of the table, with the player's hand marked
function renderMiniRange() {
  var box = $("mini-range");
  var ctx = pendingHero && pendingHero.ctx;
  box.replaceChildren();
  if (!ctx || ctx.street !== "preflop") { box.hidden = true; return; }
  box.hidden = false;
  var data = rangeData(ctx);
  var myAction = data.myChart ? data.myChart.action : "Fold";
  var myStyle = RANGE_STYLE[myAction] || RANGE_STYLE.Fold;
  var label = el("span", "mini-label");
  label.append(document.createTextNode("Chart "), el("strong", "mini-act " + myStyle[0], myStyle[1]));
  var grid = el("span", "mini-grid");
  data.cells.forEach(function (cell) {
    var style = RANGE_STYLE[cell.action] || RANGE_STYLE.Fold;
    grid.append(el("span", "mini-cell " + style[0] + (cell.hand === data.mine ? " mine" : "")));
  });
  box.append(label, grid);
  box.title = data.mine + ": chart says " + myStyle[1].toLowerCase() + ". Tap for the full range view.";
}

function renderRangeView() {
  var box = $("range-view");
  var ctx = pendingHero && pendingHero.ctx;
  renderMiniRange();
  box.replaceChildren();
  if (!rangeOpen || !ctx || ctx.street !== "preflop") { box.hidden = true; return; }
  box.hidden = false;

  var me = players()[HERO_SEAT];
  var data = rangeData(ctx);
  var mine = data.mine;
  var myChart = data.myChart;
  var combos = data.combos;
  var grid = el("div", "range-grid");
  data.cells.forEach(function (cell) {
    var style = RANGE_STYLE[cell.action] || RANGE_STYLE.Fold;
    var node = el("div", "range-cell " + style[0] + (cell.hand === mine ? " mine" : "") + (cell.pair ? " pair" : ""), cell.hand);
    node.title = cell.hand + ": " + style[1];
    grid.append(node);
  });

  var effBB = Math.round(effectiveStack(HERO_SEAT) / table.hand.bb);
  var head = el("header", "range-head");
  var title = el("div");
  title.append(el("h3", null, (myChart ? myChart.spot : "Pre-flop") + " · " + me.pos),
    el("p", "range-sub", effBB + "bb effective · " + modeLabel(table.hand.stage, table.hand.mode) + (table.hand.straddle ? " (straddled)" : "") +
      (ctx.raises ? " · " + players()[ctx.lastRaiser].pos + " raised last" : "")));
  var hide = el("button", "btn ghost small", "Hide");
  hide.type = "button";
  hide.addEventListener("click", function () { rangeOpen = false; renderControls(); });
  head.append(title, hide);

  var legend = el("div", "range-legend");
  ["Raise", "3-Bet", "4-Bet", "All-In", "Call", "Check", "Fold"].forEach(function (a) {
    if (!combos[a]) return;
    var item = el("span", "range-legend-item");
    item.append(el("span", "range-swatch " + RANGE_STYLE[a][0]),
      document.createTextNode(RANGE_STYLE[a][1] + " " + Math.round(combos[a] / 13.26 * 10) / 10 + "%"));
    legend.append(item);
  });

  var myAction = myChart ? myChart.action : "Fold";
  var myStyle = RANGE_STYLE[myAction] || RANGE_STYLE.Fold;
  var yours = el("p", "range-yours");
  yours.append(document.createTextNode("Your hand: "), el("strong", null, cardsText(me.cards) + " (" + mine + ")"),
    document.createTextNode(" → chart says "), el("strong", "range-act " + myStyle[0], myStyle[1].toLowerCase()));
  var side = el("div", "range-side");
  side.append(legend, yours);
  if (myChart && myChart.explanation) side.append(el("p", "range-why", myChart.explanation));
  side.append(el("p", "fb-note", "Pairs run down the diagonal, suited hands above it, offsuit below. Your hand is outlined. The action buttons use the same colors: blue is a 3-bet or 4-bet, striped purple is all-in."));

  var body = el("div", "range-body");
  body.append(grid, side);
  box.append(head, body);
}

function renderControls() {
  renderRangeView();
  var box = $("controls");
  box.replaceChildren();
  var h = table.hand;

  if (table.loading) {
    box.append(el("p", "controls-note waiting", "Loading your saved table…"));
    return;
  }

  if (!h && !players().length) {
    var startBtn = el("button", "btn primary big", "Deal first hand");
    startBtn.type = "button";
    startBtn.addEventListener("click", newSession);
    box.append(startBtn);
    return;
  }

  if (table.over) {
    var out = el("p", "controls-note", "You busted on hand " + table.handNo + " in level " + (table.level + 1) + ". Review the hand, then start a new tournament.");
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
    var cash = isCash();
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
        saveTable();
        renderAll();
      });
      row.append(top);
    }
    box.append(row, el("p", "controls-note", h ? "Space or Enter deals the next hand." :
      "Welcome back. Your table, stacks and session are where you left them. A hand that was still in progress when you left isn't saved."));
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
  var reRaise = ctx.street === "preflop" && ctx.raises >= 1;
  var verb = ctx.currentBet === 0 ? "Bet" : (reRaise ? (ctx.raises === 1 ? "3-bet to" : "4-bet to") : "Raise to");
  if (canRaise) {
    raisePresets(ctx).forEach(function (preset) {
      var amount = fmtBB(preset.to, bb);
      addBtn(verb + " " + amount + (preset.label === amount ? "" : " (" + preset.label + ")"), reRaise ? "threebet" : "raise", { type: "raise", to: preset.to });
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
  if (ctx.street === "preflop") {
    var rangeBtn = el("button", "btn ghost small range-toggle", rangeOpen ? "Hide range" : "Range view");
    rangeBtn.type = "button";
    rangeBtn.dataset.key = "r";
    rangeBtn.setAttribute("aria-expanded", rangeOpen ? "true" : "false");
    rangeBtn.addEventListener("click", function () {
      rangeOpen = !rangeOpen;
      renderControls();
    });
    box.append(rangeBtn);
  }
  box.append(el("p", "controls-note", "Keys: F fold · C check or call" + (ctx.street === "preflop" ? " · R range view" : "")));
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
  $("hand-sub").textContent = "You: " + h.heroPos + " with " + cardsText(h.heroCards) + " · " + modeLabel(h.stage, h.mode) +
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
  renderRest(h);
  renderReview();
}

// ===== REST OF THE HAND (hindsight) =====

function canShowRest(h) {
  return !!(h && h.done && !h.showdown.length && h.runout && h.holeCards);
}

// Who would have reached showdown if the hand had been checked down from where it stopped
function restOfHand(h) {
  var board = h.board.concat(h.runout).slice(0, 5);
  var foldedAt = {};
  h.actions.forEach(function (a, i) { if (a.type === "fold") foldedAt[a.seat] = i; });
  var heroFold = foldedAt[HERO_SEAT];
  var contenders = [];
  if (heroFold !== undefined) {
    h.seats.forEach(function (x, seat) {
      if (foldedAt[seat] === undefined || foldedAt[seat] >= heroFold) contenders.push(seat);
    });
  } else {
    var lastFold = -1, lastSeat = null;
    Object.keys(foldedAt).forEach(function (seat) {
      if (foldedAt[seat] > lastFold) { lastFold = foldedAt[seat]; lastSeat = Number(seat); }
    });
    h.seats.forEach(function (x, seat) { if (foldedAt[seat] === undefined) contenders.push(seat); });
    if (lastSeat !== null) contenders.push(lastSeat);
  }
  var hands = contenders.map(function (seat) {
    var made = evaluateHand(h.holeCards[seat].concat(board));
    return { seat: seat, cards: h.holeCards[seat], name: made.name, score: made.score };
  });
  var best = hands.reduce(function (b, x) { return !b || compareScore(x.score, b) > 0 ? x.score : b; }, null);
  hands.forEach(function (x) { x.wins = compareScore(x.score, best) === 0; });
  var splits = hands.filter(function (x) { return x.wins; }).length > 1;
  var others = h.seats.map(function (x, seat) { return seat; })
    .filter(function (seat) { return contenders.indexOf(seat) === -1; });
  return { board: board, newCards: h.runout.length, hands: hands, splits: splits, others: others };
}

function seatLabel(h, seat) {
  return seat === HERO_SEAT ? "You (" + h.seats[seat].pos + ")" : h.seats[seat].name + " (" + h.seats[seat].pos + ")";
}

function renderRest(h) {
  var box = $("rest-of-hand");
  box.replaceChildren();
  if (!canShowRest(h)) return;
  var toggle = el("button", "btn ghost", h.revealed ? "Hide the rest of the hand" :
    (h.runout.length ? "See the rest of the hand" : "See what everyone had"));
  toggle.type = "button";
  toggle.setAttribute("aria-expanded", h.revealed ? "true" : "false");
  toggle.addEventListener("click", function () {
    h.revealed = !h.revealed;
    renderRest(h);
    if (h === table.hand) renderTable();
  });
  box.append(toggle);
  if (!h.revealed) return;

  var rest = restOfHand(h);
  var panel = el("div", "rest-panel");
  if (rest.newCards) {
    var row = el("div", "rest-board");
    row.append(el("span", "rest-label", "Run-out"));
    var cards = el("div", "rest-cards");
    rest.board.forEach(function (c, i) {
      var node = cardEl(c, "sm");
      if (i >= rest.board.length - rest.newCards) node.classList.add("new");
      cards.append(node);
    });
    row.append(cards);
    panel.append(row);
  }
  var list = el("ul", "rest-hands");
  rest.hands.forEach(function (x) {
    var li = el("li", x.wins ? "wins" : "");
    li.append(el("span", "rest-who", seatLabel(h, x.seat)), el("span", "rest-hole", cardsText(x.cards)),
      el("span", "rest-made", x.name + (x.wins ? (rest.splits ? " · would split" : " · would win") : "")));
    list.append(li);
  });
  panel.append(list);
  if (rest.others.length) {
    panel.append(el("p", "rest-folded", "Folded earlier: " + rest.others.map(function (seat) {
      return seatLabel(h, seat) + " " + cardsText(h.holeCards[seat]);
    }).join(" · ")));
  }
  panel.append(el("p", "fb-note", "Hindsight only: this assumes the next cards came off as dealt and nobody bet again. " +
    "Judge your decision by what you knew at the time."));
  box.append(panel);
}

const AGGRESSIVE = ["Raise", "3-Bet", "4-Bet", "5-Bet", "All-In"];

// Going all-in deep when the chart wants a normal raise risks the whole stack to win the blinds
const DEEP_SHOVE_BB = 25;

function checkVerdict(you, chart, effBB) {
  if (you === chart) return "match";
  if (you === "Check" && chart === "Fold") return "match";
  if (you === "All-In" && ["Raise", "3-Bet", "4-Bet"].indexOf(chart) !== -1 && effBB > DEEP_SHOVE_BB) return "miss";
  if (AGGRESSIVE.indexOf(you) !== -1 && AGGRESSIVE.indexOf(chart) !== -1) return "close";
  if ((you === "Call" && chart === "All-In") || (you === "All-In" && chart === "Call")) return "close";
  return "miss";
}

// The worst verdict across the hand's pre-flop decisions, or null if none were graded
function chartVerdict(h) {
  var list = h.checks || (h.heroChart && h.heroChart.action && h.heroFirst ? [{ chart: h.heroChart.action, you: h.heroFirst }] : []);
  if (!list.length) return null;
  var rank = { match: 0, close: 1, miss: 2 };
  return list.map(function (c) { return checkVerdict(c.you, c.chart, c.effBB); })
    .reduce(function (worst, v) { return rank[v] > rank[worst] ? v : worst; }, "match");
}

function renderChartCheck(h) {
  var box = $("chart-check");
  var list = h.checks || (h.heroChart && h.heroChart.action ? [{ spot: "First decision", chart: h.heroChart.action, you: h.heroFirst }] : []);
  list.forEach(function (c) {
    if (!c.you) return;
    var verdict = checkVerdict(c.you, c.chart, c.effBB);
    var chip = el("span", "chip " + verdict, verdict === "match" ? "Matches chart" : verdict === "close" ? "Close to chart" : "Off chart");
    var line = el("p", "chart-line");
    var deepShove = c.you === "All-In" && verdict === "miss" && ["Raise", "3-Bet", "4-Bet"].indexOf(c.chart) !== -1;
    line.append(chip, el("span", "chart-spot", c.spot + ": "), document.createTextNode("you " + c.you.toLowerCase() + ", chart says " +
      c.chart.toLowerCase() + (c.limpers ? " (chart assumes no limpers; there were " + c.limpers + ")" : "") + "." +
      (deepShove ? " At " + c.effBB + "bb deep, shoving risks your whole stack where a normal-size " + c.chart.toLowerCase() + " does the job." : "")));
    box.append(line);
  });
}

// ===== VERDICT GRADES =====

// Longest names first so "Big mistake" isn't read as "Mistake"; "Close spot" is the old scale's middle grade
const VERDICT_GRADES = [
  { name: "Big mistake", key: "big" },
  { name: "Questionable", key: "questionable" },
  { name: "Excellent", key: "excellent" },
  { name: "Close spot", key: "okay", label: "Okay" },
  { name: "Mistake", key: "mistake" },
  { name: "Good", key: "good" },
  { name: "Okay", key: "okay" }
];

function verdictGrade(text) {
  var t = String(text || "").replace(/\*/g, "").trim().toLowerCase();
  for (var i = 0; i < VERDICT_GRADES.length; i++) {
    if (t.indexOf(VERDICT_GRADES[i].name.toLowerCase()) === 0) {
      return { key: VERDICT_GRADES[i].key, label: VERDICT_GRADES[i].label || VERDICT_GRADES[i].name };
    }
  }
  return null;
}

function reviewGrade(review) {
  var m = String(review || "").match(/verdict\s*:\s*(.*)/i);
  return m ? verdictGrade(m[1]) : null;
}

// ===== HAND ARCHIVE (UI) =====

function archiveEntry(h) {
  var grade = reviewGrade(h.review);
  return {
    id: h.sessionId + "-" + h.no,
    at: h.at,
    sessionId: h.sessionId,
    no: h.no,
    mode: h.mode,
    net: round1(h.heroNet / h.bb),
    text: historyText(h),
    review: h.review || null,
    verdict: grade ? grade.label : null
  };
}

function exportText(entries) {
  var header = "Hold'em Practice Table: " + entries.length + " hands, exported " + new Date().toLocaleString() + ".";
  return [header].concat(entries.map(function (e) {
    return e.text + (e.review ? "\nClaude's review:\n" + e.review : "");
  })).join("\n\n---\n\n") + "\n";
}

function exportFilename() {
  return "poker-hands-" + new Date().toISOString().slice(0, 10) + ".txt";
}

async function downloadArchive(note) {
  note.textContent = "Preparing your hands…";
  var entries = await archiveAll();
  if (!entries.length) { note.textContent = "No hands archived yet."; return; }
  var text = exportText(entries);
  var downloads = window.claude && typeof window.claude.use === "function" ? await window.claude.use("downloads") : null;
  if (downloads) {
    try {
      await downloads.save({ filename: exportFilename(), data: text });
      note.textContent = "Saved " + entries.length + " hands.";
    } catch (e) {
      note.textContent = e && e.code === "declined" ? "Download cancelled." : "Downloads aren't available here. Use Copy all hands instead.";
    }
    return;
  }
  var url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  var a = document.createElement("a");
  a.href = url;
  a.download = exportFilename();
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  note.textContent = "Downloaded " + entries.length + " hands.";
}

function renderArchive() {
  var box = $("archive-row");
  if (!box) return;
  box.replaceChildren();
  var head = el("p", "archive-count");
  head.append(el("strong", null, archive.count + (archive.count === 1 ? " hand" : " hands")),
    document.createTextNode(" in your archive" + (archive.kind === "claude" ? " on your Claude account. Ask Claude in your chat to review them." : " on this device.")));
  box.append(head);
  var note = el("p", "fb-note");
  if (archive.error) { note.textContent = archive.error; note.classList.add("warn"); }
  if (archive.count) {
    var row = el("div", "archive-actions");
    var dl = el("button", "btn ghost small", "Download all hands");
    dl.type = "button";
    dl.addEventListener("click", function () { downloadArchive(note); });
    var cp = el("button", "btn ghost small", "Copy all hands");
    cp.type = "button";
    var copyHost = el("div", "archive-copy");
    cp.addEventListener("click", function () {
      archiveAll().then(function (entries) { copyText(exportText(entries), copyHost); });
    });
    row.append(dl, cp);
    box.append(row, copyHost);
  }
  box.append(note);
}

// ===== HAND HISTORY TEXT (for Claude) =====

function historyText(h) {
  var bb = h.bb;
  var lines = [];
  var game = h.mode === "live"
    ? "Live $1/2 cash game in a Texas card room (big opens, lots of limping, multiway pots), blinds $" + h.sb + "/$" + h.bb +
      (h.straddle ? ", $" + h.straddle + " straddle posted by the " + h.seats[h.straddleSeat].pos + (h.straddleSeat === HERO_SEAT ? " (Hero)" : "") : "")
    : h.mode === "cash"
    ? "Cash game, blinds $" + h.sb + "/$" + h.bb
    : "Tournament, " + GAME_STAGES[h.stage].label.replace("Tournament · ", "").toLowerCase() + " stage, level " + (h.level + 1) +
      ": blinds " + h.sb + "/" + h.bb + (h.ante ? ", big-blind ante " + h.ante : "");
  lines.push("Hand #" + h.no + " — " + game + ", " + h.seats.length + "-handed. Amounts in big blinds.");
  lines.push("Hero: " + h.heroPos + " with " + cardsText(h.heroCards, true) + " (" + h.heroHand + "), stack " +
    fmtBB(h.seats[HERO_SEAT].stack, bb) + ".");
  var stacks = PREFLOP_ORDER.filter(function (pos) {
    return h.seats.some(function (x) { return x.pos === pos; });
  }).map(function (pos) {
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
  // Spell out bet sizes so reviews don't have to do the arithmetic
  function multiple(x) {
    var r = Math.round(x * 10) / 10;
    return (Number.isInteger(r) ? String(r) : r.toFixed(1)) + "×";
  }
  var pot = 0;
  var streetBet = 0;
  var street = "preflop";
  h.actions.forEach(function (a) {
    if (a.type === "street") {
      flush();
      current = STREET_LABELS[a.street] + " [" + cardsText(a.board, true) + "] (pot " + fmtBB(a.pot, bb) + ")";
      street = a.street;
      pot = a.pot;
      streetBet = 0;
      return;
    }
    var who = a.isHero ? "Hero" : a.pos;
    var text = actionLine(Object.assign({}, a, { isHero: false, name: who }), bb);
    if (a.type === "raise" && streetBet > 0) {
      text += street === "preflop" && streetBet <= bb
        ? " (" + multiple(a.to / bb) + " the big blind)"
        : " (" + multiple(a.to / streetBet) + " the previous bet)";
    } else if (a.type === "bet" && pot > 0) {
      text += " (" + Math.round((a.to / pot) * 100) + "% of the pot)";
    }
    pot += a.add || 0;
    if (a.type !== "post" || a.label !== "ante") streetBet = Math.max(streetBet, a.to || 0);
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
  (h.checks || []).forEach(function (c) {
    lines.push("Pre-flop chart reference (" + c.spot + "): Hero chose " + c.you + ", chart says " + c.chart + ". " + c.explanation);
  });
  if (!h.checks && h.heroChart && h.heroChart.action) {
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

const LIVE_RULES =
  "This hand simulates a live $1/2 card room in Texas: opens of $10-15 (more over limpers or a straddle), frequent limping and " +
  "limp-calling, multiway pots, occasional $5 straddles, and a table mostly of calling stations and loose players. Passive " +
  "players 3-bet only premium hands, and size their post-flop bets by strength (small = medium hands, big = strong). Judge " +
  "Hero's sizing and hand selection for that game, not an online one: bigger opens and isolation raises, value-bet heavily, " +
  "bluff rarely, and respect big bets and raises from passive players.";

function handPrompt(h) {
  return [
    "You are a poker coach reviewing one hand from a no-limit Texas Hold'em practice app. The player is \"Hero\".",
    BOT_RULES,
    "Judge Hero's decisions as you would against real opponents, and note where the opponent's labelled style should change Hero's play (for example, value-bet thinner against a calling station, fold more to a tight-passive player's raise).",
    h.mode === "live" ? LIVE_RULES : "",
    "",
    historyText(h),
    "",
    "Reply in plain text, under 200 words, with exactly these four labelled lines and nothing else:",
    "Verdict: exactly one of Excellent, Good, Okay, Questionable, Mistake or Big mistake, followed by a short reason. " +
      "Excellent = optimal or a strong exploit; Good = solid, no real errors; Okay = small inaccuracies that cost little; " +
      "Questionable = a clear but small leak; Mistake = cost real money; Big mistake = cost a lot.",
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
    hands.some(function (x) { return x.mode === "live"; }) ? LIVE_RULES : "",
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
        var grade = verdictGrade(line.slice(m[0].length));
        if (grade) p.classList.add("v-" + grade.key);
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
      runReview(handPrompt(h), out, function (text) {
        h.review = text;
        persist();
        var grade = reviewGrade(text);
        archiveUpdate(h.sessionId + "-" + h.no, { review: text, verdict: grade ? grade.label : null });
        renderSession();
      });
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

// ===== SAVED PROGRESS =====

function round1(x) {
  return Math.round(x * 10) / 10;
}

function tableSnapshot() {
  return {
    settings: table.settings,
    players: players().map(function (p) { return { name: p.name, stack: p.stack, style: p.style, isHero: p.isHero }; }),
    button: table.button,
    level: table.level,
    handsAtLevel: table.handsAtLevel,
    handNo: table.handNo,
    topUps: table.topUps,
    over: table.over,
    sessionId: table.sessionId,
    usedNames: Array.from(table.usedNames)
  };
}

function saveTable() {
  saved.table = tableSnapshot();
  persist();
}

function startSessionRecord() {
  table.sessionId = "s" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  saved.sessions.unshift({
    id: table.sessionId,
    startedAt: Date.now(),
    lastAt: Date.now(),
    mode: table.settings.mode,
    depth: table.settings.mode !== "tournament" ? table.settings.cashDepth : null,
    hands: 0, net: 0, vpip: 0, charted: 0, onChart: 0
  });
}

function recordHand(h) {
  saved.recent.unshift(h);
  var session = saved.sessions.find(function (x) { return x.id === h.sessionId; });
  if (session) {
    session.hands += 1;
    session.net = round1(session.net + h.heroNet / h.bb);
    if (h.vpip) session.vpip += 1;
    var verdict = chartVerdict(h);
    if (verdict) {
      session.charted += 1;
      if (verdict !== "miss") session.onChart += 1;
    }
    session.lastAt = Date.now();
  }
  saved.curve.push(round1(h.heroNet / h.bb));
  saveTable();
  archiveAdd(archiveEntry(h));
  renderProgress();
}

function restoreTable() {
  var t = saved.table;
  table.settings = t.settings;
  $("set-mode").value = t.settings.mode;
  $("set-depth").value = String(t.settings.cashDepth);
  $("set-level").value = String(t.settings.levelLength);
  $("set-speed").value = t.settings.speed;
  syncSettingsVisibility();
  table.button = t.button;
  table.level = t.level;
  table.handsAtLevel = t.handsAtLevel;
  table.handNo = t.handNo;
  table.topUps = t.topUps || 0;
  table.over = !!t.over;
  table.sessionId = t.sessionId;
  table.usedNames = new Set(t.usedNames || []);
  if (!t.settings.tableSize) t.settings.tableSize = "9";
  $("set-size").value = t.settings.tableSize;
  table.players = t.players.map(function (x) {
    var p = makePlayer(x.name, x.stack, x.isHero);
    p.style = x.style;
    return p;
  });
  table.players.forEach(function (p, seat) { p.pos = positionOf(seat); });
  table.hand = null;
  table.sessionHands = saved.recent.filter(function (h) { return h.sessionId === t.sessionId; });
  table.viewing = table.sessionHands[0] || null;
  renderSetupHint();
}

function renderSaveStatus() {
  var status = $("save-status");
  if (saveState.error) {
    status.textContent = saveState.error;
    status.className = "save-status warn";
    return;
  }
  status.className = "save-status";
  status.textContent = saveState.kind === "claude" ? "Saved to your Claude account"
    : saveState.kind === "local" ? "Saved on this device" : "";
}

// ===== RENDERING: PROGRESS =====

const SVG_NS = "http://www.w3.org/2000/svg";

function svgEl(tag, attrs) {
  var node = document.createElementNS(SVG_NS, tag);
  Object.keys(attrs || {}).forEach(function (k) { node.setAttribute(k, attrs[k]); });
  return node;
}

function niceStep(range) {
  var raw = range / 3;
  var mag = Math.pow(10, Math.floor(Math.log10(raw)));
  var steps = [1, 2, 2.5, 5, 10];
  for (var i = 0; i < steps.length; i++) if (steps[i] * mag >= raw) return steps[i] * mag;
  return 10 * mag;
}

function fmtSignedBB(v) {
  var r = round1(v);
  return (r > 0 ? "+" : r < 0 ? "−" : "±") + Math.abs(r) + "bb";
}

function renderCurve(host, curve) {
  host.replaceChildren();
  if (curve.length < 2) {
    host.append(el("p", "chart-empty", "Play a few hands to see your results over time."));
    return;
  }
  var cum = [0];
  curve.forEach(function (v) { cum.push(round1(cum[cum.length - 1] + v)); });
  var n = cum.length - 1;
  var W = Math.max(260, Math.round(host.clientWidth || 320));
  var H = 170;
  var pad = { l: 46, r: 14, t: 22, b: 22 };
  var minV = Math.min.apply(null, cum.concat([0]));
  var maxV = Math.max.apply(null, cum.concat([0]));
  if (maxV - minV < 4) { maxV += 2; minV -= 2; }
  var step = niceStep(maxV - minV);
  var lo = Math.floor(minV / step) * step;
  var hi = Math.ceil(maxV / step) * step;
  var plotW = W - pad.l - pad.r;
  var plotH = H - pad.t - pad.b;
  function x(i) { return pad.l + (i / n) * plotW; }
  function y(v) { return pad.t + ((hi - v) / (hi - lo)) * plotH; }

  var svg = svgEl("svg", { viewBox: "0 0 " + W + " " + H, width: "100%", height: H, role: "img",
    "aria-label": "Total winnings after each hand, now " + fmtSignedBB(cum[n]) + " over " + n + " hands" });

  for (var t = lo; t <= hi + step / 2; t += step) {
    var ty = y(t);
    svg.append(svgEl("line", { x1: pad.l, x2: W - pad.r, y1: ty, y2: ty, class: t === 0 ? "axis-zero" : "grid" }));
    var label = svgEl("text", { x: pad.l - 6, y: ty + 4, "text-anchor": "end", class: "tick" });
    label.textContent = (t > 0 ? "+" : t < 0 ? "−" : "") + Math.abs(round1(t));
    svg.append(label);
  }
  var first = svgEl("text", { x: pad.l, y: H - 6, "text-anchor": "start", class: "tick" });
  first.textContent = "Hand 1";
  var last = svgEl("text", { x: W - pad.r, y: H - 6, "text-anchor": "end", class: "tick" });
  last.textContent = "Hand " + n;
  svg.append(first, last);

  var d = cum.map(function (v, i) { return (i ? "L" : "M") + x(i).toFixed(1) + " " + y(v).toFixed(1); }).join(" ");
  svg.append(svgEl("path", { d: d, class: "curve" }));
  svg.append(svgEl("circle", { cx: x(n), cy: y(cum[n]), r: 4, class: "curve-end" }));
  var endLabel = svgEl("text", { x: x(n), y: Math.max(12, y(cum[n]) - 10), "text-anchor": "end", class: "end-label" });
  endLabel.textContent = fmtSignedBB(cum[n]);
  svg.append(endLabel);

  var cross = svgEl("line", { y1: pad.t, y2: H - pad.b, class: "crosshair", visibility: "hidden" });
  var dot = svgEl("circle", { r: 4, class: "curve-end", visibility: "hidden" });
  var hit = svgEl("rect", { x: pad.l, y: 0, width: plotW, height: H, fill: "transparent" });
  svg.append(cross, dot, hit);
  host.append(svg);

  var tip = el("div", "chart-tip");
  tip.hidden = true;
  host.append(tip);

  function show(evt) {
    var rect = svg.getBoundingClientRect();
    var px = (evt.clientX - rect.left) * (W / rect.width);
    var i = Math.max(0, Math.min(n, Math.round(((px - pad.l) / plotW) * n)));
    var cx = x(i), cy = y(cum[i]);
    cross.setAttribute("x1", cx); cross.setAttribute("x2", cx); cross.setAttribute("visibility", "visible");
    dot.setAttribute("cx", cx); dot.setAttribute("cy", cy); dot.setAttribute("visibility", "visible");
    tip.textContent = (i === 0 ? "Start" : "After hand " + i) + ": " + fmtSignedBB(cum[i]) +
      (i > 0 ? " (this hand " + fmtSignedBB(curve[i - 1]) + ")" : "");
    tip.hidden = false;
    var left = (cx / W) * rect.width;
    tip.style.left = Math.min(Math.max(left, 70), rect.width - 70) + "px";
    tip.style.top = Math.max(0, (cy / H) * rect.height - 40) + "px";
  }
  function hide() {
    cross.setAttribute("visibility", "hidden");
    dot.setAttribute("visibility", "hidden");
    tip.hidden = true;
  }
  hit.addEventListener("pointermove", show);
  hit.addEventListener("pointerdown", show);
  hit.addEventListener("pointerleave", hide);
}

function sessionGameLabel(sess) {
  return sess.mode === "live" ? "Live $1/2" : (sess.mode === "cash" ? "Cash " + sess.depth + "bb" : "Tournament");
}

let confirmingErase = false;

function renderProgress() {
  var sessions = saved.sessions;
  var hands = sessions.reduce(function (s, x) { return s + x.hands; }, 0);
  var net = sessions.reduce(function (s, x) { return s + x.net; }, 0);
  var charted = sessions.reduce(function (s, x) { return s + x.charted; }, 0);
  var onChart = sessions.reduce(function (s, x) { return s + x.onChart; }, 0);

  var stats = $("progress-stats");
  stats.replaceChildren();
  [
    ["Hands", String(hands)],
    ["Net", hands ? fmtSignedBB(net) : "–"],
    ["bb/100", hands >= 10 ? fmtSignedBB(net / hands * 100).replace("bb", "") : "–"],
    ["On chart", charted ? Math.round(onChart / charted * 100) + "%" : "–"]
  ].forEach(function (t) {
    var d = el("div");
    d.append(el("dt", null, t[0]), el("dd", null, t[1]));
    stats.append(d);
  });

  renderCurve($("chart-plot"), saved.curve);

  var body = $("sessions-body");
  body.replaceChildren();
  var played = sessions.filter(function (x) { return x.hands > 0; }).slice(0, 8);
  $("sessions-table").hidden = played.length === 0;
  played.forEach(function (sess) {
    var tr = el("tr");
    if (sess.id === table.sessionId) tr.className = "current";
    var date = new Date(sess.startedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" });
    var when = el("td", "sess-when");
    when.append(el("span", null, date + (sess.id === table.sessionId ? " · now" : "")), el("span", "sess-game", sessionGameLabel(sess)));
    tr.append(
      when,
      el("td", "num", String(sess.hands)),
      el("td", "num " + (sess.net > 0 ? "up" : sess.net < 0 ? "down" : ""), fmtSignedBB(sess.net)),
      el("td", "num", sess.charted ? Math.round(sess.onChart / sess.charted * 100) + "%" : "–")
    );
    body.append(tr);
  });

  var reset = $("reset-row");
  reset.replaceChildren();
  if (!hands) return;
  if (!confirmingErase) {
    var ask = el("button", "btn ghost small", "Erase saved progress");
    ask.type = "button";
    ask.addEventListener("click", function () { confirmingErase = true; renderProgress(); });
    reset.append(ask);
    return;
  }
  reset.append(el("span", "erase-q", "Erase all saved hands, your hand archive, sessions and stats? Download your hands first if you want to keep them. This can't be undone."));
  var yes = el("button", "btn fold small", "Erase");
  yes.type = "button";
  yes.addEventListener("click", function () {
    confirmingErase = false;
    saved.sessions = [];
    saved.curve = [];
    saved.recent = [];
    archiveErase();
    table.sessionHands = [];
    table.viewing = table.running ? table.hand : null;
    if (table.settings) startSessionRecord();
    if (table.settings && !table.running) saveTable(); else persist();
    renderProgress();
    renderSession();
    renderPanel();
  });
  var no = el("button", "btn ghost small", "Cancel");
  no.type = "button";
  no.addEventListener("click", function () { confirmingErase = false; renderProgress(); });
  reset.append(yes, no);
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
    if (h.review) {
      var grade = reviewGrade(h.review);
      b.append(el("span", "hr-reviewed" + (grade ? " v-" + grade.key : ""), grade ? grade.label : "reviewed"));
    }
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

function renderSetupHint() {
  var hint = $("setup-hint");
  var s = table.settings;
  var next = readSettings();
  var changed = !!s && table.players.length > 0 &&
    (next.mode !== s.mode || next.tableSize !== s.tableSize ||
     (next.mode !== "tournament" && next.cashDepth !== s.cashDepth) ||
     (next.mode === "tournament" && next.levelLength !== s.levelLength));
  hint.hidden = !changed;
  var modeNames = { cash: "a regular cash game", live: "Live $1/2", tournament: "a tournament" };
  hint.textContent = !changed ? "" : (next.mode !== s.mode
    ? "Press New session to start playing " + modeNames[next.mode] + ". This table is still " + modeNames[s.mode] + "."
    : "Press New session to use these settings.");
  $("new-session").classList.toggle("nudge", changed);
}

$("set-mode").addEventListener("change", function () { syncSettingsVisibility(); renderSetupHint(); });
["set-size", "set-depth", "set-level"].forEach(function (id) { $(id).addEventListener("change", renderSetupHint); });
$("mini-range").addEventListener("click", function () {
  rangeOpen = true;
  renderControls();
  $("range-view").scrollIntoView({ behavior: "smooth", block: "nearest" });
});
$("new-session").addEventListener("click", function () {
  if (table.running) return;
  newSession();
});
$("set-speed").addEventListener("change", function () {
  if (table.settings) {
    table.settings.speed = $("set-speed").value;
    if (!table.running) saveTable();
  }
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
  var space = e.key === " " || e.key === "Spacebar";
  // A focused button or link keeps its own Space behavior
  if (space && (e.target.tagName === "BUTTON" || e.target.tagName === "A")) return;
  if ((e.key === "Enter" || space) && !table.running) {
    var next = $("deal-next");
    if (next && !next.disabled) { e.preventDefault(); next.click(); }
  }
});

table.loading = true;
syncSettingsVisibility();
renderPanel();
renderSession();
renderControls();
renderProgress();
var resizeTimer = null;
window.addEventListener("resize", function () {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(renderProgress, 150);
});
Promise.all([loadProgress(), loadArchive()]).then(function () {
  table.loading = false;
  if (saved.table && saved.table.players && saved.table.players.length) restoreTable();
  renderSaveStatus();
  renderAll();
  renderPanel();
  renderProgress();
  renderArchive();
});
