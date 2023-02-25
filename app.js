function getAction() {
  var position = document.getElementById("position").value;
  var facing = document.getElementById("facing").value;
  var hand = document.getElementById("hand").value;

  var recommendedAction = get_action(position, facing, hand);

  document.getElementById("action").innerHTML = recommendedAction;
  var actionElement = document.getElementById("action");

  if (recommendedAction === "Raise") {
    document.getElementById("action").style.backgroundColor = "green";
  } else if (recommendedAction === "Fold") {
    document.getElementById("action").style.backgroundColor = "red";
  } else if (recommendedAction === "Raise for Value") {
    document.getElementById("action").style.backgroundColor = "green";
  } else if (recommendedAction === "Raise as a Bluff") {
    document.getElementById("action").style.backgroundColor = "blue";
  } else if (recommendedAction === "Limp / Call") {
    document.getElementById("action").style.backgroundColor = "orange";
  } else {
    document.getElementById("action").style.backgroundColor = "white";
  }

  actionElement.innerHTML = recommendedAction;
  actionElement.classList.add("visible");
}

function get_action(position, facing, hand) {
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
      "JTs", "J9s", "ATs", "TT", "T9s", "99", "98s", "88", "87s", "77",
      "76s", "66", "65s", "55", "44"
    ],
    "HJ": [
      "AA", "AKs", "AQs", "AJs", "ATs", "A9s", "A8s", "A7s", "A6s", "A5s", "A4s", "A3s", "A2s",
      "AKo", "KK", "KQs", "KJs", "KTs", "K9s", "K8s",
      "AQo", "KQo", "QQ", "QJs", "QTs", "Q9s",
      "AJo", "KJo", "QJo", "JJ", "JTs", "J9s",
      "ATs", "TT", "T9s",
      "99", "98s", "88", "87s", "77", "76s", "66", "65s", "55", "54s", "44", "33", "22"
    ],
    "CO": [
      "AA", "AKs", "AQs", "AJs", "ATs", "A9s", "A8s", "A7s", "A6s", "A5s", "A4s", "A3s", "A2s",
      "AKo", "KK", "KQs", "KJs", "KTs", "K9s", "K8s", "K7s",
      "AQo", "KQo", "QQ", "QJs", "QTs", "Q9s", "Q8s",
      "AJo", "KJo", "QJo", "JJ", "JTs", "J9s", "J8s",
      "ATs", "KTo", "QTo", "JTo", "TT", "T9s", "T8s",
      "A9o", "99", "98s", "97s",
      "88", "87s", "86s", "77", "76s", "75s", "66", "65s", "64s", "55", "54s", "44", "33", "22"
    ],
    "Button": [
      "AA", "AKs", "AQs", "AJs", "ATs", "A9s", "A8s", "A7s", "A6s", "A5s", "A4s", "A3s", "A2s",
      "AKo", "KK", "KQs", "KJs", "KTs", "K9s", "K8s", "K7s", "K6s", "K4s", "K4s", "K3s", "K2s",
      "AQo", "KQo", "QQ", "QJs", "QTs", "Q9s", "Q8s", "Q7s", "Q6s", "Q4s", "Q4s", "Q3s", "Q2s",
      "AJo", "KJo", "QJo", "JJ", "JTs", "J9s", "J8s", "J7s", "J6s",
      "ATs", "KTo", "QTo", "JTo", "TT", "T9s", "T8s", "T7s", "T6s",
      "A9o", "K9o", "Q9o", "J9o", "T9o", "99", "98s", "97s", "96s",
      "A8o", "K8o", "Q8o", "J8o", "T8o", "98o", "98s", "88", "87s", "86s", "85s",
      "A7o", "K7o", "97o", "87o", "77", "76s", "75s", "74s",
      "A6o", "76o", "66", "65s", "64s",
      "A5o", "55", "54s", "53s", "A4o", "44", "43s", "A3o", "33", "32s", "A2o", "22"
    ]
  };
  const rfiRaiseValueHand = {
    "Small Blind": [
      "AKs", "AQs", "AJs", "ATs", "KQs", "KJs", "AQo", "KQo", "QQ", "QJs", "AJo", "KJo", "JJ",
      "ATo", "TT", "99", "88",
    ]
  }
  const rfiRaiseBluffHand = {
    "Small Blind": [
      "J4s", "J2s", "J2s", "T5s", "T4s", "95s", "94s", "85s", "84s", "74s",
      "J6o", "T6o", "96o", "86o", "63s", "Q5o", "53s", "Q4o", "43s",
      "K3o", "Q3o", "K2o", "Q2o"
    ]
  }
  const rfiLimpHand = {
    "Small Blind": [
      "AA", "A9s", "A8s", "A7s", "A6s", "A5s", "A4s", "A3s", "A2s",
      "AKo", "KK", "KTs", "K9s", "K8s", "K7s", "K6s", "K4s", "K4s", "K3s", "K2s",
      "QTs", "Q9s", "Q8s", "Q7s", "Q6s", "Q4s", "Q4s", "Q3s", "Q2s",
      "QJo", "JTs", "J9s", "J8s", "J7s", "J6s", "J5s",
      "ATs", "KTo", "QTo", "JTo", "TT", "T9s", "T8s", "T7s", "T6s",
      "A9o", "K9o", "Q9o", "J9o", "T9o", "98s", "97s", "96s",
      "A8o", "K8o", "Q8o", "J8o", "T8o", "98o", "98s", "87s", "86s",
      "A7o", "K7o", "97o", "87o", "77", "76s", "75s",
      "A6o", "K6o", "Q6o", "76o", "66", "65s", "64s",
      "A5o", "K5o", "65o", "55", "54s",
      "A4o", "K4o", "44", "A3o", "33", "32s", "A2o", "22"
    ]
  }

  if (rfiRaiseHands[position] && facing === "Raise First In") {
    if (rfiRaiseHands[position].includes(hand)) {
      return "Raise";
    } else {
      console.log("Raise If-statement")
      return "Fold";
    }
  } if (rfiRaiseValueHand[position] && facing === "Raise First In") {
    if (rfiRaiseValueHand[position].includes(hand)) {
      return "Raise for Value";
    } if (rfiRaiseBluffHand[position].includes(hand)) {
      return "Raise as a Bluff";
    } if (rfiLimpHand[position].includes(hand)) {
      return "Limp / Call";
    } else {
      return "Fold"
    }
  } else {
    return "Fold";
  }
}


const form = document.getElementById("my-form");
form.addEventListener("keydown", function (event) {
  if (event.key === "Enter") {
    event.preventDefault(); // Prevent the form from submitting
    getAction(); // Call the getAction function
  }
});
