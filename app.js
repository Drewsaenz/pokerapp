function getAction() {
  var position = document.getElementById("position").value;
  var facing = document.getElementById("facing").value;
  var hand = document.getElementById("hand").value.trim();

  if (!hand) {
    var el = document.getElementById("action");
    el.innerHTML = "Enter a hand";
    el.style.backgroundColor = "gray";
    el.classList.add("visible");
    return;
  }

  var recommendedAction = get_action(position, facing, hand);

  var actionElement = document.getElementById("action");
  actionElement.innerHTML = recommendedAction;
  actionElement.classList.add("visible");

  var colors = {
    "Raise": "green",
    "3-Bet": "green",
    "4-Bet": "green",
    "Raise for Value": "green",
    "Raise as a Bluff": "blue",
    "Call": "orange",
    "Limp / Call": "orange",
    "Fold": "red"
  };
  actionElement.style.backgroundColor = colors[recommendedAction] || "white";
}

function get_action(position, facing, hand) {

  // ===== RAISE FIRST IN (RFI) RANGES =====

  const rfiRaiseHands = {
    "UTG": [
      "AA", "AKs", "AQs", "AJs", "ATs", "A9s", "A5s", "AKo",
      "KK", "KQs", "KJs", "KTs", "AQo", "QQ", "QJs", "QTs",
      "JJ", "JTs", "TT", "T9s", "99", "98s", "88", "77", "66"
    ],
    "UTG+1": [
      "AA", "AKs", "AQs", "AJs", "ATs", "A9s", "A8s", "A7s", "A6s",
      "A5s", "A4s", "AKo", "KK", "KQs", "KJs", "KTs", "K9s",
      "AQo", "KQo", "QQ", "QJs", "QTs", "Q9s", "AJo", "JJ", "JTs",
      "J9s", "TT", "T9s", "99", "98s", "88", "87s", "77", "66"
    ],
    "UTG+2": [
      "AA", "AKs", "AQs", "AJs", "ATs", "A9s", "A8s", "A7s", "A6s",
      "A5s", "A4s", "A3s", "A2s", "AKo", "KK", "KQs", "KJs", "KTs",
      "K9s", "AQo", "KQo", "QQ", "QJs", "QTs", "Q9s", "AJo", "JJ",
      "JTs", "J9s", "TT", "T9s", "99", "98s", "88", "87s", "77",
      "76s", "66", "55"
    ],
    "LJ": [
      "AA", "AKs", "AQs", "AJs", "ATs", "A9s", "A8s", "A7s", "A6s",
      "A5s", "A4s", "A3s", "A2s", "AKo", "KK", "KQs", "KJs", "KTs",
      "K9s", "AQo", "KQo", "QQ", "QJs", "QTs", "Q9s", "AJo", "KJo", "JJ",
      "JTs", "J9s", "TT", "T9s", "99", "98s", "88", "87s", "77",
      "76s", "66", "65s", "55", "44"
    ],
    "HJ": [
      "AA", "AKs", "AQs", "AJs", "ATs", "A9s", "A8s", "A7s", "A6s", "A5s", "A4s", "A3s", "A2s",
      "AKo", "KK", "KQs", "KJs", "KTs", "K9s", "K8s",
      "AQo", "KQo", "QQ", "QJs", "QTs", "Q9s",
      "AJo", "KJo", "QJo", "JJ", "JTs", "J9s",
      "ATo", "TT", "T9s",
      "99", "98s", "88", "87s", "77", "76s", "66", "65s", "55", "54s", "44", "33", "22"
    ],
    "CO": [
      "AA", "AKs", "AQs", "AJs", "ATs", "A9s", "A8s", "A7s", "A6s", "A5s", "A4s", "A3s", "A2s",
      "AKo", "KK", "KQs", "KJs", "KTs", "K9s", "K8s", "K7s",
      "AQo", "KQo", "QQ", "QJs", "QTs", "Q9s", "Q8s",
      "AJo", "KJo", "QJo", "JJ", "JTs", "J9s", "J8s",
      "ATo", "KTo", "QTo", "JTo", "TT", "T9s", "T8s",
      "A9o", "99", "98s", "97s",
      "88", "87s", "86s", "77", "76s", "75s", "66", "65s", "64s", "55", "54s", "44", "33", "22"
    ],
    "Button": [
      "AA", "AKs", "AQs", "AJs", "ATs", "A9s", "A8s", "A7s", "A6s", "A5s", "A4s", "A3s", "A2s",
      "AKo", "KK", "KQs", "KJs", "KTs", "K9s", "K8s", "K7s", "K6s", "K5s", "K4s", "K3s", "K2s",
      "AQo", "KQo", "QQ", "QJs", "QTs", "Q9s", "Q8s", "Q7s", "Q6s", "Q5s", "Q4s", "Q3s", "Q2s",
      "AJo", "KJo", "QJo", "JJ", "JTs", "J9s", "J8s", "J7s", "J6s",
      "ATo", "KTo", "QTo", "JTo", "TT", "T9s", "T8s", "T7s", "T6s",
      "A9o", "K9o", "Q9o", "J9o", "T9o", "99", "98s", "97s", "96s",
      "A8o", "K8o", "Q8o", "J8o", "T8o", "98o", "88", "87s", "86s", "85s",
      "A7o", "K7o", "97o", "87o", "77", "76s", "75s", "74s",
      "A6o", "76o", "66", "65s", "64s",
      "A5o", "55", "54s", "53s", "A4o", "44", "43s", "A3o", "33", "32s", "A2o", "22"
    ]
  };

  // Small Blind RFI has three categories: value raises, bluff raises, and limps
  const rfiRaiseValueHand = {
    "Small Blind": [
      "AA", "AKs", "AQs", "AJs", "ATs", "KQs", "KJs", "AQo", "KQo", "QQ", "QJs", "AJo", "KJo", "JJ",
      "ATo", "TT", "99", "88"
    ]
  };
  const rfiRaiseBluffHand = {
    "Small Blind": [
      "J4s", "J2s", "T5s", "T4s", "95s", "94s", "85s", "84s", "74s",
      "J6o", "T6o", "96o", "86o", "63s", "Q5o", "53s", "Q4o", "43s",
      "K3o", "Q3o", "K2o", "Q2o"
    ]
  };
  const rfiLimpHand = {
    "Small Blind": [
      "A9s", "A8s", "A7s", "A6s", "A5s", "A4s", "A3s", "A2s",
      "AKo", "KK", "KTs", "K9s", "K8s", "K7s", "K6s", "K5s", "K4s", "K3s", "K2s",
      "QTs", "Q9s", "Q8s", "Q7s", "Q6s", "Q5s", "Q4s", "Q3s", "Q2s",
      "QJo", "JTs", "J9s", "J8s", "J7s", "J6s", "J5s",
      "KTo", "QTo", "JTo", "T9s", "T8s", "T7s", "T6s",
      "A9o", "K9o", "Q9o", "J9o", "T9o", "98s", "97s", "96s",
      "A8o", "K8o", "Q8o", "J8o", "T8o", "98o", "87s", "86s",
      "A7o", "K7o", "97o", "87o", "77", "76s", "75s",
      "A6o", "K6o", "Q6o", "76o", "66", "65s", "64s",
      "A5o", "K5o", "65o", "55", "54s",
      "A4o", "K4o", "44", "A3o", "33", "32s", "A2o", "22"
    ]
  };

  // ===== FACING RFI (3-BET / CALL / FOLD) RANGES =====
  // Keyed by opener position

  const facingRfi3BetHands = {
    "UTG": [
      "AA", "KK", "QQ", "AKs", "AKo", "A5s", "A4s"
    ],
    "UTG+1": [
      "AA", "KK", "QQ", "AKs", "AKo", "AQs", "A5s", "A4s", "A3s"
    ],
    "UTG+2": [
      "AA", "KK", "QQ", "JJ", "AKs", "AKo", "AQs", "A5s", "A4s", "A3s", "A2s"
    ],
    "LJ": [
      "AA", "KK", "QQ", "JJ", "AKs", "AKo", "AQs", "AQo", "A5s", "A4s", "A3s", "A2s", "K5s"
    ],
    "HJ": [
      "AA", "KK", "QQ", "JJ", "TT", "AKs", "AKo", "AQs", "AQo", "AJs",
      "A5s", "A4s", "A3s", "A2s", "K5s", "76s"
    ],
    "CO": [
      "AA", "KK", "QQ", "JJ", "TT", "AKs", "AKo", "AQs", "AQo", "AJs", "KQs",
      "A5s", "A4s", "A3s", "A2s", "K5s", "87s", "76s", "65s"
    ],
    "Button": [
      "AA", "KK", "QQ", "JJ", "TT", "99", "AKs", "AKo", "AQs", "AQo", "AJs", "ATs", "KQs", "KJs",
      "A5s", "A4s", "A3s", "A2s", "K5s", "K4s", "97s", "87s", "76s", "65s", "54s"
    ],
    "SB": [
      "AA", "KK", "QQ", "JJ", "TT", "99", "AKs", "AKo", "AQs", "AQo", "AJs", "ATs", "KQs", "KJs", "QJs",
      "A8s", "A7s", "A6s", "A5s", "A4s", "A3s", "A2s", "K5s", "K4s", "K3s", "97s", "87s", "76s", "65s", "54s"
    ]
  };

  const facingRfiCallHands = {
    "UTG": [
      "JJ", "TT", "99", "AQs", "AJs", "ATs", "KQs", "KJs"
    ],
    "UTG+1": [
      "JJ", "TT", "99", "AJs", "ATs", "KQs", "KJs", "QJs"
    ],
    "UTG+2": [
      "TT", "99", "88", "AJs", "ATs", "A9s", "KQs", "KJs", "KTs", "QJs", "JTs"
    ],
    "LJ": [
      "TT", "99", "88", "77", "AJs", "ATs", "A9s", "KQs", "KJs", "KTs", "QJs", "QTs", "JTs", "T9s"
    ],
    "HJ": [
      "99", "88", "77", "ATs", "A9s", "KJs", "KTs", "QJs", "QTs", "JTs", "T9s", "98s"
    ],
    "CO": [
      "99", "88", "77", "66", "A9s", "A8s", "KTs", "K9s", "QTs", "Q9s", "JTs", "J9s", "T9s", "98s", "87s"
    ],
    "Button": [
      "88", "77", "66", "55", "A9s", "A8s", "A7s", "A6s", "K9s", "K8s", "Q9s", "Q8s",
      "J9s", "J8s", "T9s", "T8s", "98s", "97s", "87s", "86s", "76s", "75s", "65s", "64s", "54s"
    ],
    "SB": [
      "88", "77", "66", "A9s", "A8s", "A7s", "K9s", "K8s", "Q9s", "J9s", "T9s", "98s", "87s", "76s"
    ]
  };

  // ===== VS 3-BET (4-BET / CALL / FOLD) RANGES =====
  // Keyed by the facing dropdown value

  const vs3Bet4BetHands = {
    "UTG RFI vs 3bet": [
      "AA", "KK", "QQ", "AKs", "AKo"
    ],
    "UTG+1 RFI vs 3bet": [
      "AA", "KK", "QQ", "AKs", "AKo"
    ],
    "UTG+2 RFI vs 3bet": [
      "AA", "KK", "QQ", "AKs", "AKo", "AQs"
    ],
    "LJ RFI vs 3bet": [
      "AA", "KK", "QQ", "JJ", "AKs", "AKo", "AQs"
    ],
    "HJ/CO RFI vs 3bet": [
      "AA", "KK", "QQ", "JJ", "TT", "AKs", "AKo", "AQs", "AQo"
    ],
    "BTN/SB RFI vs 3bet": [
      "AA", "KK", "QQ", "JJ", "TT", "AKs", "AKo", "AQs", "AQo", "AJs"
    ]
  };

  const vs3BetCallHands = {
    "UTG RFI vs 3bet": [
      "JJ", "TT", "AQs", "AJs"
    ],
    "UTG+1 RFI vs 3bet": [
      "JJ", "TT", "AQs", "AJs", "ATs"
    ],
    "UTG+2 RFI vs 3bet": [
      "JJ", "TT", "99", "AJs", "ATs", "KQs"
    ],
    "LJ RFI vs 3bet": [
      "TT", "99", "AQo", "AJs", "ATs", "KQs", "KJs"
    ],
    "HJ/CO RFI vs 3bet": [
      "99", "88", "AJs", "ATs", "A9s", "KQs", "KJs", "QJs", "JTs"
    ],
    "BTN/SB RFI vs 3bet": [
      "99", "88", "77", "A9s", "A8s", "KQs", "KJs", "KTs", "QJs", "QTs", "JTs", "T9s", "98s"
    ]
  };

  // ===== DECISION LOGIC =====

  // 1) Raise First In
  if (facing === "Raise First In") {
    // Small Blind has special categories
    if (position === "Small Blind") {
      if (rfiRaiseValueHand["Small Blind"].includes(hand)) {
        return "Raise for Value";
      } else if (rfiRaiseBluffHand["Small Blind"].includes(hand)) {
        return "Raise as a Bluff";
      } else if (rfiLimpHand["Small Blind"].includes(hand)) {
        return "Limp / Call";
      } else {
        return "Fold";
      }
    }
    // All other positions
    if (rfiRaiseHands[position] && rfiRaiseHands[position].includes(hand)) {
      return "Raise";
    }
    return "Fold";
  }

  // 2) Facing an RFI (3-bet / call / fold)
  if (facing.startsWith("Facing ")) {
    var opener = facing.replace("Facing ", "");
    if (facingRfi3BetHands[opener] && facingRfi3BetHands[opener].includes(hand)) {
      return "3-Bet";
    } else if (facingRfiCallHands[opener] && facingRfiCallHands[opener].includes(hand)) {
      return "Call";
    }
    return "Fold";
  }

  // 3) You opened with an RFI and got 3-bet (4-bet / call / fold)
  if (facing.endsWith("vs 3bet")) {
    if (vs3Bet4BetHands[facing] && vs3Bet4BetHands[facing].includes(hand)) {
      return "4-Bet";
    } else if (vs3BetCallHands[facing] && vs3BetCallHands[facing].includes(hand)) {
      return "Call";
    }
    return "Fold";
  }

  return "Fold";
}


const form = document.getElementById("my-form");
form.addEventListener("keydown", function (event) {
  if (event.key === "Enter") {
    event.preventDefault();
    getAction();
  }
});
