// ===== UI =====

var state = {
  scenario: null,
  recommendation: null,
  answered: false,
  hands: 0,
  correct: 0,
  streak: 0,
  bestStreak: 0
};

function readFilters() {
  return {
    stage: document.getElementById("filter-stage").value,
    position: document.getElementById("filter-position").value,
    stack: document.getElementById("filter-stack").value,
    spot: document.getElementById("filter-spot").value,
    hands: document.getElementById("filter-hands").value
  };
}

function renderCard(card) {
  var suit = SUITS[card.suit];
  var el = document.createElement("div");
  el.className = "card " + suit.color;
  el.setAttribute("aria-label", faceRank(card.rank) + " of " + suit.name);
  el.innerHTML =
    '<span class="corner top">' + faceRank(card.rank) + "<br>" + suit.sym + "</span>" +
    '<span class="pip">' + suit.sym + "</span>" +
    '<span class="corner bottom">' + faceRank(card.rank) + "<br>" + suit.sym + "</span>";
  return el;
}

function renderSeats(s) {
  var seats = document.getElementById("seats");
  seats.innerHTML = "";
  POSITIONS.forEach(function (pos) {
    var seat = document.createElement("div");
    seat.className = "seat";
    if (pos === s.hero) seat.classList.add("hero");
    if (pos === s.opener) seat.classList.add("raiser");
    if (pos === "BTN") seat.classList.add("dealer");
    var tag = pos === s.hero ? "You" : (pos === s.opener ? "Raise" : "");
    seat.innerHTML = '<span class="seat-pos">' + pos + '</span><span class="seat-tag">' + tag + "</span>";
    seats.appendChild(seat);
  });
}

function describeScenario(s) {
  var stage = GAME_STAGES[s.stage].label;
  var depth = STACK_DEPTHS[s.stack].label.toLowerCase();
  var actionLine = s.spot === "unopened"
    ? "It folds around to you."
    : "The " + s.opener + " opens to " + (s.stack === "short" ? "2.1" : "2.5") + "bb. Everyone else folds to you.";
  return {
    title: stage,
    meta: "9-handed · You're in the <strong>" + s.hero + "</strong> with a " + depth + " stack of <strong>" + s.stackBB + "bb</strong>",
    action: actionLine
  };
}

function dealNewHand() {
  state.scenario = buildScenario(readFilters());
  state.recommendation = getRecommendation(state.scenario);
  state.answered = false;

  var s = state.scenario;
  var desc = describeScenario(s);
  document.getElementById("scenario-title").textContent = desc.title;
  document.getElementById("scenario-meta").innerHTML = desc.meta;
  document.getElementById("scenario-action").textContent = desc.action;

  renderSeats(s);

  var cardsEl = document.getElementById("cards");
  cardsEl.innerHTML = "";
  s.cards.forEach(function (c) { cardsEl.appendChild(renderCard(c)); });
  document.getElementById("hand-label").textContent = s.hand;

  var choices = document.getElementById("choices");
  choices.innerHTML = "";
  actionChoices(s).forEach(function (label) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "choice " + label.toLowerCase().replace(/[^a-z]/g, "");
    btn.textContent = label;
    btn.addEventListener("click", function () { answer(label); });
    choices.appendChild(btn);
  });

  var result = document.getElementById("result");
  result.className = "result hidden";
  document.getElementById("stage").classList.remove("answered");
}

function answer(choice) {
  if (state.answered) return;
  state.answered = true;

  var correct = choice === state.recommendation.action;
  state.hands += 1;
  if (correct) {
    state.correct += 1;
    state.streak += 1;
    state.bestStreak = Math.max(state.bestStreak, state.streak);
  } else {
    state.streak = 0;
  }

  document.querySelectorAll("#choices .choice").forEach(function (btn) {
    btn.disabled = true;
    if (btn.textContent === state.recommendation.action) btn.classList.add("correct");
    else if (btn.textContent === choice) btn.classList.add("wrong");
  });

  var result = document.getElementById("result");
  result.className = "result " + (correct ? "good" : "bad");
  document.getElementById("result-verdict").textContent = correct
    ? "Correct — " + state.recommendation.action
    : "Not quite — recommended: " + state.recommendation.action;
  document.getElementById("result-explanation").textContent = state.recommendation.explanation;
  document.getElementById("stage").classList.add("answered");

  updateScore();
}

function updateScore() {
  document.getElementById("score-hands").textContent = state.hands;
  document.getElementById("score-correct").textContent = state.correct;
  document.getElementById("score-accuracy").textContent = state.hands
    ? Math.round((state.correct / state.hands) * 100) + "%"
    : "–";
  document.getElementById("score-streak").textContent = state.streak;
  document.getElementById("score-best").textContent = state.bestStreak;
}

function syncStageVisibility() {
  var stage = document.getElementById("filter-stage").value;
  document.getElementById("stage-note").textContent = stage === "random" ? "" : STAGE_NOTES[stage];
}

document.getElementById("deal").addEventListener("click", dealNewHand);
document.getElementById("next").addEventListener("click", dealNewHand);
document.getElementById("filter-stage").addEventListener("change", syncStageVisibility);
document.getElementById("reset-score").addEventListener("click", function () {
  state.hands = 0; state.correct = 0; state.streak = 0; state.bestStreak = 0;
  updateScore();
});

document.addEventListener("keydown", function (e) {
  if (e.target.tagName === "SELECT") return;
  if (e.key === "Enter" || e.key === " ") {
    if (state.answered || !state.scenario) { e.preventDefault(); dealNewHand(); }
    return;
  }
  if (!state.scenario || state.answered) return;
  var choices = actionChoices(state.scenario);
  var idx = parseInt(e.key, 10) - 1;
  if (idx >= 0 && idx < choices.length) answer(choices[idx]);
});

syncStageVisibility();
updateScore();
dealNewHand();
