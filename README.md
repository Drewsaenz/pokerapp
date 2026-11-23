# Poker App

Three small, dependency-free Texas Hold'em training tools. Open any of the HTML files in a browser — no build step, no server.

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

Rather than hand-coding a range list for every combination of stage × position × stack × spot, `engine.js` ranks all 169 starting hands once and compares a hand's percentile against a threshold that's adjusted for the scenario:

1. **Two hand rankings.** `PLAY_RANKING` orders hands by playability (suited connectors and wheel aces rank high) and is used when stacks are deep enough to see flops. `SHOVE_RANKING` orders hands by all-in equity against a random hand (offsuit high cards rank high) and is used for short-stack push/fold spots.
2. **Base frequencies.** `OPEN_PCT` gives how often each position opens at 100bb; `SHOVE_PCT` gives open-jam frequencies at ~12bb; `VS_OPEN_PCT` and `VS_OPEN_SHORT_PCT` give 3-bet / call / re-jam frequencies by the opener's position group.
3. **Multipliers.** `HERO_VS_OPEN_MOD` adjusts for your own position (the BB defends wide, the SB mostly 3-bets or folds), `STACK_DEPTHS` tightens flat-calls at medium stacks, and `GAME_STAGES` applies tournament adjustments — wider opens once antes kick in, tighter calls under bubble and final-table ICM pressure, and shove ranges that widen as the stack shrinks.

The thresholds are approximations of common charts, not solver output. All the numbers are at the top of `engine.js` if you want to tune them.

## Practice Table (`holdem.html`)

A 9-handed table where you play full hands against eight bots, then get feedback on them.

- **Games**: cash (100bb, 40bb or 15bb buy-in) or a tournament whose blinds rise every 6, 10 or 15 hands, moving through the early, middle (big-blind ante), bubble and final-table stages. Busted bots are replaced so the table stays full.
- **Bots** each have a style shown on their seat: TAG (tight-aggressive), LAG (loose-aggressive), Nit (tight-passive) or Station (calling station). Pre-flop they play the simulator's chart ranges, widened or narrowed by style. Post-flop (`bots.js`) they:
  - estimate each opponent's range from that opponent's actions in the hand (an open, a 3-bet, a call, bets on earlier streets),
  - simulate a few hundred run-outs against those ranges to get their equity, without ever seeing your cards,
  - then value-bet, slow-play, c-bet, semi-bluff, bluff, raise, call or fold, at frequencies set by their style, sizing bets to the board.
- **Chart check**: after each hand, every pre-flop decision you made is graded against the chart: folded to you, facing a raise, facing a 3-bet (cold, after calling, or after opening), facing a 4-bet, facing an all-in or a stack-committing raise, and limped pots in the big blind.
- **See the rest of the hand**: when a hand ends without a showdown, reveal the cards that would have come next, everyone's hole cards, and who would have won if it had been checked down. It's hindsight, so it isn't sent to Claude reviews.
- **Saved progress** (`storage.js`): your table, every session's results, a results chart and your last 100 hands survive closing the page. On the hosted site they're saved in that browser (each device keeps its own). Opened as a Claude artifact, they're saved privately to your Claude account (last 40 hands) and follow you across devices.
- **Claude feedback**: opened as a Claude artifact, the page can send a hand (or your last 10) to Claude and show a review in the page. Anywhere else, use "Copy hand history" and paste it into a chat.

Hands are evaluated in `holdem.js` (best five of seven, side pots, split pots). `engine.js` holds the shared pre-flop ranges and `bots.js` the bots' hand reading and decisions.

## Hosting

Everything is static, so any static host works. On GitHub Pages: **Settings → Pages → Deploy from a branch → `main` / `(root)`**. The site then lives at `https://<user>.github.io/pokerapp/`, with the Action Generator at the root and `simulator.html` and `holdem.html` beside it. `.nojekyll` tells Pages to serve the files as-is.

On a hosted copy the Practice Table can't ask Claude for feedback in the page, since that only works inside Claude. It shows "Copy hand history" instead, for pasting into a chat.

## Updating the hosted site

GitHub Pages lets browsers reuse cached files for up to 10 minutes, so each page links its scripts and stylesheets with a version tag (`holdem.js?v=5`). When you change any `.js` or `.css` file, bump the `?v=` number in `index.html`, `simulator.html` and `holdem.html`, and the version label in the Practice Table header, so visitors get the new code on their next load.

## Files

```
index.html / app.js / style.css          Action Generator
simulator.html / simulator.js / simulator.css   Simulator
holdem.html / holdem.js / holdem.css      Practice Table
bots.js                                   Practice Table bot styles, hand reading and post-flop decisions
storage.js                                Practice Table saved progress (browser or Claude account)
engine.js                                 Pre-flop ranges shared by Simulator and Practice Table
casino.png                                Favicon
poker-5.jpg                               Background for the Action Generator
```
