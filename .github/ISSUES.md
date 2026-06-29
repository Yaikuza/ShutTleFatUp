# ShutTleFatUp — Issue Tracker

> Comprehensive list of known issues, refactors, and future features.
> Format inspired by GitHub Issues. Each item has a clear `Expected` behavior so AI/humans can pick up the work without context.

**Project:** Single-file HTML badminton pair matching app
**File:** `index.html` (1016 lines, no dependencies)
**Repo:** https://github.com/Yaikuza/ShutTleFatUp

---

## Legend

- 🔴 **P0 — Critical bug** (data corruption, broken core flow)
- 🟠 **P1 — Important** (UX confusion, off-by-one, wrong behavior)
- 🟡 **P2 — Nice to have** (cleanup, edge case, polish)
- 🟢 **P3 — Future feature**

---

## Current State (v2 — committed 16e0a9c)

### Data model
```js
data = {
  mainPlayers[], pool{}, queue[],                    // player registry
  courts[{id, status, teamA[2], teamB[2], games, consecutive{}, startedRound}],
  history[{time, court, round, teamA, teamB, winner}],
  pairCount{}, oppCount{}, gameCount{},               // cumulative stats
  roundPairs{},                                       // games per pair this round
  roundSchedule[],                                    // snapshot of pair plan
  currentRound,
  settings{ gamesPerMatch }
}
```

### Core flow
1. **Shuffle** → snapshot `roundSchedule` (disjoint pairs from current queue)
2. **Fill court** → prefer `findScheduledMatch()`, block if `!scheduleHasPlayableMatch()`
3. **Declare winner** → recordStats + record roundPairs + winner-stays (uses `findScheduledOpponents`)
4. **Reset session** → keeps names + cumulative stats, clears queue/courts/history

### Helpers
- `key(a,b)` — pair key (sorted)
- `canPair(p1, p2)` — `roundPairs[key] < gamesPerMatch`
- `findScheduledMatch()` — 2 disjoint pairs from schedule with all 4 in queue
- `findScheduledOpponents(winTeam)` — pair from schedule for winner-stays
- `scheduleHasPlayableMatch()` — any 2-pair match still playable
- `promptNewRoundIfExhausted()` — show confirm dialog if schedule exhausted
- `ejectFromCourts(name)` — pull player out of playing courts

---

## 🔴 P0 — Critical bugs

### #1 roundSchedule goes stale when player is removed

**Status:** Open
**Where:** `removePlayer()` (line ~648), `togglePool()` (line ~660)
**Symptom:** Delete a player (or toggle pool off) → `roundSchedule` still contains `{p1: deletedName, p2: ...}`. Pair table shows ghost rows; `findScheduledMatch` checks `qSet.has(p1)` so they get filtered out — but the schedule data is dead weight.

**Expected:**
- When a player is removed from the system, also drop any schedule entry involving them
- `removePlayer`: filter `data.roundSchedule` to remove pairs containing the name
- `togglePool` (off): same — if player isn't in queue, remove from schedule

**Acceptance test:**
- 8 players, schedule = `[A+B, C+D, E+F, G+H]`
- Remove player `C` → schedule becomes `[A+B, E+F, G+H]`
- Pair table shows 3 rows, not 4

---

### #2 startNewRound doesn't include court players in new schedule

**Status:** Open
**Where:** `startNewRound()` (line ~396)
**Symptom:** A court is mid-game with players X, Y, Z, W. User clicks "เริ่มรอบใหม่". The new round's `roundSchedule` is built from `data.queue` only — players on the court are **excluded** from the new round's plan.

**Expected:**
- Collect all players active in this round (queue + courts) → shuffle all of them → build new schedule
- Or: explicitly prompt the user — "มี X คนกำลังเล่นอยู่ — รวมเข้าด้วยกัน หรือเริ่มรอบใหม่เฉพาะคิว?"

**Acceptance test:**
- queue = `[A, B, C, D]`, court1 = `[E, F, G, H]` mid-game
- Click "เริ่มรอบใหม่"
- New schedule has 4 pairs (8 players total)

---

## 🟠 P1 — Important

### #3 Shuffle doesn't include court players

**Status:** Open (awaiting user decision)
**Where:** `shuffleQueue()` (line ~388)
**Symptom:** User clicks 🔀 shuffle. Only players in `data.queue` are reshuffled. Players on courts stay frozen on their current match — even though "shuffle" semantically should affect everyone in the round.

**Options to discuss:**
- **(a) Re-shuffle all players** — pull court players back into queue, build new schedule, then refill all courts
- **(b) Re-shuffle only queue** — current behavior; shuffle is a "queue reshuffle" not a "round reshuffle"
- **(c) Auto-shuffle when round completes** — schedule resets automatically when all current pairs exhausted; manual shuffle is force-override

**Expected (deferred — pending discussion):**
- User to decide between (a), (b), or (c)
- Once decided, update `shuffleQueue()` and possibly rename the button (🔀 → 🔄 or similar)

---

### #4 Winner-stays may not match schedule if pair is full

**Status:** Mostly fixed, edge case open
**Where:** `declareWinner()` winner-stays block
**Symptom:** A wins, A+B at limit. `findScheduledOpponents(['A','B'])` correctly returns `null`. Then the code falls through to `promptNewRoundIfExhausted()` — but if `scheduleHasPlayableMatch()` is still true (because some other pair can play), it picks the **first 2 from queue** instead of asking the user.

**Expected:**
- When `findScheduledOpponents` returns null, check if the **specific reason** is "winners' opponents are all exhausted" vs "schedule has other playable matches"
- If `scheduleHasPlayableMatch()` → fallback to queue[0..1] is fine (this is the "free play" case)
- If `!scheduleHasPlayableMatch()` → prompt for new round

**Current behavior is mostly correct** — the `promptNewRoundIfExhausted()` is called when schedule is fully exhausted. But the toast doesn't distinguish "winners stay, fallback" vs "scheduled opponent".

**Acceptance test:**
- A+B vs C+D, A+B wins. Schedule has E+F vs G+H (still playable).
- `findScheduledOpponents([A,B])` returns `[E,F]` ✓
- Next: A+B vs E+F, A+B wins. Schedule: C+D at limit, E+F at limit. Only G+H remains.
- `findScheduledOpponents([A,B])` returns null. `scheduleHasPlayableMatch()` returns false (G+H alone can't form 2-pair match).
- → Prompt new round ✓

**Open question:** Should we add toast "นอก schedule" when fallback is used? (User previously asked about this.)

---

### #5 Player sits out with no visual indicator

**Status:** Open
**Where:** `getMatchSchedule()` / `renderPairScoreTable()`
**Symptom:** When queue has odd count (e.g. 7 players), `buildScheduleFromQueue()` drops the last player. The pair table shows 3 pairs, and the "1 คนพัก" badge appears in the header. But the schedule's `data.roundSchedule` still has 3 entries — no record of who sat out.

**Expected:**
- Either: include sit-out player in `roundSchedule` as `{p1: 'X', p2: null}` and show in table as "X (พัก)" row
- Or: add separate `data.roundSitOut[]` field to track who sat out this round (for stats / fairness rotation)

**Acceptance test:**
- 7 players, shuffle → schedule has 3 pairs + 1 sit-out row
- After round ends and shuffle again → sit-out is now a different player (rotation)

---

## 🟡 P2 — Polish / edge cases

### #6 Find pool players feature hidden

**Status:** Open
**Where:** Was `addPoolToQueue()` (still exists, line ~680) but no UI button
**Symptom:** Function exists to add all `pool[p]=true` players back to queue with shuffle, but the only way to call it is from code. Users currently toggle each player individually.

**Expected:**
- Add a button in the Players section: "➕ เพิ่มทั้งหมดเข้าคิว" — visible only if some players are toggled off
- Or: rename for clarity

---

### #7 `renderCourts` shows "⏳ รอคู่" for courts with 1 team only

**Status:** Open
**Where:** `renderCourtBody()` (line ~917 area)
**Symptom:** In `declareWinner`, when queue doesn't have 2+ new opponents, court is set to `{teamA: winTeam, teamB: [], status: 'waiting'}`. The render shows "⏳ รอคู่: A+B" message. But this is ambiguous — is it waiting for opponents, or the original 4 still on court?

**Expected:**
- Distinguish "winner waiting for new opponents" (should show toast) vs "court empty"
- Visual hint: "⏳ รอฝ่ายตรงข้าม: A+B" (clearer that 1 team is still on court)

---

### #8 `data.roundSchedule` not resynced when player is added mid-round

**Status:** Open
**Where:** `addMainPlayer()`, `togglePool()` (on)
**Symptom:** Round 1 in progress. New player X joins (toggle on). X is added to `data.queue` but NOT to `data.roundSchedule`. X has no pair in the pair table.

**Expected:** Auto-append X to `roundSchedule` as new pair (X with a placeholder) OR display "X (ยังไม่จัดคู่)" in the table.

**Trade-off:**
- Auto-append changes the schedule (might surprise user)
- Better: show X in queue chips with visual hint, but don't add to schedule until next shuffle

**Recommendation:** Add X to schedule as `{p1: X, p2: null}` (sit-out style). Show in table as "X — ยังไม่จัดคู่ (shuffle เพื่อจัด)".

---

### #9 Settings don't show current stats count

**Status:** Open
**Where:** `renderSettings()` (line ~840 area)
**Symptom:** Settings shows "ผู้เล่น: X คน | เกม: Y เกม" but doesn't show schedule info, round number, etc.

**Expected:**
- Add to info section: "รอบ: N | Schedule: M คู่"

---

### #10 `data.nextCourtId` becomes stale after reset

**Status:** Open (minor)
**Where:** `migrate()` (line ~282), `addCourt()`, `removeCourt()`
**Symptom:** If `removeCourt` removes court with id=3, `renumberCourts` sets `nextCourtId = length + 1`. But if user then resets, fresh data has courts 1,2 and `nextCourtId=3` ✓. But if `addCourt` is called when current length = 1 and we add with `nextCourtId++`, then `renumberCourts` overwrites it. **Currently correct, but fragile.**

**Expected:** Document the invariant or simplify — always use `data.courts.length + 1` for next ID.

---

### #11 Toast message inconsistency

**Status:** Open
**Where:** Multiple sites
**Symptom:** Mix of `'อยู่ vs'` and `' vs '` (the old "อยู่" was redundant). Already fixed in most places, but check for stragglers.

**Search:** `grep -n "อยู่ vs" index.html`

---

## 🟢 P3 — Future features

### #12 Undo last action

**Symptom:** No way to undo a wrong "ชนะ" tap.
**Expected:** Stack of last N actions, "↶ ย้อน" button reverses the most recent.

---

### #13 Export per-round stats

**Symptom:** History exports as JSON but no round-by-round summary.
**Expected:** "Export CSV" — pairs, scores, dates per round.

---

### #14 Mobile-friendly team box tap area

**Symptom:** `.team-box` is 38% wide, fine on phone, but the "👆 ชนะ" hint is tiny.
**Expected:** Larger tap target, or replace with explicit "ทีม A ชนะ" / "ทีม B ชนะ" buttons below the boxes.

---

### #15 Dark mode

**Symptom:** Light theme only. CSS variables are already defined — easy to add `:root.dark` overrides.

---

### #16 Sound feedback on win

**Symptom:** No audio cue when "ชนะ" is recorded.
**Expected:** Optional short beep via Web Audio API (no asset needed).

---

### #17 Schedule preview in Players section

**Symptom:** Schedule is only visible in queue section. Players section shows nothing about pairings.
**Expected:** Show mini-schedule when Players section is opened.

---

### #18 "ขอ rest" button for individual player

**Symptom:** Currently only `togglePool` removes from queue. But a player mid-pool might want to take a break without losing their place.
**Expected:** New "⏸️ พัก" toggle per player — keeps `pool=true` but marks as `resting=true`, removed from queue until toggled back.

---

### #19 Auto-fill all courts on shuffle if queue is large enough

**Symptom:** After shuffle, courts don't auto-fill even if queue has 4+ per court.
**Expected:** Add option in settings: "Auto-fill courts on shuffle" — boolean.

---

### #20 Fair sit-out rotation for odd counts

**Symptom:** Sit-out is always the last player in queue. After a round, same player may keep sitting out.
**Expected:** Track "games played this round" per player; sit-out goes to the player with the most games. Or rotate based on previous round's sit-out.

---

## 🟡 P2 — Code quality

### #21 Inline `style="..."` in JS templates

**Status:** Open
**Where:** `renderQueueStatus()`, `renderPairScoreTable()`, others
**Symptom:** Mixed CSS classes and inline styles. E.g. `style="margin-bottom:6px"` in `renderQueueChips`.

**Expected:** Extract all inline styles to CSS classes. Then JS templates become pure markup.

---

### #22 `escHtml` called inconsistently

**Status:** Open
**Where:** Search for `'` in template literals with player names
**Symptom:** All names should be `escHtml()`'d. Some inline `onclick="removeFromQueue('${jsStr(p)}')"` use `jsStr` for single-quote escaping. This is correct but a single utility for both contexts would be cleaner.

**Expected:** Audit and ensure all user-input names are escaped in HTML attributes and inline handlers.

---

### #23 `getRoundPairScores` is only used in one place

**Status:** Open
**Where:** `getMatchSchedule()` (line ~772)
**Symptom:** `getRoundPairScores` is called by `getMatchSchedule` to compute played scores. Could be inlined or merged.

**Expected:** Inline the 15-line function into `getMatchSchedule` for clarity, or keep separate for testability.

---

### #24 Magic numbers in code

**Status:** Open
**Where:** `2200` (toast timeout), `200` (confirm dialog delay), `2` (default gamesPerMatch fallback)
**Symptom:** Some magic numbers could be named constants.

**Expected:** Extract `TOAST_TIMEOUT_MS`, `CONFIRM_DELAY_MS` constants.

---

### #25 `data.consecutive` reset on swapBoth clears bad data

**Status:** Open
**Where:** `swapBoth()` (line ~626)
**Symptom:** When swapping both teams, `consecutive` is reset, which makes sense. But also `startedRound` is set to current — if user swaps, the new game's `roundPairs` tracking is based on current round, even though the players might be from an old round.

**Expected:** If new game happens in current round, `roundPairs` increments correctly. If somehow in past round, cross-round check handles it. **Probably fine, but verify.**

---

## Testing strategy

Manual test scenarios (each is one round of a real game):

| # | Setup | Action | Expected |
|---|-------|--------|----------|
| T1 | 6 players, all in pool | Shuffle → 3 pairs in table | Pair table shows A+B, C+D, E+F |
| T2 | T1 + click จัดผู้เล่น court 1 | Court shows A+B vs C+D, queue = [E,F] | Pair table still shows 3 pairs |
| T3 | T2 + tap A wins | Court shows A+B vs E+F, queue = [C,D] | Schedule unchanged |
| T4 | T3 + play 2 more games (A+B wins all) | winnerRest triggers | Prompt "เริ่มรอบใหม่" |
| T5 | T4 + confirm | Shuffle again, round 2 | New schedule with same 6 players |
| T6 | 7 players, shuffle | 3 pairs + 1 sit-out | Header shows "1 คนพัก" |
| T7 | 8 players, mid-game on court 1 | Remove player `C` | Schedule drops C+D pair |
| T8 | 4 players, queue exhausted all pairs | Click fill | Prompt "เริ่มรอบใหม่" |

---

## Out of scope (deferred)

- Multi-day tournaments / bracket
- Player skill ratings / ELO
- Cloud sync / multi-device
- Authentication
- i18n (English UI)

---

## Notes for AI continuation

1. **Read `index.html` first** — it's 1016 lines, self-contained, no imports
2. **Data model is in `getDef()`** (~line 262) — extend there if needed
3. **All persistence is localStorage** key `bdm_rotation` — migration in `migrate()`
4. **Tests are manual** — no test framework; verify with the scenarios above
5. **User communicates in Thai** — UI strings in Thai, commit messages in English
6. **User uses screenshots heavily** — visual diffs are the primary feedback
7. **Style preferences observed:**
   - Incremental small changes (1 thing per turn)
   - User points at wrong part with screenshot
   - User explicitly says "เอาออก" or "ควรเป็น X" — direct, no ambiguity
   - Push to GitHub after each verified change

---

**Last updated:** 2026-06-29 (after 16e0a9c)
**Next session:** Pick up #1 (roundSchedule stale) or #2 (startNewRound missing court players)
