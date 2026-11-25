// Dealer Hold'em: you against the dealer, using the standard casino rules for this format.
// Ante and Blind (equal), optional Trips side bet. Bet 4x or 3x before the flop, 2x on the flop,
// or 1x on the river (or fold). The dealer needs a pair or better to qualify; if not, the Ante pushes.
// The trainer grades every decision: basic strategy before and on the flop, exact EV on the river.

(function () {
  "use strict";

  // ===== CARDS =====
  var RANKS = "23456789TJQKA";
  var RANK_WORDS = ["Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Jack", "Queen", "King", "Ace"];
  var RANK_PLURAL = ["Twos", "Threes", "Fours", "Fives", "Sixes", "Sevens", "Eights", "Nines", "Tens", "Jacks", "Queens", "Kings", "Aces"];
  var SUITS = [
    { sym: "♠", color: "black", name: "spades" },
    { sym: "♥", color: "red", name: "hearts" },
    { sym: "♦", color: "red", name: "diamonds" },
    { sym: "♣", color: "black", name: "clubs" }
  ];

  function faceRank(r) { return r === 8 ? "10" : RANKS[r]; }
  function cardText(c) { return faceRank(c.rank) + SUITS[c.suit].sym; }
  function cardsText(cs) { return cs.map(cardText).join(" "); }

  function newDeck() {
    var d = [];
    for (var r = 0; r < 13; r++) for (var s = 0; s < 4; s++) d.push({ rank: r, suit: s });
    for (var i = d.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = d[i]; d[i] = d[j]; d[j] = t;
    }
    return d;
  }

  // ===== HAND EVALUATION (best five of 5-7 cards) =====
  // Score: [category, tie-breakers...]. 8 straight flush, 7 quads, 6 full house, 5 flush,
  // 4 straight, 3 trips, 2 two pair, 1 pair, 0 high card.
  function straightHigh(has) {
    for (var hi = 12; hi >= 3; hi--) {
      var ok = true;
      for (var k = 0; k < 5; k++) {
        var r = hi - k;
        if (r < 0) r = 12; // the wheel: A-2-3-4-5
        if (!has[r]) { ok = false; break; }
      }
      if (ok) return hi;
    }
    return -1;
  }

  function evaluate(cards) {
    var counts = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    var bySuit = [[], [], [], []];
    cards.forEach(function (c) { counts[c.rank]++; bySuit[c.suit].push(c.rank); });
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
    if (quads >= 0) {
      var kick = -1;
      for (var k = 12; k >= 0; k--) if (k !== quads && counts[k] > 0) { kick = k; break; }
      return [7, quads, kick];
    }
    if (trips.length && (trips.length > 1 || pairs.length)) {
      return [6, trips[0], trips.length > 1 ? Math.max(trips[1], pairs[0] === undefined ? -1 : pairs[0]) : pairs[0]];
    }
    if (flushSuit >= 0) return [5].concat(bySuit[flushSuit].slice().sort(function (a, b) { return b - a; }).slice(0, 5));
    var has = counts.map(function (n) { return n > 0; });
    var st = straightHigh(has);
    if (st >= 0) return [4, st];
    if (trips.length) return [3, trips[0]].concat(singles.slice(0, 2));
    if (pairs.length >= 2) {
      var rest = singles.concat(pairs.slice(2)).sort(function (a, b) { return b - a; });
      return [2, pairs[0], pairs[1], rest[0]];
    }
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
      case 8: return sc[1] === 12 ? "Royal flush" : "Straight flush, " + RANK_WORDS[sc[1]] + " high";
      case 7: return "Four " + RANK_PLURAL[sc[1]];
      case 6: return "Full house, " + RANK_PLURAL[sc[1]] + " full of " + RANK_PLURAL[sc[2]];
      case 5: return "Flush, " + RANK_WORDS[sc[1]] + " high";
      case 4: return "Straight, " + RANK_WORDS[sc[1]] + " high";
      case 3: return "Three " + RANK_PLURAL[sc[1]];
      case 2: return "Two pair, " + RANK_PLURAL[sc[1]] + " and " + RANK_PLURAL[sc[2]];
      case 1: return "Pair of " + RANK_PLURAL[sc[1]];
      default: return RANK_WORDS[sc[1]] + " high";
    }
  }

  // ===== PAY TABLES =====
  // Blind pays only when you win with a straight or better; otherwise it pushes on a win.
  var BLIND_PAY = { royal: 500, 8: 50, 7: 10, 6: 3, 5: 1.5, 4: 1 };
  var BLIND_TEXT = { royal: "500 to 1", 8: "50 to 1", 7: "10 to 1", 6: "3 to 1", 5: "3 to 2", 4: "1 to 1" };
  var BLIND_ROWS = [["Royal flush", "500 to 1"], ["Straight flush", "50 to 1"], ["Four of a kind", "10 to 1"], ["Full house", "3 to 1"],
    ["Flush", "3 to 2"], ["Straight", "1 to 1"], ["Anything less", "Push"]];
  // Trips pays on your final hand whatever the dealer has
  var TRIPS_PAY = { royal: 50, 8: 40, 7: 30, 6: 8, 5: 7, 4: 4, 3: 3 };
  var TRIPS_ROWS = [["Royal flush", "50 to 1"], ["Straight flush", "40 to 1"], ["Four of a kind", "30 to 1"], ["Full house", "8 to 1"],
    ["Flush", "7 to 1"], ["Straight", "4 to 1"], ["Three of a kind", "3 to 1"], ["Anything less", "Loses"]];

  function payKey(sc) { return sc[0] === 8 && sc[1] === 12 ? "royal" : sc[0]; }

  // ===== STRATEGY =====
  // Basic strategy for this format (bet 4x pre-flop, 2x on the flop, 1x or fold on the river).
  function preflopAdvice(hole) {
    var hi = Math.max(hole[0].rank, hole[1].rank), lo = Math.min(hole[0].rank, hole[1].rank);
    var suited = hole[0].suit === hole[1].suit;
    var why = null;
    if (hi === lo) why = lo >= 1 ? "Pocket pairs of 3s and up bet 4×" : null;
    else if (hi === 12) why = "Any hand with an ace bets 4×";
    else if (hi === 11) why = suited ? "Any suited king bets 4×" : (lo >= 3 ? "King with a 5 or better bets 4×" : null);
    else if (hi === 10) why = suited ? (lo >= 4 ? "Suited queen with a 6 or better bets 4×" : null) : (lo >= 6 ? "Queen with an 8 or better bets 4×" : null);
    else if (hi === 9) why = suited ? (lo >= 6 ? "Suited jack with an 8 or better bets 4×" : null) : (lo === 8 ? "Jack-ten bets 4×" : null);
    if (why) return { action: "bet4", label: "Bet 4×", why: why + ". When a hand is good enough to bet before the flop, 4× earns more than 3×." };
    var name = hi === lo ? "Pocket deuces" : faceRank(hi) + faceRank(lo) + (suited ? " suited" : " offsuit");
    return { action: "check", label: "Check", why: name + " isn't on the 4× list. Check and see the flop for free; you can still bet 2× there." };
  }

  function hiddenPair(hole, board) {
    if (hole[0].rank === hole[1].rank) return hole[0].rank;
    var best = -1;
    hole.forEach(function (h) { if (board.some(function (b) { return b.rank === h.rank; })) best = Math.max(best, h.rank); });
    return best;
  }

  function flopAdvice(hole, flop) {
    var me = evaluate(hole.concat(flop));
    var boardOnly = evaluate(flop);
    if (me[0] >= 2 && me[0] > boardOnly[0]) {
      return { action: "bet2", label: "Bet 2×", why: "You have " + handName(me).toLowerCase() + ". Two pair or better bets 2× on the flop." };
    }
    var hp = hiddenPair(hole, flop);
    var pocketDeuces = hole[0].rank === 0 && hole[1].rank === 0;
    if (hp >= 0 && !pocketDeuces) {
      return { action: "bet2", label: "Bet 2×", why: "You have a pair of " + RANK_PLURAL[hp].toLowerCase() + " using your own card. Any hidden pair except pocket deuces bets 2×." };
    }
    for (var s = 0; s < 4; s++) {
      var n = hole.concat(flop).filter(function (c) { return c.suit === s; }).length;
      var highHole = hole.some(function (c) { return c.suit === s && c.rank >= 8; });
      if (n === 4 && highHole) {
        return { action: "bet2", label: "Bet 2×", why: "Four to a flush with a 10 or better of that suit in your hand bets 2×." };
      }
    }
    return { action: "check", label: "Check", why: (pocketDeuces ? "Pocket deuces are the exception: check them. " : "") +
      "No two pair, no hidden pair and no strong flush draw, so check and decide on the river." };
  }

  // River: exact EV by dealing the dealer every possible two cards from what you can't see
  function riverAnalysis(hole, board) {
    var seen = hole.concat(board);
    var unseen = [];
    for (var r = 0; r < 13; r++) for (var s = 0; s < 4; s++) {
      if (!seen.some(function (c) { return c.rank === r && c.suit === s; })) unseen.push({ rank: r, suit: s });
    }
    var me = evaluate(seen);
    var blindWin = BLIND_PAY[payKey(me)] || 0;
    var total = 0, n = 0, wins = 0, ties = 0;
    for (var i = 0; i < unseen.length; i++) {
      for (var j = i + 1; j < unseen.length; j++) {
        var d = evaluate(board.concat([unseen[i], unseen[j]]));
        var cmp = compare(me, d);
        var qualifies = d[0] >= 1;
        var v;
        if (cmp > 0) { v = 1 + (qualifies ? 1 : 0) + blindWin; wins++; }
        else if (cmp < 0) v = -1 - (qualifies ? 1 : 0) - 1;
        else { v = 0; ties++; }
        total += v; n++;
      }
    }
    // Dealer outs: unseen cards that would beat you as one of the dealer's two cards
    var outs = 0;
    unseen.forEach(function (c) { if (compare(evaluate(board.concat([c])), me) > 0) outs++; });
    var boardOnly = evaluate(board);
    var hidden = me[0] >= 1 && compare(me, boardOnly) > 0 && (me[0] > boardOnly[0] || me[0] >= 4);
    return { evBet: total / n, evFold: -2, winPct: wins / n, tiePct: ties / n, outs: outs, hidden: hidden, me: me };
  }

  function riverAdvice(hole, board) {
    var a = riverAnalysis(hole, board);
    var bet = a.evBet > a.evFold;
    var rule = a.hidden ? "You have a made hand that uses your cards (" + handName(a.me).toLowerCase() + "), so the rule says bet."
      : "The dealer has " + a.outs + " outs that beat you; the rule is to bet with fewer than 21 and fold with 21 or more.";
    return {
      action: bet ? "bet1" : "fold", label: bet ? "Bet 1×" : "Fold", analysis: a,
      why: rule + " Exact math: betting averages " + fmtUnits(a.evBet) + " antes and folding loses 2 (your Ante and Blind). " +
        "You win " + Math.round(a.winPct * 100) + "% against the dealer's possible hands."
    };
  }

  function fmtUnits(x) { return (x >= 0 ? "+" : "−") + Math.abs(x).toFixed(2); }

  // ===== STATE =====
  var SAVE_KEY = "pokerapp.dealer.v1";
  var DEFAULT_BUY_IN = 300;
  function freshStats(bank) {
    return { bank: bank, hands: 0, net: 0, decisions: 0, correct: 0, rebuys: 0, byStreet: { preflop: [0, 0], flop: [0, 0], river: [0, 0] }, log: [], biggest: 0 };
  }
  var stats = freshStats(DEFAULT_BUY_IN);
  var settings = { ante: 10, trips: false, coach: true, buyIn: DEFAULT_BUY_IN };
  var game = null;

  function load() {
    try {
      var raw = localStorage.getItem(SAVE_KEY);
      if (raw) {
        var s = JSON.parse(raw);
        var hadBuyIn = !!(s.settings && s.settings.buyIn);
        if (s.stats) stats = Object.assign(stats, s.stats);
        if (s.settings) settings = Object.assign(settings, s.settings);
        // Saves from before the buy-in setting started at $1,000; an untouched one starts over at the new default
        if (!hadBuyIn && !stats.hands) stats.bank = settings.buyIn;
      }
    } catch (e) { /* starts fresh */ }
  }

  function save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify({ stats: stats, settings: settings })); } catch (e) { /* this visit only */ }
  }

  // ===== DOM HELPERS =====
  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
  }
  function money(x) { return (x < 0 ? "−$" : "$") + Math.abs(Math.round(x * 100) / 100).toLocaleString(undefined, { maximumFractionDigits: 2 }); }
  function signed(x) { return x === 0 ? "$0" : (x > 0 ? "+" : "−") + "$" + Math.abs(Math.round(x * 100) / 100).toLocaleString(undefined, { maximumFractionDigits: 2 }); }

  function cardEl(c, size) {
    var n = el("div", "card " + (size || "") + " " + SUITS[c.suit].color);
    n.setAttribute("aria-label", faceRank(c.rank) + " of " + SUITS[c.suit].name);
    n.append(el("span", "card-rank", faceRank(c.rank)), el("span", "card-suit", SUITS[c.suit].sym));
    return n;
  }
  function backEl(size) { var n = el("div", "card back " + (size || "")); n.setAttribute("aria-hidden", "true"); return n; }
  function slotEl(size) { var n = el("div", "card slot " + (size || "")); n.setAttribute("aria-hidden", "true"); return n; }

  // ===== GAME FLOW =====
  // Money on the table: your stack minus whatever is riding on the current hand
  function inPlay() {
    if (!game || game.stage === "done") return 0;
    return game.ante + game.blind + game.trips + game.play;
  }
  function stackNow() { return stats.bank - inPlay(); }
  function startCost() { return settings.ante * (settings.trips ? 3 : 2); }

  function rebuy() {
    stats.bank = settings.buyIn;
    stats.rebuys = (stats.rebuys || 0) + 1;
    save();
    render();
  }

  function deal() {
    if (game && game.stage !== "done") return;
    if (stats.bank < startCost()) return;
    var ante = settings.ante;
    var deck = newDeck();
    game = {
      stage: "preflop",
      ante: ante, blind: ante, trips: settings.trips ? ante : 0, play: 0, playMult: 0,
      player: [deck.pop(), deck.pop()], dealer: [deck.pop(), deck.pop()],
      board: [deck.pop(), deck.pop(), deck.pop(), deck.pop(), deck.pop()],
      shown: 0, folded: false, decisions: [], result: null
    };
    render();
  }

  function adviceNow() {
    if (!game) return null;
    if (game.stage === "preflop") return preflopAdvice(game.player);
    if (game.stage === "flop") return flopAdvice(game.player, game.board.slice(0, 3));
    if (game.stage === "river") return riverAdvice(game.player, game.board);
    return null;
  }

  function choose(action) {
    if (!game || game.stage === "done") return;
    var need = { bet4: 4, bet3: 3, bet2: 2, bet1: 1 }[action];
    if (need && game.ante * need > stackNow()) return;
    var advice = adviceNow();
    var street = game.stage;
    // Pre-flop 3x and 4x both "bet": basic strategy always prefers 4x, so 3x counts as off-strategy
    var ok = action === advice.action;
    game.decisions.push({ street: street, you: actionLabel(action), advice: advice.label, ok: ok, why: advice.why });
    stats.decisions += 1;
    if (ok) stats.correct += 1;
    stats.byStreet[street][1] += 1;
    if (ok) stats.byStreet[street][0] += 1;

    if (action === "bet4" || action === "bet3") { game.playMult = action === "bet4" ? 4 : 3; game.play = game.ante * game.playMult; return finish(); }
    if (action === "bet2") { game.playMult = 2; game.play = game.ante * 2; return finish(); }
    if (action === "bet1") { game.playMult = 1; game.play = game.ante; return finish(); }
    if (action === "fold") { game.folded = true; return finish(); }
    // check
    if (street === "preflop") { game.stage = "flop"; game.shown = 3; }
    else if (street === "flop") { game.stage = "river"; game.shown = 5; }
    render();
  }

  function actionLabel(a) {
    return { bet4: "Bet 4×", bet3: "Bet 3×", bet2: "Bet 2×", bet1: "Bet 1×", check: "Check", fold: "Fold" }[a];
  }

  function finish() {
    game.shown = 5;
    game.stage = "done";
    var me = evaluate(game.player.concat(game.board));
    var dl = evaluate(game.dealer.concat(game.board));
    var cmp = compare(me, dl);
    var qualifies = dl[0] >= 1;
    var lines = [];
    var net = 0;
    function line(name, stake, delta, text) { lines.push({ name: name, stake: stake, delta: delta, text: text }); net += delta; }

    if (game.folded) {
      line("Ante", game.ante, -game.ante, "Lost (you folded)");
      line("Blind", game.blind, -game.blind, "Lost (you folded)");
    } else if (cmp > 0) {
      line("Play", game.play, game.play, "Wins 1 to 1");
      line("Ante", game.ante, qualifies ? game.ante : 0, qualifies ? "Wins 1 to 1" : "Push: the dealer didn't qualify");
      var bp = BLIND_PAY[payKey(me)];
      line("Blind", game.blind, bp ? game.blind * bp : 0, bp ? "Pays " + BLIND_TEXT[payKey(me)] : "Push: wins pay only with a straight or better");
    } else if (cmp < 0) {
      line("Play", game.play, -game.play, "Loses");
      line("Ante", game.ante, qualifies ? -game.ante : 0, qualifies ? "Loses" : "Push: the dealer didn't qualify");
      line("Blind", game.blind, -game.blind, "Loses");
    } else {
      line("Play", game.play, 0, "Push: tie");
      line("Ante", game.ante, 0, "Push: tie");
      line("Blind", game.blind, 0, "Push: tie");
    }
    if (game.trips) {
      var tp = TRIPS_PAY[payKey(me)];
      line("Trips", game.trips, tp ? game.trips * tp : -game.trips, tp ? "Pays " + tp + " to 1" : "Loses: needs three of a kind or better");
    }
    game.result = {
      me: me, dealer: dl, cmp: cmp, qualifies: qualifies, lines: lines, net: net,
      headline: game.folded ? "You folded" : (cmp > 0 ? "You win" : (cmp < 0 ? "Dealer wins" : "Push"))
    };
    stats.hands += 1;
    stats.net += net;
    stats.bank += net;
    if (net > stats.biggest) stats.biggest = net;
    stats.log.unshift({
      cards: cardsText(game.player), net: net, headline: game.result.headline,
      decisions: game.decisions.map(function (d) { return { street: d.street, you: d.you, advice: d.advice, ok: d.ok }; })
    });
    stats.log = stats.log.slice(0, 25);
    save();
    render();
  }

  // ===== RENDER =====
  function render() {
    renderTable();
    renderControls();
    renderFeedback();
    renderStats();
    renderSettings();
  }

  function renderTable() {
    var dealerRow = $("dealer-cards");
    dealerRow.replaceChildren();
    var done = game && game.stage === "done";
    if (!game) { dealerRow.append(slotEl("lg"), slotEl("lg")); }
    else game.dealer.forEach(function (c) { dealerRow.append(done ? cardEl(c, "lg") : backEl("lg")); });
    $("dealer-hand").textContent = done ? handName(game.result.dealer) + (game.result.qualifies ? "" : " · doesn't qualify") : "";

    var board = $("board");
    board.replaceChildren();
    for (var i = 0; i < 5; i++) {
      if (game && i < game.shown) board.append(cardEl(game.board[i], "lg"));
      else board.append(slotEl("lg"));
    }

    var mine = $("player-cards");
    mine.replaceChildren();
    if (!game) mine.append(slotEl("xl"), slotEl("xl"));
    else game.player.forEach(function (c) { mine.append(cardEl(c, "xl")); });
    var you = $("player-hand");
    if (!game) you.textContent = "Pick your Ante and deal";
    else {
      var visible = game.player.concat(game.board.slice(0, game.shown));
      you.textContent = game.shown === 0 ? describePreflop(game.player) : handName(evaluate(visible));
    }

    var stack = stackNow();
    $("stack-amt").textContent = money(stack);
    var sub = $("stack-sub");
    sub.className = "stack-sub";
    if (game && !done) sub.textContent = money(inPlay()) + " in play";
    else if (done) {
      sub.textContent = "last hand " + signed(game.result.net);
      if (game.result.net) sub.classList.add(game.result.net > 0 ? "pos" : "neg");
    } else sub.textContent = "";
    $("stack-plate").classList.toggle("low", (!game || done) && stack < startCost());

    var spots = { trips: game ? game.trips : (settings.trips ? settings.ante : 0), ante: game ? game.ante : settings.ante, blind: game ? game.blind : settings.ante, play: game ? game.play : 0 };
    var deltas = {};
    if (done) game.result.lines.forEach(function (l) { deltas[l.name.toLowerCase()] = l.delta; });
    ["trips", "ante", "blind", "play"].forEach(function (k) {
      var spot = $("spot-" + k);
      var amt = spot.querySelector(".spot-amt");
      var res = spot.querySelector(".spot-res");
      amt.textContent = spots[k] ? money(spots[k]) : "–";
      spot.classList.toggle("empty", !spots[k]);
      spot.classList.remove("won", "lost", "push");
      res.textContent = "";
      if (done && deltas[k] !== undefined) {
        res.textContent = deltas[k] === 0 ? "push" : signed(deltas[k]);
        spot.classList.add(deltas[k] > 0 ? "won" : (deltas[k] < 0 ? "lost" : "push"));
      }
    });
    $("play-mult").textContent = game && game.playMult ? game.playMult + "×" : "";
  }

  function describePreflop(hole) {
    var hi = hole[0].rank >= hole[1].rank ? hole[0] : hole[1];
    var lo = hi === hole[0] ? hole[1] : hole[0];
    if (hi.rank === lo.rank) return "Pocket " + RANK_PLURAL[hi.rank].toLowerCase();
    return faceRank(hi.rank) + faceRank(lo.rank) + (hi.suit === lo.suit ? " suited" : " offsuit");
  }

  function renderControls() {
    var box = $("controls");
    box.replaceChildren();
    var row = el("div", "controls-row");
    var advice = settings.coach ? adviceNow() : null;
    function btn(label, cls, action, key) {
      var b = el("button", "btn " + cls, label);
      b.type = "button";
      b.dataset.key = key;
      if (advice && advice.action === action) b.classList.add("suggested");
      var need = { bet4: 4, bet3: 3, bet2: 2, bet1: 1 }[action];
      if (need && game.ante * need > stackNow()) { b.disabled = true; b.title = "Not enough left in your stack"; }
      b.addEventListener("click", function () { choose(action); });
      row.append(b);
    }
    var note = el("p", "controls-note");
    if (!game || game.stage === "done") {
      var d = el("button", "btn primary big", game ? "Deal next hand" : "Deal");
      d.type = "button";
      d.id = "deal-btn";
      d.addEventListener("click", deal);
      var short = stats.bank < startCost();
      d.disabled = short;
      row.append(d);
      if (short) {
        var rb = el("button", "btn", "Rebuy " + money(settings.buyIn));
        rb.type = "button";
        rb.addEventListener("click", rebuy);
        row.append(rb);
      }
      note.textContent = short
        ? "Your " + money(stats.bank) + " stack can't cover the " + money(startCost()) + " to start. Lower your Ante or turn off Trips, or rebuy."
        : "Ante " + money(settings.ante) + " + Blind " + money(settings.ante) + (settings.trips ? " + Trips " + money(settings.ante) : "") +
          " = " + money(startCost()) + " to start. Space deals.";
    } else if (game.stage === "preflop") {
      btn("Check", "check", "check", "1");
      btn("Bet 3× (" + money(game.ante * 3) + ")", "raise", "bet3", "2");
      btn("Bet 4× (" + money(game.ante * 4) + ")", "raise strong", "bet4", "3");
      note.textContent = "Before the flop: check, or bet 3× or 4× your Ante. Keys 1, 2, 3.";
    } else if (game.stage === "flop") {
      btn("Check", "check", "check", "1");
      btn("Bet 2× (" + money(game.ante * 2) + ")", "raise", "bet2", "2");
      note.textContent = "On the flop: check, or bet 2× your Ante. Keys 1, 2.";
    } else if (game.stage === "river") {
      btn("Fold", "fold", "fold", "1");
      btn("Bet 1× (" + money(game.ante) + ")", "raise", "bet1", "2");
      note.textContent = "Last chance: bet 1× or fold your Ante and Blind. Keys 1, 2.";
    }
    box.append(row);
    if (advice) {
      var hint = el("p", "coach-hint");
      hint.append(el("strong", null, "Coach: " + advice.label + ". "), document.createTextNode(advice.why));
      box.append(hint);
    }
    box.append(note);
  }

  function renderFeedback() {
    var box = $("feedback");
    box.replaceChildren();
    if (!game || game.stage !== "done") {
      box.append(el("p", "muted", game ? "Your decisions are graded when the hand ends." : "Deal a hand. Each decision is graded against basic strategy, and the river against exact math."));
      return;
    }
    var r = game.result;
    var head = el("div", "result-head " + (r.net > 0 ? "won" : (r.net < 0 ? "lost" : "push")));
    head.append(el("span", "result-title", r.headline), el("span", "result-net", signed(r.net)));
    box.append(head);
    box.append(el("p", "result-hands", "You: " + handName(r.me) + " · Dealer: " + handName(r.dealer) + (r.qualifies ? "" : " (doesn't qualify)")));
    var table = el("table", "payouts");
    r.lines.forEach(function (l) {
      var tr = el("tr");
      tr.append(el("th", null, l.name), el("td", "num", money(l.stake)), el("td", null, l.text), el("td", "num " + (l.delta > 0 ? "pos" : (l.delta < 0 ? "neg" : "")), l.delta === 0 ? "0" : signed(l.delta)));
      table.append(tr);
    });
    box.append(table);
    var list = el("ul", "grades");
    game.decisions.forEach(function (d) {
      var li = el("li", d.ok ? "ok" : "miss");
      li.append(el("span", "chip " + (d.ok ? "ok" : "miss"), d.ok ? "Matches strategy" : "Off strategy"));
      li.append(el("span", "grade-street", { preflop: "Pre-flop", flop: "Flop", river: "River" }[d.street] + ": "));
      li.append(document.createTextNode("you " + d.you.toLowerCase() + (d.ok ? "." : ", strategy says " + d.advice.toLowerCase() + ".") + " " + d.why));
      list.append(li);
    });
    box.append(list);
  }

  function pct(a, b) { return b ? Math.round(a / b * 100) + "%" : "–"; }

  function renderStats() {
    var dl = $("stats");
    dl.replaceChildren();
    [["Stack", money(stackNow())], ["Hands", String(stats.hands)], ["Net", stats.hands ? signed(stats.net) : "–"], ["On strategy", pct(stats.correct, stats.decisions)]]
      .forEach(function (t) { var d = el("div"); d.append(el("dt", null, t[0]), el("dd", null, t[1])); dl.append(d); });
    var bs = stats.byStreet;
    $("street-split").textContent = stats.decisions ? "Pre-flop " + pct(bs.preflop[0], bs.preflop[1]) + " · Flop " + pct(bs.flop[0], bs.flop[1]) + " · River " + pct(bs.river[0], bs.river[1]) +
      (stats.hands ? " · Average per hand " + signed(stats.net / stats.hands) : "") + (stats.rebuys ? " · Rebuys " + stats.rebuys : "") : "";
    var log = $("hand-log");
    log.replaceChildren();
    stats.log.forEach(function (h, i) {
      var li = el("li");
      var allOk = h.decisions.every(function (d) { return d.ok; });
      li.append(el("span", "log-no", "#" + (stats.hands - i)), el("span", "log-cards", h.cards), el("span", "log-acts", h.decisions.map(function (d) { return d.you; }).join(" → ")),
        el("span", "log-net " + (h.net > 0 ? "pos" : (h.net < 0 ? "neg" : "")), signed(h.net)), el("span", "chip " + (allOk ? "ok" : "miss"), allOk ? "✓" : "✗"));
      li.title = h.decisions.map(function (d) { return d.street + ": you " + d.you + (d.ok ? "" : " (strategy: " + d.advice + ")"); }).join("\n");
      log.append(li);
    });
    $("log-empty").hidden = stats.log.length > 0;
  }

  function renderSettings() {
    var busy = game && game.stage !== "done";
    $("set-ante").value = String(settings.ante);
    $("set-ante").disabled = !!busy;
    $("set-buyin").value = String(settings.buyIn);
    var reset = $("reset-stats");
    if (reset.dataset.armed !== "1") reset.textContent = "New session (" + money(settings.buyIn) + " buy-in)";
    reset.disabled = !!busy;
    document.querySelectorAll("#trips-toggle button").forEach(function (b) {
      var on = (b.dataset.v === "on") === settings.trips;
      b.classList.toggle("on", on); b.setAttribute("aria-pressed", on ? "true" : "false"); b.disabled = !!busy;
    });
    document.querySelectorAll("#coach-toggle button").forEach(function (b) {
      var on = (b.dataset.v === "on") === settings.coach;
      b.classList.toggle("on", on); b.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  function renderPayTables() {
    function fill(id, rows) {
      var t = $(id);
      rows.forEach(function (r) { var tr = el("tr"); tr.append(el("th", null, r[0]), el("td", "num", r[1])); t.append(tr); });
    }
    fill("pay-blind", BLIND_ROWS);
    fill("pay-trips", TRIPS_ROWS);
  }

  // ===== WIRING =====
  $("set-ante").addEventListener("change", function () { settings.ante = parseInt($("set-ante").value, 10); save(); render(); });
  // A new buy-in takes effect on your next rebuy or new session; before your first hand it applies right away
  $("set-buyin").addEventListener("change", function () {
    settings.buyIn = parseInt($("set-buyin").value, 10);
    if (!stats.hands && (!game || game.stage === "done")) stats.bank = settings.buyIn;
    save(); render();
  });
  document.querySelectorAll("#trips-toggle button").forEach(function (b) {
    b.addEventListener("click", function () { settings.trips = b.dataset.v === "on"; save(); render(); });
  });
  document.querySelectorAll("#coach-toggle button").forEach(function (b) {
    b.addEventListener("click", function () { settings.coach = b.dataset.v === "on"; save(); render(); });
  });
  $("reset-stats").addEventListener("click", function () {
    var btn = $("reset-stats");
    if (game && game.stage !== "done") return;
    if (btn.dataset.armed !== "1") { btn.dataset.armed = "1"; btn.textContent = "Tap again: new session with " + money(settings.buyIn); return; }
    btn.dataset.armed = "";
    stats = freshStats(settings.buyIn);
    game = null;
    save(); render();
  });
  document.addEventListener("keydown", function (e) {
    if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT" || e.metaKey || e.ctrlKey || e.altKey) return;
    var space = e.key === " " || e.key === "Enter";
    if ((!game || game.stage === "done") && space) {
      if (e.target.tagName === "BUTTON" && e.target.id !== "deal-btn") return;
      e.preventDefault(); deal(); return;
    }
    var b = document.querySelector('#controls [data-key="' + e.key + '"]');
    if (b) { e.preventDefault(); b.click(); }
  });

  // Exposed for tests
  window.dealerHoldem = { evaluate: evaluate, compare: compare, handName: handName, preflopAdvice: preflopAdvice, flopAdvice: flopAdvice, riverAdvice: riverAdvice,
    state: function () { return game; }, stats: function () { return stats; }, deal: deal, choose: choose };

  load();
  renderPayTables();
  render();
})();
