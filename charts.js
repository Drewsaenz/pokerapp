// Range charts: every chart is computed from engine.js, so it matches the simulator, the chart check and the bots.

const GRID_RANKS = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"];
const OPENERS_ORDER = ["UTG", "UTG+1", "UTG+2", "LJ", "HJ", "CO", "BTN", "SB", "BB"];
const STACK_BB = { deep: 100, mid: 30, short: 12 };

const ACTION_STYLE = {
  "Raise": { cls: "a-raise", label: "Raise" },
  "3-Bet": { cls: "a-3bet", label: "Re-raise (3-bet)" },
  "All-In": { cls: "a-allin", label: "All-in" },
  "Call": { cls: "a-call", label: "Call" },
  "Fold": { cls: "a-fold", label: "Fold" },
  "Check": { cls: "a-check", label: "Check (free)" }
};

const POSITION_INFO = {
  "UTG": { group: "Early", note: "First to act with eight players behind. Play only strong hands." },
  "UTG+1": { group: "Early", note: "Still early. Barely wider than UTG." },
  "UTG+2": { group: "Early", note: "Last of the early seats. Add small pairs and suited aces." },
  "LJ": { group: "Middle", note: "Lojack. First to act at a 6-handed table, where it's called UTG." },
  "HJ": { group: "Middle", note: "Hijack. Start stealing more: suited connectors, more broadways." },
  "CO": { group: "Late", note: "Cutoff. Only the button and blinds behind. Open wide." },
  "BTN": { group: "Late", note: "Button. Best seat: you act last on every street after the flop." },
  "SB": { group: "Blinds", note: "Already half a bet in, but out of position after the flop. Raise or fold." },
  "BB": { group: "Blinds", note: "Already a full bet in. Defends widest against raises." }
};

function $(id) {
  return document.getElementById(id);
}

function el(tag, className, text) {
  var node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function handAt(r, c) {
  if (r === c) return GRID_RANKS[r] + GRID_RANKS[c];
  return r < c ? GRID_RANKS[r] + GRID_RANKS[c] + "s" : GRID_RANKS[c] + GRID_RANKS[r] + "o";
}

function combosOf(hand) {
  return hand.length === 2 ? 6 : (hand[2] === "s" ? 4 : 12);
}

function actionFor(hand, opts) {
  return getRecommendation({
    stage: opts.stage,
    stack: opts.stack,
    stackBB: STACK_BB[opts.stack],
    hero: opts.hero,
    spot: opts.spot,
    opener: opts.opener,
    hand: hand
  }).action;
}

// Every cell's action plus the share of all 1,326 starting combos per action
function buildChart(opts) {
  var cells = [];
  var combos = {};
  for (var r = 0; r < 13; r++) {
    for (var c = 0; c < 13; c++) {
      var hand = handAt(r, c);
      var action = actionFor(hand, opts);
      cells.push({ hand: hand, action: action });
      combos[action] = (combos[action] || 0) + combosOf(hand);
    }
  }
  return { cells: cells, combos: combos };
}

function pctOfCombos(n) {
  return Math.round((n / 1326) * 1000) / 10 + "%";
}

function renderGrid(host, chart, small) {
  host.replaceChildren();
  var grid = el("div", "grid" + (small ? " small" : ""));
  grid.setAttribute("role", "table");
  chart.cells.forEach(function (cell) {
    var style = ACTION_STYLE[cell.action];
    var node = el("div", "cell " + style.cls + (cell.hand.length === 2 ? " pair" : ""));
    node.setAttribute("role", "cell");
    node.title = cell.hand + ": " + style.label;
    node.setAttribute("aria-label", cell.hand + ", " + style.label);
    if (!small) node.textContent = cell.hand;
    grid.append(node);
  });
  host.append(grid);
}

function renderLegend(host, chart) {
  host.replaceChildren();
  ["Raise", "3-Bet", "All-In", "Call", "Fold"].forEach(function (action) {
    if (!chart.combos[action]) return;
    var item = el("span", "legend-item");
    item.append(el("span", "swatch " + ACTION_STYLE[action].cls),
      el("span", null, ACTION_STYLE[action].label + " " + pctOfCombos(chart.combos[action])));
    host.append(item);
  });
}

// ===== POSITIONS =====

function renderPositions() {
  var body = $("positions-body");
  OPENERS_ORDER.forEach(function (pos, i) {
    var tr = el("tr");
    var info = POSITION_INFO[pos];
    var opens = "–";
    if (pos !== "BB") {
      var chart = buildChart({ stage: "cash", stack: "deep", hero: pos, spot: "unopened", opener: null });
      opens = pctOfCombos(chart.combos.Raise || 0);
    }
    var postflop = ["SB", "BB"].indexOf(pos) !== -1 ? (pos === "SB" ? "1st" : "2nd") : (i + 3) + (i + 3 === 3 ? "rd" : "th");
    var name = el("td", "pos-name");
    name.append(el("span", "pos-chip g-" + info.group.toLowerCase(), pos));
    tr.append(
      name,
      el("td", null, info.group),
      el("td", "num", (i + 1) + (i === 0 ? "st" : i === 1 ? "nd" : i === 2 ? "rd" : "th")),
      el("td", "num", postflop),
      el("td", "num", opens),
      el("td", "note", info.note)
    );
    body.append(tr);
  });
}

// ===== SIZES =====
// Open: 2.5bb (3bb from the small blind); live $1/2 opens run $12-15.
// 3-bet: about 3.25x the open in position, 4x out of position (the blinds always are), as in the practice table.
function openSizeBB(pos) { return pos === "SB" ? 3 : 2.5; }
function halfStep(x) { return Math.round(x * 2) / 2; }
function inPositionVs(hero, opener) { return hero !== "SB" && hero !== "BB" && OPENERS_ORDER.indexOf(hero) > OPENERS_ORDER.indexOf(opener); }
function openSizeText(pos) {
  var bb = openSizeBB(pos);
  return "Raise to " + bb + "bb ($" + (bb * 2) + ") · live $12–15";
}
function threeBetSizeText(hero, opener) {
  var ip = inPositionVs(hero, opener);
  var mult = ip ? 3.25 : 4;
  var to = halfStep(openSizeBB(opener) * mult);
  var live = Math.round(15 * mult / 5) * 5;
  return "Re-raise to " + to + "bb ($" + (to * 2) + ") · live $" + live + " vs a $15 raise · " + (ip ? "in position" : "out of position");
}

// ===== OPENING RANGES AT A GLANCE =====

function renderGlance() {
  var host = $("glance");
  OPENERS_ORDER.filter(function (p) { return p !== "BB"; }).forEach(function (pos) {
    var chart = buildChart({ stage: "cash", stack: "deep", hero: pos, spot: "unopened", opener: null });
    var fig = el("figure", "mini");
    var cap = el("figcaption");
    cap.append(el("span", "pos-chip g-" + POSITION_INFO[pos].group.toLowerCase(), pos),
      el("span", "mini-pct", pctOfCombos(chart.combos.Raise || 0)));
    var gridHost = el("div");
    renderGrid(gridHost, chart, true);
    fig.append(cap, el("p", "size-line", openSizeText(pos)), gridHost);
    host.append(fig);
  });
  // The BB can't open (if it folds to the BB, the hand is over), so its tile shows its most common job:
  // defending against a button raise. The full set is in "Someone raised before you".
  var bb = buildChart({ stage: "cash", stack: "deep", hero: "BB", spot: "facingRaise", opener: "BTN" });
  var fig = el("figure", "mini bb-tile");
  var cap = el("figcaption");
  cap.append(el("span", "pos-chip g-blinds", "BB"),
    el("span", "mini-pct", "Call " + pctOfCombos(bb.combos.Call || 0) + " · re-raise " + pctOfCombos(bb.combos["3-Bet"] || 0)));
  var note = el("p", "size-line");
  note.append(document.createTextNode("Can't open: shown defending vs a button raise. "));
  var link = el("a", null, "All BB spots ↓");
  link.href = "#threebets";
  link.addEventListener("click", function () { tbRaiser = "BTN"; renderThreeBetGlance(); });
  note.append(link);
  var gridHost = el("div");
  renderGrid(gridHost, bb, true);
  fig.append(cap, note, gridHost);
  host.append(fig);
}

// ===== 3-BET RANGES AT A GLANCE =====
// Pick the raiser; every seat that acts after them gets its 3-bet / call / fold chart and 3-bet size.
var tbRaiser = "CO";

function renderThreeBetGlance() {
  var pick = $("raiser-pick");
  pick.replaceChildren();
  OPENERS_ORDER.slice(0, 8).forEach(function (pos) {
    var b = el("button", "raiser" + (pos === tbRaiser ? " on" : ""), pos);
    b.type = "button";
    b.setAttribute("aria-pressed", pos === tbRaiser ? "true" : "false");
    b.addEventListener("click", function () { tbRaiser = pos; renderThreeBetGlance(); });
    pick.append(b);
  });
  var host = $("tb-glance");
  host.replaceChildren();
  OPENERS_ORDER.slice(OPENERS_ORDER.indexOf(tbRaiser) + 1).forEach(function (pos) {
    var chart = buildChart({ stage: "cash", stack: "deep", hero: pos, spot: "facingRaise", opener: tbRaiser });
    var fig = el("figure", "mini");
    var cap = el("figcaption");
    cap.append(el("span", "pos-chip g-" + POSITION_INFO[pos].group.toLowerCase(), pos),
      el("span", "mini-pct", "Call " + pctOfCombos(chart.combos.Call || 0) + " · re-raise " + pctOfCombos(chart.combos["3-Bet"] || 0)));
    var gridHost = el("div");
    renderGrid(gridHost, chart, true);
    fig.append(cap, el("p", "size-line", threeBetSizeText(pos, tbRaiser)), gridHost);
    host.append(fig);
  });
  $("tb-note").textContent = "The " + tbRaiser + " raises to " + openSizeBB(tbRaiser) + "bb ($" + (openSizeBB(tbRaiser) * 2) + "), or about $15 live, and it's your turn. " +
    "Find your seat below (100bb stacks). If other players already called, re-raise one raise-size bigger for each of them.";
}

// ===== RANGE EXPLORER =====

function explorerOptions() {
  return {
    spot: $("ex-spot").value,
    hero: $("ex-hero").value,
    opener: $("ex-spot").value === "facingRaise" ? $("ex-opener").value : null,
    stack: $("ex-stack").value,
    stage: $("ex-stage").value
  };
}

function syncExplorerControls() {
  var spot = $("ex-spot").value;
  var heroSel = $("ex-hero");
  var heroes = spot === "unopened" ? OPENERS_ORDER.slice(0, 8) : OPENERS_ORDER.slice(1);
  var keepHero = heroes.indexOf(heroSel.value) !== -1 ? heroSel.value : (spot === "unopened" ? "CO" : "BB");
  heroSel.replaceChildren();
  heroes.forEach(function (p) { heroSel.append(new Option(p, p, false, p === keepHero)); });

  var openerField = $("field-opener");
  openerField.hidden = spot !== "facingRaise";
  var openerSel = $("ex-opener");
  var openers = OPENERS_ORDER.slice(0, OPENERS_ORDER.indexOf(heroSel.value));
  var keepOpener = openers.indexOf(openerSel.value) !== -1 ? openerSel.value : openers[openers.length - 1];
  openerSel.replaceChildren();
  openers.forEach(function (p) { openerSel.append(new Option(p, p, false, p === keepOpener)); });
}

function explorerSummary(opts, chart) {
  var stackText = STACK_BB[opts.stack] + "bb";
  var game = GAME_STAGES[opts.stage].label.toLowerCase();
  var parts = [];
  ["Raise", "3-Bet", "All-In", "Call"].forEach(function (a) {
    if (chart.combos[a]) parts.push(ACTION_STYLE[a].label.toLowerCase() + " " + pctOfCombos(chart.combos[a]));
  });
  var spot = opts.spot === "unopened"
    ? "Folded to you in the " + opts.hero
    : "The " + opts.opener + " raises and you're in the " + opts.hero;
  var size = opts.stack === "short" ? "" : (opts.spot === "unopened" ? " Size: " + openSizeText(opts.hero).toLowerCase().replace("raise", "raise") + "." : " Size: " + threeBetSizeText(opts.hero, opts.opener) + ".");
  return spot + ", " + stackText + ", " + game + ": " + (parts.length ? parts.join(", ") : "nothing") +
    " of all starting hands, and fold the rest." + size + " " + STAGE_NOTES[opts.stage];
}

function renderExplorer() {
  syncExplorerControls();
  var opts = explorerOptions();
  var chart = buildChart(opts);
  renderGrid($("ex-grid"), chart, false);
  renderLegend($("ex-legend"), chart);
  $("ex-summary").textContent = explorerSummary(opts, chart);
}

["ex-spot", "ex-hero", "ex-opener", "ex-stack", "ex-stage"].forEach(function (id) {
  $(id).addEventListener("change", renderExplorer);
});

// ===== PLAYER TYPES =====

const PLAYER_TYPES = [
  {
    key: "TAG", name: "Tight-aggressive", short: "TAG", tight: true, aggressive: true,
    vpip: "18–25%", pfr: "15–21%",
    tell: "Raises or folds, rarely limps or just calls.",
    plan: "Respect their big bets; steal from them less.",
    what: "The solid regular. Plays a disciplined range and plays it hard. This is the style the charts teach.",
    plays: [
      "Opens and 3-bets close to the charts, rarely limps.",
      "Continuation-bets most flops, keeps betting good hands for value.",
      "Bluffs in sensible spots, usually with draws or blockers, not at random."
    ],
    spot: ["VPIP and PFR close together.", "Shows down strong, reasonable hands.", "Bet sizes make sense for the board."],
    beat: [
      "Fold more to their 3-bets and to big turn and river bets. They're usually value.",
      "Float or raise their flop c-bets in position on low, connected boards that miss their range.",
      "Don't try to bluff-catch thin on the river. Save your chips for clearer spots.",
      "Play your strongest hands fast: they'll often pay you with top pair and overpairs."
    ]
  },
  {
    key: "LAG", name: "Loose-aggressive", short: "LAG", tight: false, aggressive: true,
    vpip: "28–40%", pfr: "22–32%",
    tell: "3-bets and squeezes often; fires big on scary boards.",
    plan: "Call down lighter; let them bluff into you.",
    what: "Plays lots of hands and keeps the pressure on. Dangerous when good, but bluffs much more than a TAG.",
    plays: [
      "Opens wide and 3-bets light, especially in late position and the blinds.",
      "Barrels turns and rivers with draws and air.",
      "Uses big bets to push you off medium-strength hands."
    ],
    spot: ["High VPIP and high PFR.", "Shows down weak hands or busted draws after big bets.", "Frequent squeezes after a raise and a call."],
    beat: [
      "Tighten up when they're behind you: marginal calls get squeezed (your Q9s hand).",
      "Check-call with medium hands like top pair or a good middle pair instead of betting. Let them bluff.",
      "4-bet for value a bit wider against their 3-bets (QQ+, AK, sometimes JJ, AQs).",
      "Avoid fancy bluffs. They call and re-raise too often for bluffs to work."
    ]
  },
  {
    key: "NIT", name: "Tight-passive (Nit)", short: "Nit", tight: true, aggressive: false,
    vpip: "8–14%", pfr: "5–10%",
    tell: "Folds almost every hand; a raise from them means a monster.",
    plan: "Steal their blinds; fold when they wake up.",
    what: "Waits for premium hands and plays them cautiously. Easy to read, hard to win big pots from.",
    plays: [
      "Plays only strong hands and rarely bluffs.",
      "Calls more than raises, and slow-plays big hands sometimes.",
      "Gives up when they miss, folding to a single bet."
    ],
    spot: ["Very low VPIP.", "Long stretches of folding.", "Every showdown is a strong hand."],
    beat: [
      "Raise their blinds often and c-bet when they call: they fold too much.",
      "Fold to their raises and big bets unless you're very strong.",
      "Don't expect big payoffs. Value-bet only your best hands, and smaller.",
      "When they suddenly come alive, believe them."
    ]
  },
  {
    key: "CALL", name: "Loose-passive (Calling station)", short: "Station", tight: false, aggressive: false,
    vpip: "35–60%", pfr: "3–10%",
    tell: "Limps and calls a lot; rarely raises; chases any draw.",
    plan: "Never bluff; value-bet thinner and bigger.",
    what: "Plays lots of hands and hates folding. The most profitable opponent at the table if you don't bluff.",
    plays: [
      "Limps and calls raises with weak hands.",
      "Calls bets with any pair or any draw, all the way to the river.",
      "Rarely raises, so when they do, it's real."
    ],
    spot: ["High VPIP, very low PFR.", "Shows down bottom pair or missed draws after calling three streets.", "Lots of limping."],
    beat: [
      "Never bluff. They call.",
      "Value-bet thinner (top pair, weak kicker is often good) and bigger.",
      "Raise to isolate their limps with good hands, and bet every street when ahead.",
      "If a station raises, fold all but strong hands."
    ]
  }
];

function botNumbers(key) {
  var st = BOT_STYLES[key];
  var coOpen = 0;
  for (var r = 0; r < 13; r++) for (var c = 0; c < 13; c++) {
    var hand = handAt(r, c);
    if (handPercentile(hand, false) <= OPEN_PCT.CO * st.open) coOpen += combosOf(hand);
  }
  var pct = function (x) { return Math.round(x * 100) + "%"; };
  return [
    ["Opens from the cutoff", pctOfCombos(coOpen)],
    ["C-bets the flop", pct(st.cbet)],
    ["Bets strong hands", pct(st.valueBet)],
    ["Slow-plays monsters", pct(st.slowplay)],
    ["Raises monsters facing a bet", pct(st.raiseValue)],
    ["Bluffs, compared with a TAG", st.bluff === 1 ? "same" : st.bluff + "× as often"],
    ["Calls, compared with a TAG", st.callAdj === 0 ? "same" : (st.callAdj > 0 ? "looser" : "tighter")]
  ];
}

function renderPlayers() {
  var quad = $("quad");
  quad.append(el("span", "axis axis-top", "Aggressive"), el("span", "axis axis-bottom", "Passive"),
    el("span", "axis axis-left", "Tight"), el("span", "axis axis-right", "Loose"));
  [["TAG", "q-tl"], ["LAG", "q-tr"], ["NIT", "q-bl"], ["CALL", "q-br"]].forEach(function (pair) {
    var t = PLAYER_TYPES.find(function (x) { return x.key === pair[0]; });
    var cell = el("a", "q-cell " + pair[1]);
    cell.href = "#type-" + t.key.toLowerCase();
    cell.append(el("span", "q-name", t.short), el("span", "q-full", t.name), el("span", "q-plan", t.plan));
    quad.append(cell);
  });

  var body = $("spot-body");
  PLAYER_TYPES.forEach(function (t) {
    var tr = el("tr");
    var name = el("td");
    name.append(el("span", "type-chip t-" + t.key.toLowerCase(), t.short));
    tr.append(name, el("td", "num", t.vpip), el("td", "num", t.pfr), el("td", null, t.tell), el("td", null, t.plan));
    body.append(tr);
  });

  var host = $("types");
  PLAYER_TYPES.forEach(function (t) {
    var card = el("article", "type-card");
    card.id = "type-" + t.key.toLowerCase();
    var head = el("header", "type-head");
    head.append(el("span", "type-chip t-" + t.key.toLowerCase(), t.short), el("h3", null, t.name));
    card.append(head, el("p", "type-what", t.what));
    [["How they play", t.plays], ["How to spot them", t.spot], ["How to beat them", t.beat]].forEach(function (block) {
      var sec = el("div", "type-sec");
      sec.append(el("h4", null, block[0]));
      var ul = el("ul");
      block[1].forEach(function (line) { ul.append(el("li", null, line)); });
      sec.append(ul);
      card.append(sec);
    });
    var bots = el("div", "type-sec bots");
    bots.append(el("h4", null, "The " + t.short + " bots at the practice table"));
    var dl = el("dl", "bot-stats");
    botNumbers(t.key).forEach(function (row) {
      var d = el("div");
      d.append(el("dt", null, row[0]), el("dd", null, row[1]));
      dl.append(d);
    });
    bots.append(dl);
    card.append(bots);
    host.append(card);
  });
}

renderPositions();
// ===== RANGE SLIDER =====
// Shade the top X% of starting hands (by share of the 1,326 combos), using the same rankings as the charts.
var rsRank = "play";
var RS_SEATS = [["UTG", 15], ["UTG+1", 17], ["UTG+2", 19], ["LJ", 22], ["HJ", 26], ["CO", 31], ["BTN", 45], ["SB", 42]];

function renderSlider() {
  var pct = parseFloat($("rs-slider").value);
  var shove = rsRank === "shove";
  $("rs-out").textContent = pct + "%";
  var cells = [];
  var combos = { Raise: 0, Fold: 0 };
  var hands = 0;
  var edge = [];
  for (var r = 0; r < 13; r++) {
    for (var c = 0; c < 13; c++) {
      var hand = handAt(r, c);
      var p = handPercentile(hand, shove) * 100;
      var inRange = p <= pct + 1e-9;
      cells.push({ hand: hand, action: inRange ? "Raise" : "Fold", edge: inRange && p > pct - 2.5 });
      combos[inRange ? "Raise" : "Fold"] += combosOf(hand);
      if (inRange) { hands += 1; if (p > pct - 2.5) edge.push({ hand: hand, p: p }); }
    }
  }
  renderGrid($("rs-grid"), { cells: cells, combos: combos }, false);
  $("rs-grid").querySelectorAll(".cell").forEach(function (node, i) { if (cells[i].edge) node.classList.add("edge"); });
  var seat = RS_SEATS.filter(function (x) { return Math.abs(x[1] - pct) < 0.75; })[0];
  $("rs-summary").textContent = hands + " of 169 hands, " + combos.Raise + " of 1,326 combos (" + pctOfCombos(combos.Raise) + ")." +
    (seat ? " That's about the " + seat[0] + "'s opening range at 100bb." : "");
  edge.sort(function (a, b) { return b.p - a.p; });
  $("rs-edge").textContent = edge.length ? "Last in: " + edge.slice(0, 8).map(function (e) { return e.hand; }).join(", ") + "." : "";
  document.querySelectorAll("#rs-seats button").forEach(function (b) { b.classList.toggle("on", Math.abs(parseFloat(b.dataset.pct) - pct) < 0.01); });
}

(function initSlider() {
  var seats = $("rs-seats");
  RS_SEATS.forEach(function (x) {
    var b = el("button", "raiser", x[0] + " " + x[1] + "%");
    b.type = "button";
    b.dataset.pct = x[1];
    b.addEventListener("click", function () { $("rs-slider").value = x[1]; renderSlider(); });
    seats.append(b);
  });
  $("rs-slider").addEventListener("input", renderSlider);
  document.querySelectorAll("#rs-rank button").forEach(function (b) {
    b.addEventListener("click", function () {
      rsRank = b.dataset.rank;
      document.querySelectorAll("#rs-rank button").forEach(function (x) {
        var on = x === b; x.classList.toggle("on", on); x.setAttribute("aria-pressed", on ? "true" : "false");
      });
      renderSlider();
    });
  });
  renderSlider();
})();

// ===== SOMEONE LIMPED BEFORE YOU (live $1/2) =====
// Same rules as the practice table's Live mode: isolate strong hands with a big raise, over-limp hands
// that make big hidden hands (pairs, suited aces, suited connectors), fold the rest. The BB raises its
// top 10% and checks everything else for free.
var lpCount = 1;

function isSpeculativeHand(hand) {
  if (hand.length === 2) return true;
  if (hand[2] !== "s") return false;
  var order = "23456789TJQKA";
  return hand[0] === "A" || order.indexOf(hand[0]) - order.indexOf(hand[1]) <= 2;
}

function limpedAction(hand, seat) {
  var p = handPercentile(hand, false);
  if (seat === "BB") return p <= 0.1 ? "Raise" : "Check";
  var openLine = getRecommendation({ stage: "cash", stack: "deep", stackBB: 100, hero: seat, spot: "unopened", opener: null, hand: hand }).lines[0];
  var late = positionGroup(seat) === "late";
  if (p <= openLine * 0.8) return "Raise";
  if (isSpeculativeHand(hand) && (late || p <= 0.35)) return "Call";
  return "Fold";
}

function renderLimpGlance() {
  var pick = $("limp-pick");
  pick.replaceChildren();
  [1, 2, 3].forEach(function (n) {
    var b = el("button", "raiser" + (n === lpCount ? " on" : ""), n === 3 ? "3+ limpers" : n + (n === 1 ? " limper" : " limpers"));
    b.type = "button";
    b.setAttribute("aria-pressed", n === lpCount ? "true" : "false");
    b.addEventListener("click", function () { lpCount = n; renderLimpGlance(); });
    pick.append(b);
  });
  var iso = 13 + 4 * lpCount;
  $("limp-note").textContent = "Live $1/2, 100bb+. With " + (lpCount === 3 ? "3 or more limpers" : lpCount + (lpCount === 1 ? " limper" : " limpers")) +
    ", isolate to about $" + iso + " ($13 plus $4 per limper). Over-limping costs $2.";
  var host = $("limp-glance");
  host.replaceChildren();
  ["UTG+1", "UTG+2", "LJ", "HJ", "CO", "BTN", "SB", "BB"].forEach(function (seat) {
    var cells = [], combos = {};
    for (var r = 0; r < 13; r++) for (var c = 0; c < 13; c++) {
      var hand = handAt(r, c);
      var a = limpedAction(hand, seat);
      cells.push({ hand: hand, action: a });
      combos[a] = (combos[a] || 0) + combosOf(hand);
    }
    var fig = el("figure", "mini");
    var cap = el("figcaption");
    var info = seat === "BB" ? "Raise " + pctOfCombos(combos.Raise || 0) + " · check the rest"
      : "Raise " + pctOfCombos(combos.Raise || 0) + " · limp " + pctOfCombos(combos.Call || 0);
    cap.append(el("span", "pos-chip g-" + POSITION_INFO[seat].group.toLowerCase(), seat), el("span", "mini-pct", info));
    var size = seat === "BB" ? "Raise to about $" + (iso + 2) + ", or check for free"
      : seat === "SB" ? "Raise to about $" + (iso + 2) + " · complete for $1"
      : "Isolate to about $" + iso + " · over-limp $2";
    var gridHost = el("div");
    renderGrid(gridHost, { cells: cells, combos: combos }, true);
    fig.append(cap, el("p", "size-line", size), gridHost);
    host.append(fig);
  });
}

renderGlance();
renderThreeBetGlance();
renderLimpGlance();
renderPlayers();
["UTG", "BTN"].forEach(function (pos) {
  var chart = buildChart({ stage: "cash", stack: "deep", hero: pos, spot: "unopened", opener: null });
  $("rule-" + pos.toLowerCase()).textContent = pctOfCombos(chart.combos.Raise || 0);
});
renderExplorer();
