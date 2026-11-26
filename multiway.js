// Multiway Drill: the live $1/2 spot training sites skip. You raised before the flop, several players
// called, and now the flop is out. Someone leads into you, or it's checked to you. Every opponent's
// hand is drawn from a range that fits what they did before the flop and on this flop, and your
// decision is graded on equity against everyone still in.
// Uses engine.js for hand rankings (handPercentile, handNotation) and card helpers.

(function () {
  "use strict";

  // ===== CARDS & EVALUATION =====
  var RANK_WORDS = ["Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Jack", "Queen", "King", "Ace"];
  var RANK_PLURAL = ["Twos", "Threes", "Fours", "Fives", "Sixes", "Sevens", "Eights", "Nines", "Tens", "Jacks", "Queens", "Kings", "Aces"];

  function cardText(c) { return faceRank(c.rank) + SUITS[c.suit].sym; }
  function cardsText(cs) { return cs.map(cardText).join(" "); }
  function sameCard(a, b) { return a.rank === b.rank && a.suit === b.suit; }
  function fullDeck() { var d = []; for (var r = 0; r < 13; r++) for (var s = 0; s < 4; s++) d.push({ rank: r, suit: s }); return d; }
  function without(deck, used) { return deck.filter(function (c) { return !used.some(function (u) { return sameCard(u, c); }); }); }

  function straightHigh(has) {
    for (var hi = 12; hi >= 3; hi--) {
      var ok = true;
      for (var k = 0; k < 5; k++) { var r = hi - k; if (r < 0) r = 12; if (!has[r]) { ok = false; break; } }
      if (ok) return hi;
    }
    return -1;
  }

  // Best five of 5-7 cards. Score [category, tie-breakers...]; 8 straight flush ... 0 high card
  function evaluate(cards) {
    var counts = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    var bySuit = [[], [], [], []];
    for (var i = 0; i < cards.length; i++) { counts[cards[i].rank]++; bySuit[cards[i].suit].push(cards[i].rank); }
    var flushSuit = -1;
    for (var s = 0; s < 4; s++) if (bySuit[s].length >= 5) flushSuit = s;
    if (flushSuit >= 0) {
      var fh = [];
      bySuit[flushSuit].forEach(function (r) { fh[r] = true; });
      var sf = straightHigh(fh);
      if (sf >= 0) return [8, sf];
    }
    var quads = -1, trips = [], pairs = [], singles = [];
    for (var r = 12; r >= 0; r--) {
      if (counts[r] === 4) quads = r;
      else if (counts[r] === 3) trips.push(r);
      else if (counts[r] === 2) pairs.push(r);
      else if (counts[r] === 1) singles.push(r);
    }
    if (quads >= 0) { for (var k = 12; k >= 0; k--) if (k !== quads && counts[k]) return [7, quads, k]; return [7, quads]; }
    if (trips.length && (trips.length > 1 || pairs.length)) return [6, trips[0], trips.length > 1 ? Math.max(trips[1], pairs.length ? pairs[0] : -1) : pairs[0]];
    if (flushSuit >= 0) return [5].concat(bySuit[flushSuit].slice().sort(function (a, b) { return b - a; }).slice(0, 5));
    var st = straightHigh(counts.map(function (n) { return n > 0; }));
    if (st >= 0) return [4, st];
    if (trips.length) return [3, trips[0]].concat(singles.slice(0, 2));
    if (pairs.length >= 2) { var rest = singles.concat(pairs.slice(2)).sort(function (a, b) { return b - a; }); return [2, pairs[0], pairs[1], rest[0]]; }
    if (pairs.length) return [1, pairs[0]].concat(singles.slice(0, 3));
    return [0].concat(singles.slice(0, 5));
  }

  function compare(a, b) {
    for (var i = 0; i < Math.max(a.length, b.length); i++) {
      var x = a[i] === undefined ? -1 : a[i], y = b[i] === undefined ? -1 : b[i];
      if (x !== y) return x > y ? 1 : -1;
    }
    return 0;
  }

  function handName(sc) {
    switch (sc[0]) {
      case 8: return "Straight flush";
      case 7: return "Four " + RANK_PLURAL[sc[1]];
      case 6: return "Full house";
      case 5: return "Flush";
      case 4: return "Straight, " + RANK_WORDS[sc[1]] + " high";
      case 3: return "Three " + RANK_PLURAL[sc[1]];
      case 2: return "Two pair, " + RANK_PLURAL[sc[1]] + " and " + RANK_PLURAL[sc[2]];
      case 1: return "Pair of " + RANK_PLURAL[sc[1]];
      default: return RANK_WORDS[sc[1]] + " high";
    }
  }

  // Flush draw (four to a suit using a hole card) and open-ended straight draw
  function draws(hole, flop) {
    var all = hole.concat(flop);
    var flush = false;
    for (var s = 0; s < 4; s++) {
      var n = all.filter(function (c) { return c.suit === s; }).length;
      if (n === 4 && hole.some(function (c) { return c.suit === s; })) flush = true;
    }
    var has = [], boardHas = [];
    all.forEach(function (c) { has[c.rank] = true; });
    flop.forEach(function (c) { boardHas[c.rank] = true; });
    var outs = 0;
    if (straightHigh(has) < 0) {
      for (var r = 0; r < 13; r++) {
        if (has[r]) continue;
        has[r] = true; var mine = straightHigh(has) >= 0; has[r] = false;
        var bh = boardHas.slice(); bh[r] = true;
        if (mine && straightHigh(bh) < 0) outs++;
      }
    }
    return { flush: flush, oesd: outs >= 2, gutshot: outs === 1 };
  }

  // What a hand has on the flop, in the buckets players think in
  function classify(hole, flop) {
    var me = evaluate(hole.concat(flop));
    var board = evaluate(flop);
    var top = Math.max.apply(null, flop.map(function (c) { return c.rank; }));
    var d = draws(hole, flop);
    var pocket = hole[0].rank === hole[1].rank;
    var combo = d.flush || d.oesd;
    // The pair the player made with their own cards, if any (on a paired board, "two pair"
    // is really the board's pair plus one pair of yours, so it counts as one pair)
    var myPair = -1;
    if (board[0] === 0) {
      if (me[0] >= 2) return "monster";
      if (me[0] === 1) myPair = me[1];
    } else if (board[0] === 1) {
      if (me[0] >= 3) return "monster"; // trips with the board pair, full houses, straights, flushes
      if (me[0] === 2) myPair = me[1] === board[1] ? me[2] : me[1];
    } else {
      if (me[0] >= 6) return "monster"; // trips on board: only a full house or better is strong
    }
    if (myPair >= 0) {
      if ((pocket && myPair > top) || myPair === top) return combo ? "monster" : "toppair";
      return combo ? "draw" : "pair";
    }
    if (d.flush && d.oesd) return "monster";
    if (d.flush || d.oesd) return "draw";
    if (d.gutshot || hole.every(function (c) { return c.rank > top; })) return "weak";
    return "air";
  }
  var CLASS_LABEL = { monster: "two pair or better, sets and big combo draws", toppair: "top pair or an overpair", pair: "a smaller pair", draw: "a flush or straight draw", weak: "a gutshot or overcards", air: "nothing" };
  var CLASS_SHORT = { monster: "Two pair+", toppair: "Top pair", pair: "Small pair", draw: "Draw", weak: "Weak", air: "Air" };

  function wetness(flop) {
    var w = 0;
    var suits = [0, 0, 0, 0];
    flop.forEach(function (c) { suits[c.suit]++; });
    var m = Math.max.apply(null, suits);
    if (m === 3) w += 1.5; else if (m === 2) w += 0.5;
    var rs = flop.map(function (c) { return c.rank; }).sort(function (a, b) { return a - b; });
    if (rs[2] - rs[0] <= 4 && rs[0] !== rs[1] && rs[1] !== rs[2]) w += 1;
    else if (rs[1] - rs[0] <= 2 || rs[2] - rs[1] <= 2) w += 0.5;
    return w;
  }

  // ===== PLAYER MODELS (live $1/2) =====
  var STYLES = {
    TAG: { label: "TAG", name: "tight-aggressive", callTop: 0.2 },
    LAG: { label: "LAG", name: "loose-aggressive", callTop: 0.38 },
    NIT: { label: "Nit", name: "tight-passive", callTop: 0.14 },
    CALL: { label: "Station", name: "calling station", callTop: 0.5 }
  };
  var STYLE_POOL = ["CALL", "CALL", "CALL", "CALL", "LAG", "LAG", "TAG", "TAG", "NIT"];
  var NAMES = ["Rosa", "Kenji", "Marcus", "Priya", "Theo", "Amara", "Jonah", "Leni", "Olu", "Hana", "Sven", "Ines", "Dmitri", "Carmen", "Bo", "Lucia", "Tomas", "Mei", "Zara", "Rafa"];

  // Chance each style leads into the raiser with each kind of hand, by lead size
  var LEAD = {
    CALL: { small: [0.3, 0.35, 0.25, 0.2, 0.05, 0.02], half: [0.4, 0.3, 0.1, 0.2, 0.03, 0.01], pot: [0.7, 0.15, 0.02, 0.15, 0.01, 0] },
    NIT: { small: [0.3, 0.25, 0.1, 0.1, 0, 0], half: [0.5, 0.2, 0.03, 0.1, 0, 0], pot: [0.6, 0.05, 0, 0.08, 0, 0] },
    LAG: { small: [0.4, 0.4, 0.25, 0.35, 0.2, 0.12], half: [0.5, 0.4, 0.15, 0.45, 0.2, 0.12], pot: [0.6, 0.3, 0.1, 0.4, 0.25, 0.15] },
    TAG: { small: [0.45, 0.35, 0.12, 0.25, 0.08, 0.05], half: [0.6, 0.35, 0.08, 0.35, 0.08, 0.05], pot: [0.55, 0.2, 0.03, 0.3, 0.05, 0.03] }
  };
  // Chance each style continues (calls a bet) with each kind of hand
  var CONTINUE = { CALL: [1, 0.95, 0.7, 0.9, 0.35, 0.08], TAG: [1, 0.75, 0.3, 0.75, 0.15, 0.02], LAG: [1, 0.85, 0.45, 0.85, 0.3, 0.1], NIT: [1, 0.6, 0.15, 0.5, 0.05, 0] };
  var CLASSES = ["monster", "toppair", "pair", "draw", "weak", "air"];
  function ci(cls) { return CLASSES.indexOf(cls); }

  // Before the flop: a live caller's range. Top ~3% would have 3-bet (Stations still flat some of it).
  function inCallRange(hole, style) {
    var p = handPercentile(handNotation(hole[0].rank >= hole[1].rank ? hole : [hole[1], hole[0]]), false);
    var floor = style === "CALL" ? 0.012 : 0.03;
    return p > floor && p <= STYLES[style].callTop;
  }

  // Probability a player with this hand took the action we saw
  function actionProb(v, hole, flop) {
    var cls = ci(classify(hole, flop));
    if (v.act === "lead") return LEAD[v.style][v.size][cls];
    if (v.act === "check") return 1 - LEAD[v.style].half[cls] * 0.8;
    if (v.act === "call") return CONTINUE[v.style][cls];
    return 1; // still to act: no information yet
  }

  // Every two-card hand a villain could hold, weighted by how well it fits their pre-flop call and
  // their action on this flop. Built once per spot, then sampled quickly.
  function buildRange(v, deck, flop) {
    var combos = [], cum = [], total = 0;
    for (var i = 0; i < deck.length; i++) {
      for (var j = i + 1; j < deck.length; j++) {
        var hole = deck[i].rank >= deck[j].rank ? [deck[i], deck[j]] : [deck[j], deck[i]];
        if (!inCallRange(hole, v.style)) continue;
        var w = actionProb(v, hole, flop);
        if (w <= 0) continue;
        total += w;
        combos.push(hole);
        cum.push(total);
      }
    }
    return { combos: combos, cum: cum, total: total };
  }

  function cardKey(c) { return c.rank * 4 + c.suit; }

  // Draw a hand from a range that doesn't use any card in `used` (a set of card keys)
  function sampleFrom(range, used) {
    if (!range.total) return null;
    for (var tries = 0; tries < 300; tries++) {
      var x = Math.random() * range.total;
      var lo = 0, hi = range.cum.length - 1;
      while (lo < hi) { var mid = (lo + hi) >> 1; if (range.cum[mid] < x) lo = mid + 1; else hi = mid; }
      var h = range.combos[lo];
      if (!used[cardKey(h[0])] && !used[cardKey(h[1])]) return h;
    }
    return null;
  }

  function sampleHand(v, deck, flop) {
    var used = {};
    var inDeck = {};
    deck.forEach(function (c) { inDeck[cardKey(c)] = true; });
    for (var k = 0; k < 52; k++) if (!inDeck[k]) used[k] = true;
    return sampleFrom(buildRange(v, deck, flop), used);
  }

  // ===== SPOT GENERATION =====
  var PRE_ORDER = ["UTG", "UTG+1", "UTG+2", "LJ", "HJ", "CO", "BTN", "SB", "BB"];
  var POST_ORDER = ["SB", "BB", "UTG", "UTG+1", "UTG+2", "LJ", "HJ", "CO", "BTN"];
  var HERO_HANDS = ["KK", "QQ", "JJ", "TT", "99", "AKs", "AKo", "AQs", "AQo", "AJs", "KQs"];
  var settings = { callers: "mixed", spot: "mixed", hand: "mixed", reveal: true };
  var stats = { reps: 0, right: 0, close: 0, byType: { lead: [0, 0], checked: [0, 0] }, streak: 0, best: 0 };
  var spot = null;

  function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function pickOf(list) { return list[Math.floor(Math.random() * list.length)]; }

  function heroHoleFor(note) {
    var ranks = "23456789TJQKA";
    var hi = ranks.indexOf(note[0]), lo = ranks.indexOf(note[1]);
    var s1 = Math.floor(Math.random() * 4), s2;
    if (note.length === 2) { do { s2 = Math.floor(Math.random() * 4); } while (s2 === s1); }
    else if (note[2] === "s") s2 = s1;
    else { do { s2 = Math.floor(Math.random() * 4); } while (s2 === s1); }
    return [{ rank: hi, suit: s1 }, { rank: lo, suit: s2 }];
  }

  function heroFits(hole, flop) {
    var cls = classify(hole, flop);
    var top = Math.max.apply(null, flop.map(function (c) { return c.rank; }));
    var over = hole[0].rank === hole[1].rank && hole[0].rank > top;
    if (settings.hand === "overpair") return over;
    if (settings.hand === "toppair") return cls === "toppair" && !over;
    return cls !== "air" || Math.random() < 0.35;
  }

  function newSpot() {
    var hole, flop, tries = 0;
    do {
      hole = heroHoleFor(pickOf(HERO_HANDS));
      var deck = shuffle(without(fullDeck(), hole));
      flop = deck.slice(0, 3).sort(function (a, b) { return b.rank - a.rank; });
      tries++;
      // Lean toward the coordinated boards that make these spots hard
      if (wetness(flop) < 1 && Math.random() < 0.55) continue;
    } while (!heroFits(hole, flop) && tries < 3000);

    var heroPos = pickOf(["UTG", "UTG+1", "UTG+2", "LJ", "HJ", "CO", "BTN"]);
    var behindPre = PRE_ORDER.slice(PRE_ORDER.indexOf(heroPos) + 1);
    var want = settings.callers === "small" ? 2 + Math.floor(Math.random() * 2) : settings.callers === "mid" ? 4 + Math.floor(Math.random() * 2)
      : settings.callers === "big" ? 6 + Math.floor(Math.random() * 2) : 2 + Math.floor(Math.random() * 6);
    // Limpers in front call too: let a few early seats join when the field is big
    var pool = behindPre.slice();
    if (want > pool.length) pool = pool.concat(PRE_ORDER.slice(0, PRE_ORDER.indexOf(heroPos)));
    var callers = shuffle(pool).slice(0, Math.min(want, pool.length));
    var names = shuffle(NAMES.slice());
    var openTo = 15;
    var pot = openTo * (callers.length + 1) + (callers.indexOf("SB") === -1 ? 1 : 0) + (callers.indexOf("BB") === -1 ? 2 : 0);

    var order = POST_ORDER.filter(function (p) { return p === heroPos || callers.indexOf(p) !== -1; });
    var heroIdx = order.indexOf(heroPos);
    var before = order.slice(0, heroIdx), after = order.slice(heroIdx + 1);
    var type = settings.spot === "mixed" ? (Math.random() < 0.6 ? "lead" : "checked") : settings.spot;
    if (!before.length) type = "checked";

    var villains = order.filter(function (p) { return p !== heroPos; }).map(function (pos, i) {
      return { pos: pos, name: names[i], style: pickOf(STYLE_POOL), act: before.indexOf(pos) !== -1 ? "check" : "behind" };
    });
    var bet = 0;
    if (type === "lead") {
      var leader = villains[Math.floor(Math.random() * before.length)];
      leader.act = "lead";
      leader.size = pickOf(["small", "half", "pot", "pot"]);
      bet = Math.round(pot * { small: 0.33, half: 0.55, pot: 1 }[leader.size]);
      leader.amount = bet;
      // Players between the leader and Hero call or fold, decided from a hand that fits what they did
      var seenLeader = false;
      villains.forEach(function (v) {
        if (v === leader) { seenLeader = true; return; }
        if (seenLeader && v.act === "check") v.act = "pending";
      });
    }
    // Deal everyone's actual hand, consistent with their actions so far
    var used = hole.concat(flop);
    var dk = without(fullDeck(), used);
    villains.forEach(function (v) {
      if (v.act === "pending") {
        var h = sampleHand({ style: v.style, act: "behind" }, dk, flop);
        var cont = Math.random() < CONTINUE[v.style][ci(classify(h, flop))];
        v.act = cont ? "call" : "fold";
        if (cont) v.amount = bet;
        // Redraw so the hand matches the action we're showing
        h = cont ? sampleHand(v, dk, flop) : h;
        v.hole = h;
      } else {
        v.hole = sampleHand(v, dk, flop);
      }
      dk = without(dk, v.hole);
    });
    var potNow = pot + villains.reduce(function (s, v) { return s + (v.act === "lead" || v.act === "call" ? bet : 0); }, 0);
    spot = { hole: hole, flop: flop, heroPos: heroPos, villains: villains, type: type, pot: pot, potNow: potNow, bet: bet, openTo: openTo,
      runout: shuffle(dk.slice()).slice(0, 2), choice: null, analysis: null };
    render();
  }

  // ===== EQUITY =====
  // Monte Carlo: redraw every opponent's hand from what fits their actions, deal turn and river, and
  // split the pot among winners. Players still to act behind Hero are in only if they'd call.
  function equity(opts, iters) {
    var s = spot;
    var base = without(fullDeck(), s.hole.concat(s.flop));
    var share = 0, n = 0;
    var vsLeader = 0, leaderN = 0;
    var mix = { monster: 0, toppair: 0, pair: 0, draw: 0, weak: 0, air: 0 };
    var leader = s.villains.find(function (v) { return v.act === "lead"; });
    var fieldSize = 0;
    var ranges = s.villains.map(function (v) { return v.act === "fold" ? null : buildRange(v, base, s.flop); });
    var fixed = {};
    s.hole.concat(s.flop).forEach(function (c) { fixed[cardKey(c)] = true; });
    for (var it = 0; it < iters; it++) {
      var used = Object.assign({}, fixed);
      var hands = [];
      var ok = true;
      for (var k = 0; k < s.villains.length; k++) {
        var v = s.villains[k];
        if (v.act === "fold") continue;
        var h = sampleFrom(ranges[k], used);
        if (!h) { ok = false; break; }
        used[cardKey(h[0])] = true; used[cardKey(h[1])] = true;
        if (v.act === "behind" && opts.facingBet && Math.random() >= CONTINUE[v.style][ci(classify(h, s.flop))]) continue;
        hands.push({ v: v, hole: h });
        if (v === leader) mix[classify(h, s.flop)]++;
      }
      if (!ok) continue;
      var deck = base.filter(function (c) { return !used[cardKey(c)]; });
      var i1 = Math.floor(Math.random() * deck.length), i2 = Math.floor(Math.random() * (deck.length - 1));
      if (i2 >= i1) i2++;
      var board = s.flop.concat([deck[i1], deck[i2]]);
      var mine = evaluate(s.hole.concat(board));
      var best = mine, winners = 1, heroWins = true;
      hands.forEach(function (x) {
        var sc = evaluate(x.hole.concat(board));
        var c = compare(sc, best);
        if (c > 0) { best = sc; winners = 1; heroWins = false; }
        else if (c === 0) { winners++; }
        x.sc = sc;
      });
      if (heroWins) share += 1 / winners;
      fieldSize += hands.length;
      if (leader) {
        var lh = hands.find(function (x) { return x.v === leader; });
        if (lh) { var c2 = compare(mine, lh.sc); vsLeader += c2 > 0 ? 1 : (c2 === 0 ? 0.5 : 0); leaderN++; }
      }
      n++;
    }
    var mixTotal = Object.keys(mix).reduce(function (a, k) { return a + mix[k]; }, 0) || 1;
    Object.keys(mix).forEach(function (k) { mix[k] = mix[k] / mixTotal; });
    return { eq: n ? share / n : 0, vsLeader: leaderN ? vsLeader / leaderN : null, mix: mix, field: n ? fieldSize / n : 0 };
  }

  function grade(choice) {
    var s = spot;
    var facing = s.type === "lead";
    var a = equity({ facingBet: facing }, 1500);
    var players = Math.round(a.field) + 1;
    var fair = 1 / Math.max(2, players);
    var behind = s.villains.filter(function (v) { return v.act === "behind"; }).length;
    var res = { a: a, fair: fair, players: players };
    if (facing) {
      var toCall = s.bet;
      var needed = toCall / (s.potNow + toCall);
      // Equity you actually realize multiway: players behind can raise, and you'll face more bets
      var realize = behind ? 0.8 : 0.9;
      var best, ok = [];
      if (a.eq >= 0.55) { best = "raise"; ok = ["call"]; }
      else if (a.eq * realize >= needed) { best = "call"; if (a.eq >= 0.45) ok = ["raise"]; }
      else { best = "fold"; if (a.eq * realize >= needed * 0.85) ok = ["call"]; }
      res.best = best; res.ok = ok; res.needed = needed; res.realize = realize;
    } else {
      var w = wetness(s.flop);
      var best2, ok2 = [];
      if (a.eq >= 0.5) { best2 = w >= 1.5 ? "betbig" : "bethalf"; ok2 = [best2 === "betbig" ? "bethalf" : "betbig"]; }
      else if (a.eq >= Math.max(fair * 1.6, 0.35)) { best2 = "check"; ok2 = ["bethalf"]; }
      else { best2 = "check"; }
      res.best = best2; res.ok = ok2; res.wet = w;
    }
    res.result = choice === res.best ? "right" : (res.ok.indexOf(choice) !== -1 ? "close" : "wrong");
    return res;
  }

  function choose(choice) {
    if (!spot || spot.choice) return;
    spot.choice = choice;
    spot.analysis = grade(choice);
    stats.reps += 1;
    var key = spot.type === "lead" ? "lead" : "checked";
    stats.byType[key][1] += 1;
    if (spot.analysis.result === "right") { stats.right += 1; stats.byType[key][0] += 1; stats.streak += 1; stats.best = Math.max(stats.best, stats.streak); }
    else { stats.streak = 0; if (spot.analysis.result === "close") stats.close += 1; }
    save();
    render();
  }

  // ===== STORAGE =====
  var KEY = "pokerapp.multiway.v1";
  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) { var d = JSON.parse(raw); if (d.stats) stats = Object.assign(stats, d.stats); if (d.settings) settings = Object.assign(settings, d.settings); }
    } catch (e) { /* fresh */ }
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify({ stats: stats, settings: settings })); } catch (e) { /* this visit only */ } }

  // ===== RENDER =====
  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined && text !== null) n.textContent = text; return n; }
  function money(x) { return "$" + Math.round(x); }
  function pctText(x) { return Math.round(x * 100) + "%"; }
  function cardEl(c, size) {
    var n = el("div", "card " + (size || "") + " " + SUITS[c.suit].color);
    n.setAttribute("aria-label", faceRank(c.rank) + " of " + SUITS[c.suit].name);
    n.append(el("span", "card-rank", faceRank(c.rank)), el("span", "card-suit", SUITS[c.suit].sym));
    return n;
  }
  function backEl(size) { var n = el("div", "card back " + (size || "")); n.setAttribute("aria-hidden", "true"); return n; }

  function actText(v) {
    var s = spot;
    if (v.act === "lead") return "Leads " + money(v.amount) + " (" + { small: "a third of the pot", half: "half the pot", pot: "full pot" }[v.size] + ")";
    if (v.act === "call") return "Calls " + money(v.amount);
    if (v.act === "fold") return "Folds";
    if (v.act === "check") return "Checks";
    return s.type === "lead" ? "Still to act" : "Acts after you";
  }

  function render() {
    renderSettings();
    renderStats();
    if (!spot) return;
    var s = spot;
    var done = !!s.choice;
    $("spot-line").textContent = "Live $1/2 · You raised to " + money(s.openTo) + " from the " + s.heroPos + " and " + s.villains.length +
      (s.villains.length === 1 ? " player" : " players") + " called · Pot " + money(s.potNow);

    var row = $("opponents");
    row.replaceChildren();
    s.villains.forEach(function (v) {
      var plate = el("div", "opp " + v.act + (done ? " done" : ""));
      var head = el("div", "opp-head");
      head.append(el("strong", null, v.name), el("span", "opp-pos", v.pos));
      plate.append(head);
      plate.append(el("span", "opp-style " + v.style.toLowerCase(), STYLES[v.style].label));
      var cards = el("div", "opp-cards");
      if (done && settings.reveal && v.hole) v.hole.forEach(function (c) { cards.append(cardEl(c, "sm")); });
      else if (v.act !== "fold") cards.append(backEl("sm"), backEl("sm"));
      plate.append(cards);
      plate.append(el("span", "opp-act", actText(v)));
      if (done && settings.reveal && v.hole && v.act !== "fold") plate.append(el("span", "opp-has", handName(evaluate(v.hole.concat(s.flop.concat(s.runout))))));
      row.append(plate);
    });

    var board = $("board");
    board.replaceChildren();
    s.flop.forEach(function (c) { board.append(cardEl(c, "lg")); });
    if (done && settings.reveal) s.runout.forEach(function (c) { board.append(cardEl(c, "lg runout")); });
    $("board-note").textContent = done && settings.reveal ? "Turn and river shown: one way this hand could finish" : "The flop";

    var mine = $("hero-cards");
    mine.replaceChildren();
    s.hole.forEach(function (c) { mine.append(cardEl(c, "xl")); });
    var cls = classify(s.hole, s.flop);
    var topRank = Math.max.apply(null, s.flop.map(function (c) { return c.rank; }));
    var over = s.hole[0].rank === s.hole[1].rank && s.hole[0].rank > topRank;
    $("hero-has").textContent = handName(evaluate(s.hole.concat(s.flop))) + " · " + (over ? "Overpair" : CLASS_SHORT[cls]);

    renderControls();
    renderResult();
  }

  function renderControls() {
    var box = $("controls");
    box.replaceChildren();
    var s = spot;
    var row = el("div", "controls-row");
    function btn(label, cls, choice, key) {
      var b = el("button", "btn " + cls, label);
      b.type = "button"; b.dataset.key = key;
      if (s.choice) {
        b.disabled = true;
        if (s.analysis.best === choice) b.classList.add("best");
        if (s.choice === choice) b.classList.add("picked");
      }
      b.addEventListener("click", function () { choose(choice); });
      row.append(b);
    }
    if (s.type === "lead") {
      var raiseTo = s.bet * 3;
      btn("Fold", "fold", "fold", "f");
      btn("Call " + money(s.bet), "call", "call", "c");
      btn("Raise to " + money(raiseTo), "raise", "raise", "r");
    } else {
      btn("Check", "call", "check", "c");
      btn("Bet half pot (" + money(s.potNow * 0.5) + ")", "raise", "bethalf", "h");
      btn("Bet pot (" + money(s.potNow) + ")", "raise strong", "betbig", "p");
    }
    box.append(row);
    if (s.choice) {
      var next = el("button", "btn primary big", "Next spot");
      next.type = "button"; next.id = "next-spot";
      next.addEventListener("click", newSpot);
      var nrow = el("div", "controls-row");
      nrow.append(next);
      box.append(nrow);
      box.append(el("p", "controls-note", "Space for the next spot."));
    } else {
      box.append(el("p", "controls-note", s.type === "lead" ? "Keys: F fold · C call · R raise" : "Keys: C check · H bet half · P bet pot"));
    }
  }

  function renderResult() {
    var box = $("result");
    box.replaceChildren();
    var s = spot;
    if (!s.choice) {
      box.append(el("p", "muted", s.type === "lead"
        ? "Someone led into you. Think about what that bet means from that kind of player, how many people are still in, and the price."
        : "It's checked to you. Big field: bet when you're likely best and need protection, check when you're only medium strength."));
      return;
    }
    var r = s.analysis;
    var label = { fold: "Fold", call: "Call", raise: "Raise", check: "Check", bethalf: "Bet half pot", betbig: "Bet pot" };
    var head = el("div", "result-head " + r.result);
    head.append(el("span", "result-title", r.result === "right" ? "Right play" : (r.result === "close" ? "Close, but not best" : "Not this time")),
      el("span", "result-sub", "Best: " + label[r.best]));
    box.append(head);

    var nums = el("dl", "nums");
    var items = [["Your equity", pctText(r.a.eq)], ["Fair share", pctText(r.fair) + " (" + r.players + " players)"]];
    if (s.type === "lead") items.push(["Needed to call", pctText(r.needed)], ["Vs the leader alone", r.a.vsLeader === null ? "–" : pctText(r.a.vsLeader)]);
    items.forEach(function (t) { var d = el("div"); d.append(el("dt", null, t[0]), el("dd", null, t[1])); nums.append(d); });
    box.append(nums);

    var leader = s.villains.find(function (v) { return v.act === "lead"; });
    var why = [];
    if (leader) {
      var m = r.a.mix;
      var strong = m.monster + m.toppair;
      why.push("A " + { small: "small", half: "half-pot", pot: "full-pot" }[leader.size] + " lead from " + leader.name + " (" + STYLES[leader.style].name + ") is " +
        pctText(m.monster) + " " + CLASS_LABEL.monster + ", " + pctText(m.toppair) + " top pair, " + pctText(m.draw) + " draws and " +
        pctText(m.pair + m.weak + m.air) + " weaker hands here.");
      var callers = s.villains.filter(function (v) { return v.act === "call"; }).length;
      var behind = s.villains.filter(function (v) { return v.act === "behind"; }).length;
      if (callers) why.push(callers + (callers === 1 ? " player has" : " players have") + " already called, which narrows them to pairs and draws too.");
      if (behind) why.push(behind + (behind === 1 ? " player is" : " players are") + " still to act behind you and can raise, so you'd realize only about " + pctText(r.realize) + " of your equity.");
      why.push("Calling " + money(s.bet) + " into " + money(s.potNow) + " needs " + pctText(r.needed) + "; you have " + pctText(r.a.eq) +
        (r.best === "fold" ? ", not enough once you count what you'll actually realize." : r.best === "call" ? ", enough to continue but not to build the pot." : ", strong enough to raise for value and charge the draws."));
    } else {
      why.push("With " + (r.players - 1) + " opponents, your fair share of the pot is " + pctText(r.fair) + ". You have " + pctText(r.a.eq) + ".");
      if (r.best === "check") why.push(r.a.eq >= 0.35 ? "That's a decent but medium-strength hand in a big field: bets mostly get called by better hands and draws, so check and keep the pot small."
        : "You're behind the field on average. Betting into this many players gets called by better, so check and give up if it gets bet big.");
      else why.push("You're ahead of the field and " + (r.wet >= 1.5 ? "the board is wet, so bet big to charge all the draws." : "the board is fairly dry, so a half-pot bet gets called by worse."));
    }
    var p = el("p", "why", why.join(" "));
    box.append(p);
    box.append(el("p", "muted small", "Equity is simulated against hands that fit each player's pre-flop call and what they did on this flop, " +
      "with players behind you in the pot only when they'd call. Live player tendencies are modelled, so treat the numbers as close, not exact."));
  }

  function renderSettings() {
    [["set-callers", "callers"], ["set-spot", "spot"], ["set-hand", "hand"]].forEach(function (x) { $(x[0]).value = settings[x[1]]; });
  }

  function renderStats() {
    var dl = $("stats");
    dl.replaceChildren();
    var t = stats.byType;
    [["Reps", String(stats.reps)], ["Best play", stats.reps ? pctText(stats.right / stats.reps) : "–"], ["Streak", String(stats.streak)], ["Best streak", String(stats.best)]]
      .forEach(function (x) { var d = el("div"); d.append(el("dt", null, x[0]), el("dd", null, x[1])); dl.append(d); });
    $("stats-split").textContent = stats.reps ? "Facing a lead: " + (t.lead[1] ? pctText(t.lead[0] / t.lead[1]) + " of " + t.lead[1] : "–") +
      " · Checked to you: " + (t.checked[1] ? pctText(t.checked[0] / t.checked[1]) + " of " + t.checked[1] : "–") + (stats.close ? " · Close calls: " + stats.close : "") : "";
  }

  // ===== WIRING =====
  [["set-callers", "callers"], ["set-spot", "spot"], ["set-hand", "hand"]].forEach(function (x) {
    $(x[0]).addEventListener("change", function () { settings[x[1]] = $(x[0]).value; save(); newSpot(); });
  });
  $("reset-drill").addEventListener("click", function () {
    var b = $("reset-drill");
    if (b.dataset.armed !== "1") { b.dataset.armed = "1"; b.textContent = "Tap again to reset"; return; }
    b.dataset.armed = ""; b.textContent = "Reset stats";
    stats = { reps: 0, right: 0, close: 0, byType: { lead: [0, 0], checked: [0, 0] }, streak: 0, best: 0 };
    save(); render();
  });
  document.addEventListener("keydown", function (e) {
    if (e.target.tagName === "SELECT" || e.metaKey || e.ctrlKey || e.altKey) return;
    if (spot && spot.choice && (e.key === " " || e.key === "Enter")) {
      if (e.target.tagName === "BUTTON" && e.target.id !== "next-spot") return;
      e.preventDefault(); newSpot(); return;
    }
    var b = document.querySelector('#controls [data-key="' + e.key.toLowerCase() + '"]');
    if (b && !b.disabled) { e.preventDefault(); b.click(); }
  });

  window.multiwayDrill = { evaluate: evaluate, classify: classify, equity: equity, state: function () { return spot; }, stats: function () { return stats; }, newSpot: newSpot, choose: choose };

  load();
  newSpot();
})();
