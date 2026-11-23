// Bot brains for the practice table: playing styles, hand reading and post-flop decisions.
// Bots never see other players' cards. They estimate each opponent's range from how
// that opponent has played this hand, then simulate the rest of the hand to get equity.

// ===== PLAYING STYLES =====

// open / threeBet / call scale pre-flop chart thresholds.
// cbet, valueBet, slowplay, raiseValue are post-flop frequencies; bluff scales bluff frequency;
// callAdj is added to equity when deciding whether a call is profitable.
const BOT_STYLES = {
  TAG: {
    label: "TAG", name: "tight-aggressive",
    open: 1.0, threeBet: 1.0, call: 1.0,
    cbet: 0.6, valueBet: 0.9, slowplay: 0.15, raiseValue: 0.65, bluff: 1.0, callAdj: 0
  },
  LAG: {
    label: "LAG", name: "loose-aggressive",
    open: 1.3, threeBet: 1.6, call: 1.1,
    cbet: 0.75, valueBet: 0.95, slowplay: 0.1, raiseValue: 0.75, bluff: 1.8, callAdj: 0.02
  },
  NIT: {
    label: "Nit", name: "tight-passive",
    open: 0.8, threeBet: 0.7, call: 0.8,
    cbet: 0.4, valueBet: 0.75, slowplay: 0.25, raiseValue: 0.5, bluff: 0.3, callAdj: -0.06
  },
  CALL: {
    label: "Station", name: "calling station",
    open: 1.15, threeBet: 0.5, call: 1.8,
    cbet: 0.35, valueBet: 0.7, slowplay: 0.35, raiseValue: 0.3, bluff: 0.4, callAdj: 0.12
  }
};

const STYLE_WEIGHTS = [["TAG", 4], ["LAG", 2], ["NIT", 2], ["CALL", 2]];

function randomStyle() {
  var total = STYLE_WEIGHTS.reduce(function (s, w) { return s + w[1]; }, 0);
  var roll = Math.random() * total;
  for (var i = 0; i < STYLE_WEIGHTS.length; i++) {
    roll -= STYLE_WEIGHTS[i][1];
    if (roll < 0) return STYLE_WEIGHTS[i][0];
  }
  return "TAG";
}

function styleOf(p) {
  return BOT_STYLES[p.style] || BOT_STYLES.TAG;
}

// ===== RANGE TRACKING =====

// Narrows a player's estimated range from a pre-flop action. Uses chart-standard
// widths rather than the player's true style: that's what an observant opponent would assume.
function updateRange(p, kind, ctx) {
  if (kind === "fold" || kind === "check") return;
  if (kind === "raise" || kind === "bet") {
    if (ctx.raises === 0) {
      p.range = p.allIn
        ? { pct: SHOVE_PCT[p.pos] || 0.3, shove: true }
        : { pct: p.pos === "BB" ? 0.12 : (OPEN_PCT[p.pos] || 0.3), shove: false };
    } else if (ctx.raises === 1) {
      p.range = { pct: p.allIn ? 0.08 : 0.06, shove: p.allIn };
    } else {
      p.range = { pct: 0.03, shove: p.allIn };
    }
    return;
  }
  if (ctx.raises === 0) {
    p.range = { pct: p.pos === "SB" ? 0.6 : 0.45, shove: false };
  } else if (ctx.raiserAllIn || p.allIn) {
    p.range = { pct: 0.08, shove: true };
  } else if (ctx.raises === 1) {
    p.range = { pct: p.pos === "BB" ? 0.45 : (p.pos === "SB" ? 0.15 : 0.18), shove: false };
  } else {
    p.range = { pct: 0.05, shove: false };
  }
}

function inRange(p, hand) {
  var r = p.range || { pct: 1, shove: false };
  return r.pct >= 1 || handPercentile(hand, r.shove) <= r.pct;
}

// ===== BOARD READING =====

function drawInfo(hole, board) {
  if (board.length >= 5 || board.length < 3) return { flush: false, straightOuts: 0 };
  var all = hole.concat(board);
  var flush = false;
  for (var s = 0; s < 4; s++) {
    var count = all.filter(function (c) { return c.suit === s; }).length;
    var mine = hole.some(function (c) { return c.suit === s; });
    if (count === 4 && mine) flush = true;
  }
  var ranks = new Set(all.map(function (c) { return c.rank; }));
  var boardRanks = new Set(board.map(function (c) { return c.rank; }));
  var outs = 0;
  if (straightHigh(ranks) < 0) {
    for (var r = 0; r < 13; r++) {
      if (ranks.has(r)) continue;
      ranks.add(r);
      boardRanks.add(r);
      var mineMakes = straightHigh(ranks) >= 0;
      var boardMakes = straightHigh(boardRanks) >= 0;
      ranks.delete(r);
      if (!board.some(function (c) { return c.rank === r; })) boardRanks.delete(r);
      if (mineMakes && !boardMakes) outs++;
    }
  }
  return { flush: flush, straightOuts: outs };
}

// 0 = dry (K72 rainbow) up to about 3 = very wet (JT9 two-tone)
function boardWetness(board) {
  var wet = 0;
  var suitCounts = [0, 0, 0, 0];
  board.forEach(function (c) { suitCounts[c.suit]++; });
  var maxSuit = Math.max.apply(null, suitCounts);
  if (maxSuit >= 3) wet += 1.5;
  else if (maxSuit === 2 && board.length <= 4) wet += 0.5;
  var ranks = Array.from(new Set(board.map(function (c) { return c.rank; }))).sort(function (a, b) { return a - b; });
  if (ranks.indexOf(12) !== -1) ranks.unshift(-1);
  var close3 = false, close2 = false;
  for (var i = 0; i < ranks.length; i++) {
    if (i + 2 < ranks.length && ranks[i + 2] - ranks[i] <= 4) close3 = true;
    if (i + 1 < ranks.length && ranks[i + 1] - ranks[i] <= 2) close2 = true;
  }
  if (close3) wet += 1;
  else if (close2) wet += 0.5;
  return wet;
}

// How a two-card holding connects with the board: strong, medium, weak, draw or air
function holdingClass(hole, board) {
  var made = evaluateHand(hole.concat(board));
  var boardOnly = evaluateHand(board);
  if (made.score[0] > boardOnly.score[0]) {
    if (made.score[0] >= 2) return "strong";
    var pairRank = made.score[1];
    var topBoard = Math.max.apply(null, board.map(function (c) { return c.rank; }));
    return pairRank >= topBoard ? "medium" : "weak";
  }
  var d = drawInfo(hole, board);
  if (d.flush || d.straightOuts >= 2) return "draw";
  return "air";
}

// Each bet or raise a player has made after the flop makes weak holdings less likely
const AGGRESSION_KEEP = { strong: 1, medium: 0.85, draw: 0.6, weak: 0.45, air: 0.25 };

// ===== EQUITY BY SIMULATION =====

function takeRandom(cards) {
  var i = Math.floor(Math.random() * cards.length);
  var card = cards[i];
  cards[i] = cards[cards.length - 1];
  cards.pop();
  return card;
}

function sampleHoldingFor(p, avail, board) {
  var aggr = p.aggr || 0;
  for (var t = 0; t < 60; t++) {
    var i = Math.floor(Math.random() * avail.length);
    var j = Math.floor(Math.random() * (avail.length - 1));
    if (j >= i) j++;
    var a = avail[i], b = avail[j];
    var pair = a.rank >= b.rank ? [a, b] : [b, a];
    if (!inRange(p, handNotation(pair))) continue;
    if (aggr > 0 && board.length >= 3) {
      var keep = Math.pow(AGGRESSION_KEEP[holdingClass(pair, board)], aggr);
      if (Math.random() > keep) continue;
    }
    var hi = Math.max(i, j), lo = Math.min(i, j);
    avail[hi] = avail[avail.length - 1]; avail.pop();
    avail[lo] = avail[avail.length - 1]; avail.pop();
    return pair;
  }
  return [takeRandom(avail), takeRandom(avail)];
}

// Share of the pot this seat wins against every live opponent's estimated range
function estimateEquity(seat, iterations) {
  var ps = players();
  var me = ps[seat];
  var board = table.hand.board;
  var opponents = [];
  ps.forEach(function (p, s) { if (s !== seat && !p.folded) opponents.push(p); });
  var known = me.cards.concat(board);
  var deck = [];
  for (var r = 0; r < 13; r++) for (var su = 0; su < 4; su++) {
    if (!known.some(function (c) { return c.rank === r && c.suit === su; })) deck.push({ rank: r, suit: su });
  }
  var won = 0;
  for (var it = 0; it < iterations; it++) {
    var avail = deck.slice();
    var holdings = opponents.map(function (p) { return sampleHoldingFor(p, avail, board); });
    var runout = board.slice();
    while (runout.length < 5) runout.push(takeRandom(avail));
    var mine = evaluateHand(me.cards.concat(runout)).score;
    var ties = 1;
    var lost = false;
    for (var k = 0; k < holdings.length; k++) {
      var cmp = compareScore(evaluateHand(holdings[k].concat(runout)).score, mine);
      if (cmp > 0) { lost = true; break; }
      if (cmp === 0) ties++;
    }
    if (!lost) won += 1 / ties;
  }
  return won / iterations;
}

function isInPosition(seat) {
  var order = POSTFLOP_ORDER.map(seatOfPos);
  var mine = order.indexOf(seat);
  return order.every(function (s, idx) { return s === seat || players()[s].folded || idx < mine; });
}

// ===== DECISIONS =====

// Pre-flop: chart lines from engine.js, stretched or shrunk by the bot's style
function styledPreflop(seat, ctx, sc) {
  var p = players()[seat];
  var st = styleOf(p);
  var rec = getRecommendation(sc);
  var short = sc.stack === "short";
  var pHand = handPercentile(sc.hand, short);
  var lines = rec.lines;
  if (sc.spot === "unopened") {
    return pHand <= lines[0] * st.open ? (short ? "All-In" : "Raise") : "Fold";
  }
  var aggressive = lines[0] * st.threeBet;
  var callBand = Math.max(0, (lines[1] - lines[0])) * st.call;
  if (pHand <= aggressive) return short ? "All-In" : "3-Bet";
  if (pHand <= aggressive + callBand) return "Call";
  return "Fold";
}

function betDecision(p, ctx, fraction) {
  var bb = ctx.bb;
  var maxTo = p.stack + p.bet;
  var amount = Math.max(bb, Math.round(ctx.pot * fraction));
  if (amount >= 0.7 * p.stack) return { type: "raise", to: maxTo };
  return { type: "raise", to: p.bet + amount };
}

function raiseDecision(p, ctx, multiple) {
  var maxTo = p.stack + p.bet;
  var to = Math.round(Math.max(ctx.currentBet * multiple, ctx.currentBet + ctx.minRaise));
  if (to >= 0.6 * maxTo) return { type: "raise", to: maxTo };
  return { type: "raise", to: to };
}

function botPostflop(seat, ctx) {
  var p = players()[seat];
  var h = table.hand;
  var st = styleOf(p);
  var opponents = players().filter(function (x, s) { return s !== seat && !x.folded; }).length;
  var equity = estimateEquity(seat, 220);
  var draw = drawInfo(p.cards, h.board);
  var strongDraw = draw.flush || draw.straightOuts >= 2;
  var anyDraw = strongDraw || draw.straightOuts === 1;
  var wet = boardWetness(h.board);
  var ip = isInPosition(seat);
  var river = ctx.street === "river";

  var valueLine = opponents === 1 ? 0.62 : (opponents === 2 ? 0.48 : 0.4);
  var monsterLine = opponents === 1 ? 0.85 : (opponents === 2 ? 0.72 : 0.62);
  var sizeBoost = p.style === "LAG" ? 0.1 : 0;

  if (ctx.toCall === 0) {
    if (equity >= monsterLine && !river && wet < 1.5 && Math.random() < st.slowplay) return { type: "check" };
    if (equity >= valueLine && Math.random() < st.valueBet) {
      return betDecision(p, ctx, (river || wet >= 1.5 ? 0.7 : 0.5) + sizeBoost);
    }
    if (ctx.street === "flop" && h.pfAggressor === seat && opponents <= 2 &&
        Math.random() < st.cbet * (opponents === 1 ? 1 : 0.6)) {
      return betDecision(p, ctx, (wet >= 1.5 ? 0.5 : 0.33) + sizeBoost);
    }
    if (!river && strongDraw && Math.random() < 0.45 * st.bluff) {
      return betDecision(p, ctx, 0.6 + sizeBoost);
    }
    var bluffRate = 0.12 * st.bluff * (ip ? 1.3 : 0.8) * (river ? 1.2 : 1);
    if (opponents === 1 && equity < 0.25 && Math.random() < bluffRate) {
      return betDecision(p, ctx, (river ? 0.75 : 0.6) + sizeBoost);
    }
    return { type: "check" };
  }

  var required = ctx.toCall / (ctx.pot + ctx.toCall);
  var realize = river ? 1 : (ip ? 1 : 0.9);
  var implied = (!river && anyDraw && p.stack > ctx.toCall * 4) ? (strongDraw ? 0.08 : 0.04) : 0;
  var effective = equity * realize + implied + st.callAdj;
  var canRaise = p.stack + p.bet > ctx.currentBet && p.stack > ctx.toCall;

  if (canRaise && equity >= monsterLine && Math.random() < st.raiseValue) return raiseDecision(p, ctx, 3);
  if (canRaise && ctx.street === "flop" && strongDraw && opponents === 1 && Math.random() < 0.15 * st.bluff) {
    return raiseDecision(p, ctx, 3);
  }
  if (effective >= required) return { type: "call" };
  return { type: "fold" };
}
