// Range charts: every chart is computed from engine.js, so it matches the simulator, the chart check and the bots.

const GRID_RANKS = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"];
const OPENERS_ORDER = ["UTG", "UTG+1", "UTG+2", "LJ", "HJ", "CO", "BTN", "SB", "BB"];
const STACK_BB = { deep: 100, mid: 30, short: 12 };

const ACTION_STYLE = {
  "Raise": { cls: "a-raise", label: "Raise" },
  "3-Bet": { cls: "a-3bet", label: "3-bet" },
  "All-In": { cls: "a-allin", label: "All-in" },
  "Call": { cls: "a-call", label: "Call" },
  "Fold": { cls: "a-fold", label: "Fold" }
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
    fig.append(cap, gridHost);
    host.append(fig);
  });
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
  return spot + ", " + stackText + ", " + game + ": " + (parts.length ? parts.join(", ") : "nothing") +
    " of all starting hands, and fold the rest. " + STAGE_NOTES[opts.stage];
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

renderPositions();
renderGlance();
["UTG", "BTN"].forEach(function (pos) {
  var chart = buildChart({ stage: "cash", stack: "deep", hero: pos, spot: "unopened", opener: null });
  $("rule-" + pos.toLowerCase()).textContent = pctOfCombos(chart.combos.Raise || 0);
});
renderExplorer();
