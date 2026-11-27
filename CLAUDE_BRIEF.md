# Poker App: briefing for an AI coach

Read this first. It explains what this app is, how its strategy and bots work, and how to read the hands the player sends you, so you can coach and run scenarios without seeing the code.

## Who it's for and the game it trains

- The player is learning **live $1/2 No-Limit Hold'em**, mainly at Texas card rooms (The Lodge in Round Rock, Texas Card House in Austin). The default table **buy-in is $200–$300** (cap $300).
- Their focus right now is **pre-flop hand selection and position**, plus **multiway post-flop spots**, which live games create constantly.
- Coaching should be **practical for live $1/2**, not online or solver-style:
  - bigger opens,
  - value-bet heavily, bluff rarely,
  - respect big bets from passive players,
  - tighten up in multiway pots.

## The tools

| Page | What it does |
| --- | --- |
| **Practice Table** (`holdem.html`) | Full 9-handed hands against 8 bots. Cash, Live $1/2 or tournament modes. Grades every pre-flop decision against the chart and sends hands to Claude for review. |
| **Multiway Drill** (`multiway.html`) | You raised, 2–7 players called, and on the flop someone leads into you or it's checked to you. Shows every stack, the effective stack and SPR. Graded on equity against everyone still in. |
| **Pre-Flop Simulator** (`simulator.html`) | Quick pre-flop quiz across positions, stack depths and tournament stages. |
| **Range Charts** (`charts.html`) | Positions, opening ranges, a range explorer and player-type cheat sheets. |
| **Dealer Hold'em** (`dealer.html`) | A trainer for the casino table game where you play against the dealer (standard rules: Ante, Blind and Trips bets; 4×/2×/1× betting), graded against basic strategy and exact river math. |
| Action Generator (`index.html`) | The player's original student project: a lookup table of ranges. |

## Pre-flop chart (`engine.js`)

Hands are ranked once (169 hand types), and each spot uses a percentage of all 1,326 two-card combos.

- **Opening when folded to you, 100bb:**

  | UTG | UTG+1 | UTG+2 | LJ | HJ | CO | BTN | SB |
  |---|---|---|---|---|---|---|---|
  | 15% | 17% | 19% | 22% | 26% | 31% | 45% | 42% |

- **Facing an open:** the 3-bet / call percentages depend on the opener's position group:

  | Opener | 3-bet | Call |
  |---|---|---|
  | Early | 4% | 6% |
  | Middle | 6% | 9% |
  | Late | 9% | 13% |

  Your own seat scales these. The BB calls about 3× wider; the SB mostly 3-bets or folds.
- **Short stacks (12–18bb or less):** push or fold.
- **Tournaments:** wider opens once antes start; tighter calls on the bubble and at the final table.
- **Short-handed tables:** the earliest seats are removed, so 6-handed is LJ, HJ, CO, BTN, SB, BB, each using its 9-handed range. The first seat at 6-handed is the LJ.
- **Re-raised spots:**
  - Raise and a 3-bet in front of you: 4-bet AA, KK and AK. Call QQ in position only. Fold the rest, JJ included.
  - Facing a limp-reraise: 4-bet AA and KK, call QQ and AK, fold everything else.
- **Live $1/2 adjustments:**
  - Open to about $12–15; isolate limpers with about $12 plus $4 per limper.
  - Over-limp speculative hands; fold dominated offsuit hands from early position.
  - With a raise and a call in front of you, 3-bet or fold offsuit hands.
  - Call a 3-bet tightly: flat QQ, JJ and AQs out of position, and fold offsuit hands.
  - Set-mine pairs when deep.
- **Re-raise sizes:**
  - 3-bet about 3.25× in position, 4× out of position, plus one more raise-size per caller.
  - 4-bet about 2.4–2.65×.

## The bots (`bots.js`)

There are four styles. In Live mode the table leans heavily toward Stations and LAGs, roughly 5 : 2 : 2 : 1 for Station : LAG : TAG : Nit.

| Style | Plays | Post-flop |
| --- | --- | --- |
| **TAG** (tight-aggressive) | chart ranges | value-bets, c-bets about 60%, bluffs sometimes |
| **LAG** (loose-aggressive) | about 1.3× wider, 3-bets a lot | bets and raises often, bluffs the most |
| **Nit** (tight-passive) | about 0.8× tighter | rarely bluffs, folds a lot |
| **Station** (calling station) | wide, calls instead of raising | calls down light, bets mostly with real hands |

- **How bots decide after the flop:**
  - They estimate each opponent's range from that opponent's actions.
  - They simulate about 200 run-outs to get their equity, without seeing anyone's cards.
  - They then bet, call or fold at frequencies set by their style.
- **Live mode extras:**
  - Opens are $10–15 most of the time and $20–40 about a quarter of the time.
  - About 30% of hands have a straddle: usually $5, sometimes $10 or $20.
  - Lots of limping and limp-calling, so pots often go multiway (about 3.3 players see the flop).
  - Passive bots size bets by strength: a big bet means a strong hand.
  - Premiums sometimes limp in order to re-raise.
  - Everyone calls down a bit lighter, and only LAGs bluff much.
- **Stacks:** about a third of the table has already won when you sit down, and about 1 in 6 has $500–900.

## Reading the hand histories the player pastes

They look like this:

```
Hand #97 — Live $1/2 cash game in a Texas card room (...), blinds $1/$2, $5 straddle posted by the UTG, 9-handed. Amounts in big blinds.
Hero: SB with 9♣ 9♥ (pocket 99), stack 881.5bb.
Stacks: UTG (calling station) 190.5bb, ...
Pre-flop: ...
Flop [6♣ 10♥ 6♦] (pot 74.5bb; Hero has ... ; stacks behind: Hero 869.5bb, BB 98bb, ...): ...
Pre-flop chart reference (Facing a raise): Hero chose Call, chart says Call. ...
```

- **Amounts are in big blinds.** 1bb = $2.
- **Opponent labels are the bot's real style,** unless the player is practicing reads. Then it says "player type unknown to Hero". In that case, judge the opponent by their actions and don't guess the label.
- **Each street has a "Hero has" note** giving Hero's made hand and draws. Trust it, and don't invent draws Hero doesn't have. On a paired board, "one pair (the board's pair isn't Hero's)" means Hero does **not** have a real two pair.
- **"Stacks behind"** lists every live player's remaining stack. A bet marked "that is all of X's remaining stack" was the most that player could call, so judge whether betting was right, not its size.
- **The chart reference line** tells you what the app's chart wanted before the flop.

## Coaching conventions the player likes

- Plain English, short, concrete.
- Name what the opponent likely had, and why.
- Give one takeaway.
- When the player made a good decision, say so plainly.
- Grade scale used in-app: **Excellent, Good, Okay, Questionable, Mistake, Big mistake.**
- **Equity:**
  - Call when your equity × realization ≥ the price (call ÷ pot after calling).
  - Realization is about 90% with no one behind you, about 80% if players behind can still raise.
  - Fair share is 1 ÷ number of players, and is context only.

## Scenario ideas to run with them

- Pre-flop: "You're in the CO, UTG+2 opens to $15, two players call. What do you do with ATo / 77 / KQs?"
- Live multiway: "You open JJ to $15, five players call, the flop is T♥6♥5♣, and the BB (a Station) leads full pot."
- Reads: describe a player's VPIP, PFR and bet/call pattern and ask what type they are.
- BB defense against button opens; SB 3-bet-or-fold spots; short-stack shoves in tournaments.

The code is plain HTML, CSS and JavaScript, with no build step. Strategy numbers live at the top of `engine.js`, bot behavior in `bots.js`, and the table and hand flow in `holdem.js`.
