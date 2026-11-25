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

1. **Two hand rankings, measured in real combos.** A hand's percentile is its share of all 1,326 starting combos counting it and every stronger hand (pairs are 6 combos, suited hands 4, offsuit 12), so the percentages below match real-world charts. `PLAY_RANKING` orders hands by playability (suited connectors and wheel aces rank high) and is used when stacks are deep enough to see flops. `SHOVE_RANKING` orders hands by all-in equity against a random hand (offsuit high cards rank high) and is used for short-stack push/fold spots.
2. **Base frequencies.** `OPEN_PCT` gives how often each position opens at 100bb; `SHOVE_PCT` gives open-jam frequencies at ~12bb; `VS_OPEN_PCT` and `VS_OPEN_SHORT_PCT` give 3-bet / call / re-jam frequencies by the opener's position group.
3. **Multipliers.** `HERO_VS_OPEN_MOD` adjusts for your own position (the BB defends wide, the SB mostly 3-bets or folds), `STACK_DEPTHS` tightens flat-calls at medium stacks, and `GAME_STAGES` applies tournament adjustments — wider opens once antes kick in, tighter calls under bubble and final-table ICM pressure, and shove ranges that widen as the stack shrinks.

The thresholds are approximations of common charts, not solver output. All the numbers are at the top of `engine.js` if you want to tune them.

## Range Charts (`charts.html`)

A cheat sheet for positions and pre-flop ranges, computed live from `engine.js`, so it always matches the simulator, the chart check and the bots:

- **Positions**: every seat's group, acting order before and after the flop, how often it opens, and what that seat means in practice.
- **Opening ranges at a glance**: a 13×13 grid for each seat, folded to you at 100bb.
- **Range explorer**: pick folded-to-you or facing a raise, your seat, the raiser, stack depth and game stage, and see the full raise / 3-bet / call / all-in / fold chart with its share of hands.
- **Player types**: tight vs loose and passive vs aggressive, with what each type (TAG, LAG, Nit, calling station) means, how they play, how to spot them, how to beat them, and the practice-table bots' actual numbers for that style.
- **Rules of thumb** for using them.

## Practice Table (`holdem.html`)

A 9-handed table where you play full hands against eight bots, then get feedback on them.

- **Games**: cash (100bb, 40bb or 15bb buy-in) or a tournament whose blinds rise every 6, 10 or 15 hands, moving through the early, middle (big-blind ante), bubble and final-table stages. Busted bots are replaced so the table stays full.
- **Live $1/2 mode**: simulates a live Texas card room (tuned from Lodge, Texas Card House and Austin vlog footage). Bots buy in for $200-$300 (the max), but you sit down at a game that's been running: about a third of the table has already won, some with $500-900 stacks. Open to $10-15 most of the time and $20-40 about a quarter of the time (a multiple of the straddle when there is one) plus $3-5 per limper, sometimes limp AA/KK/AK early to re-raise, call down lighter and bluff less (except the LAGs), and straddle $5 most of the time, sometimes $10 or $20; limp and limp-call a lot, call raises wide (so pots go multiway), and the table leans heavily toward calling stations and loose players. About 30% of hands have a $5 straddle that acts last pre-flop. Passive players 3-bet only premiums and size post-flop bets by strength. Your chart check and range view switch to live advice: bigger opens, isolation raises over limpers, over-limping speculative hands, folding dominated offsuit hands early, tighter calls against big multiway opens, and set-mining deep.
- **Your seat**: leave it on "Rotates" for normal play, or lock yourself into one position (UTG through the big blind) to drill it hand after hand. It applies from the next hand, mid-session. On short tables, seats that don't exist (UTG at 6-handed) fall back to first to act.
- **Table size**: 9-handed, 6-handed, or "Varies", where (in cash games) players leave and sit down between hands, anywhere from 3 to 9. Short-handed tables drop the earliest positions, so 6-handed runs LJ, HJ, CO, BTN, SB, BB with those seats' ranges.
- **Re-raise sizes**: 3-bet buttons are about 3.25× the raise in position and 4× out of position, plus one more raise-size per caller; 4-bets are about 2.4× in position and 2.65× out of it, each with a bigger option. Bots use the same sizes.
- **Tight spots in the chart**: facing a raise and a 3-bet, 4-bet only AA, KK and AK (QQ calls in position); facing a limp-reraise, 4-bet AA and KK, call QQ and AK, fold the rest; in Live mode after your open is 3-bet, 4-bet AA, KK and AK, call a few pairs and suited Broadways, and fold offsuit hands; and with a raise and a call in front of you, 3-bet or fold offsuit hands.
- **Bots** each have a style shown on their seat: TAG (tight-aggressive), LAG (loose-aggressive), Nit (tight-passive) or Station (calling station). Pre-flop they play the simulator's chart ranges, widened or narrowed by style. Post-flop (`bots.js`) they:
  - estimate each opponent's range from that opponent's actions in the hand (an open, a 3-bet, a call, bets on earlier streets),
  - simulate a few hundred run-outs against those ranges to get their equity, without ever seeing your cards,
  - then value-bet, slow-play, c-bet, semi-bluff, bluff, raise, call or fold, at frequencies set by their style, sizing bets to the board.
- **bb or $**: a switch in the options panel shows every amount in big blinds or in dollars ($1/$2 blinds, so 100bb is $200; chip counts in tournaments). Hand histories sent to Claude stay in big blinds. Buy-ins are listed in dollars ($200 default, up to $300).
- **Mini chart**: on every pre-flop decision, a colors-only chart in the table's corner shows the range for your spot with your hand enlarged and ringed in white, still in its chart color, and the chart's action above it. Tap it for the full range view.
- **Chart on/off**: switch the chart off in the options bar to play unassisted: no mini chart, no range view, and the misclick guard stops quoting the chart (it still asks twice for 25bb+). Hands are still graded against the chart afterwards, and the Session panel compares your on-chart rate without the chart to with it. Turning the chart back on mid-hand counts that hand as assisted.
- **Range view**: while deciding pre-flop, press R or tap Range view to see the full chart for your exact seat and situation (folded to you, limpers, facing a raise, a 3-bet, a 4-bet or an all-in), with your hand outlined and the chart's reasoning.
- **Chart check**: after each hand, every pre-flop decision you made is graded against the chart: folded to you, facing a raise, facing a 3-bet (cold, after calling, or after opening), facing a 4-bet, facing an all-in or a stack-committing raise, and limped pots in the big blind.
- **You have**: a line under the board always says what you're holding in plain English, e.g. "Top pair (Jacks), King kicker · flush draw", "Overpair (Queens)" or "KJ suited" before the flop.
- **Everyone's cards at the end**: when a hand ends, every player's hole cards turn face up on the table, folded players included (dimmed), and the run-out is shown when the hand ended early. Hide it per hand if you like.
- **Play it again**: after any hand, "Play hand N again" deals it again with the same seats, stacks and cards. Every random choice in a hand (the shuffle, bot decisions, bet sizes) comes from a per-hand seed, so the bots repeat their moves until you do something different, and then react to what you actually did. Replays are practice: they skip ahead to your first decision, aren't counted in your stats or saved to your hands, and aren't sent for review. The real table comes back when you deal the next hand.
- **Undo last hand**: until you deal again, "Undo hand N" (tap twice) puts every stack, the button and the blind level back to before your most recent hand and removes it from your stats, saved hands, chart check and archive. One undo per deal.
- **Misclick guard**: pre-flop calls and raises the chart says to fold, and any move that puts in 25bb or more, need a second tap (the button lights up and says why). Turn it off with the "Misclick guard" link under the action buttons.
- **See the rest of the hand**: when a hand ends without a showdown, reveal the cards that would have come next, everyone's hole cards, and who would have won if it had been checked down. It's hindsight, so it isn't sent to Claude reviews.
- **Hand archive**: every hand is kept as its written history (plus any review) until you erase it. "Download all hands" saves a .txt file and "Copy all hands" copies it, ready to paste into a Claude chat. In the Claude version the archive lives on your Claude account where the page's owner can read it, so Claude can pull your hands into a chat for review.
- **Review grades**: Excellent, Good, Okay, Questionable, Mistake or Big mistake, color-coded in the review and the hand list.
- **Saved progress** (`storage.js`): your table, every session's results, a results chart and your last 100 hands survive closing the page. On the hosted site they're saved in that browser (each device keeps its own). Opened as a Claude artifact, they're saved privately to your Claude account (last 40 hands) and follow you across devices.
- **Claude feedback**: opened as a Claude artifact, the page can send a hand (or your last 10) to Claude and show a review in the page. Anywhere else, use "Copy hand history" and paste it into a chat.

Hands are evaluated in `holdem.js` (best five of seven, side pots, split pots). `engine.js` holds the shared pre-flop ranges and `bots.js` the bots' hand reading and decisions.

## Dealer Hold'em (`dealer.html`)

A trainer for the play-the-dealer hold'em table game you'll find in casinos, using its standard rules and pay tables. You play against the dealer, not other players:

- Post equal **Ante** and **Blind** bets (plus an optional **Trips** side bet), and get two cards.
- **Before the flop**: check, or bet 3× or 4× your Ante. **On the flop**: check or bet 2×. **On the river**: bet 1× or fold.
- The dealer needs a pair or better to qualify. If not, your Ante pushes. The Play bet wins even money; the Blind pays only when you win with a straight or better (up to 500 to 1 for a royal); Trips pays on your own hand (three of a kind or better).

Every decision is graded: before and on the flop against the standard basic strategy, and on the river against exact math (the page deals the dealer every possible two cards and compares the average result of betting with folding). Coach mode highlights the strategy play before you choose; turn it off to test yourself. Your stack sits on the table under your cards: it drops as you bet, shows what's in play, then the last hand's result; bets you can't cover are disabled, and you can rebuy $1,000 when you run out. The page keeps your accuracy by street, and your last 25 hands in this browser. Played perfectly, the game costs about 2% of your Ante per hand.

## Hosting

Everything is static, so any static host works. On GitHub Pages: **Settings → Pages → Deploy from a branch → `main` / `(root)`**. The site then lives at `https://<user>.github.io/pokerapp/`, with the Action Generator at the root and `simulator.html` and `holdem.html` beside it. `.nojekyll` tells Pages to serve the files as-is.

On a hosted copy the Practice Table can't ask Claude for feedback in the page, since that only works inside Claude. It shows "Copy hand history" instead, for pasting into a chat.

## Updating the hosted site

GitHub Pages lets browsers reuse cached files for up to 10 minutes, so each page links its scripts and stylesheets with a version tag (`holdem.js?v=26`). When you change any `.js` or `.css` file, bump the `?v=` number in `index.html`, `simulator.html` and `holdem.html`, and the version label in the Practice Table header, so visitors get the new code on their next load.

## Files

```
index.html / app.js / style.css          Action Generator
dealer.html / dealer.js / dealer.css      Dealer Hold'em
charts.html / charts.js / charts.css      Range Charts
simulator.html / simulator.js / simulator.css   Simulator
holdem.html / holdem.js / holdem.css      Practice Table
bots.js                                   Practice Table bot styles, hand reading and post-flop decisions
storage.js                                Practice Table saved progress (browser or Claude account)
engine.js                                 Pre-flop ranges shared by Simulator and Practice Table
casino.png                                Favicon
poker-5.jpg                               Background for the Action Generator
```
