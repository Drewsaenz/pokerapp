# Poker App

Two small, dependency-free Texas Hold'em pre-flop tools. Open either HTML file in a browser — no build step, no server.

## Pre-Flop Action Generator (`index.html`)

Pick your position, what you're facing, and type a hand (e.g. `AKs`, `T9o`, `77`). The app looks the hand up in hand-coded range lists and tells you whether to raise, 3-bet, 4-bet, call, limp or fold.

Covers:

- **Raise first in** from UTG through the Button, plus a Small Blind strategy split into value raises, bluff raises and limps
- **Facing an open** from each position (3-bet / call / fold)
- **Facing a 3-bet** after you opened (4-bet / call / fold)

Ranges live in `app.js` as plain arrays, so they're easy to tweak to your own preferred charts.

## Pre-Flop Simulator (`simulator.html`)

A trainer. You get dealt two cards into a scenario, pick an action, and get graded with an explanation and a running score.

Scenario dimensions (each can be fixed or left random):

| Dimension | Options |
| --- | --- |
| Game | Cash game · Tournament early · Tournament middle (antes) · Bubble · Final table |
| Position | Early (UTG–UTG+2) · Middle (LJ, HJ) · Late (CO, BTN) · Blinds (SB, BB) |
| Stack depth | Short (8–15bb) · Medium (25–40bb) · Deep (100bb+), or realistic for the stage |
| Action to you | Folded to you · Facing a raise |
| Hands dealt | Mostly tough spots (near the decision boundary) · Fully random |

Keyboard: `1`–`3` to choose an action, `Enter` or `Space` for the next hand.

### How the simulator decides

Rather than hand-coding a range list for every combination of stage × position × stack × spot, `simulator.js` ranks all 169 starting hands once and compares a hand's percentile against a threshold that's adjusted for the scenario:

1. **Two hand rankings.** `PLAY_RANKING` orders hands by playability (suited connectors and wheel aces rank high) and is used when stacks are deep enough to see flops. `SHOVE_RANKING` orders hands by all-in equity against a random hand (offsuit high cards rank high) and is used for short-stack push/fold spots.
2. **Base frequencies.** `OPEN_PCT` gives how often each position opens at 100bb; `SHOVE_PCT` gives open-jam frequencies at ~12bb; `VS_OPEN_PCT` and `VS_OPEN_SHORT_PCT` give 3-bet / call / re-jam frequencies by the opener's position group.
3. **Multipliers.** `HERO_VS_OPEN_MOD` adjusts for your own position (the BB defends wide, the SB mostly 3-bets or folds), `STACK_DEPTHS` tightens flat-calls at medium stacks, and `GAME_STAGES` applies tournament adjustments — wider opens once antes kick in, tighter calls under bubble and final-table ICM pressure, and shove ranges that widen as the stack shrinks.

The thresholds are approximations of common charts, not solver output. All the numbers are at the top of `simulator.js` if you want to tune them.

## Files

```
index.html / app.js / style.css          Action Generator
simulator.html / simulator.js / simulator.css   Simulator
casino.png                                Favicon
poker-5.jpg                               Background for the Action Generator
```
