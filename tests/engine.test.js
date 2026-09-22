// engine.test.js — plain node test for the scoring engine
// Run: node tests/engine.test.js

var engine = require('../public/shared/engine');

var passed = 0;
var failed = 0;

function assert(label, actual, expected) {
  if (actual === expected) {
    passed++;
  } else {
    failed++;
    console.error('FAIL: ' + label);
    console.error('  expected: ' + expected);
    console.error('  actual:   ' + actual);
  }
}

// ── playingHandicap ─────────────────────────────────────────────

// Brief verification:
//   24 index lady at 85% on slope 128, rating 71.2, par 72
//   raw = 24 × (128/113) + (71.2 − 72) = 27.1858... − 0.8 = 26.3858...
//   × 0.85 = 22.4279...
//   round(22.4279) = 22
assert('PH: 24 idx, slope 128, rating 71.2, par 72, 85%',
  engine.playingHandicap(24, 128, 71.2, 72, 0.85), 22);

// Zero index
assert('PH: zero index', engine.playingHandicap(0, 130, 72, 72, 0.95), 0);

// Null index
assert('PH: null index', engine.playingHandicap(null, 130, 72, 72, 0.95), 0);

// Standard slope (113), 95%
// raw = 18 × (113/113) + (72 − 72) = 18, × 0.95 = 17.1, round = 17
assert('PH: 18 idx, slope 113, rating 72, par 72, 95%',
  engine.playingHandicap(18, 113, 72, 72, 0.95), 17);

// High index capped at 54
assert('PH: cap at 54',
  engine.playingHandicap(60, 140, 75, 72, 1.0) <= 54, true);

// 100% allowance
// raw = 12 × (125/113) + (70.5 − 72) = 13.274... − 1.5 = 11.774...
// × 1.0 = 11.774, round = 12
assert('PH: 12 idx, slope 125, rating 70.5, par 72, 100%',
  engine.playingHandicap(12, 125, 70.5, 72, 1.0), 12);

// ── shotsOnHole ─────────────────────────────────────────────────

// PH 22: base = 1, remainder = 4
// SI 1: 1 ≤ 4 → 2 shots
assert('Shots: PH 22, SI 1', engine.shotsOnHole(22, 1), 2);
// SI 4: 4 ≤ 4 → 2 shots
assert('Shots: PH 22, SI 4', engine.shotsOnHole(22, 4), 2);
// SI 5: 5 ≤ 4 → no → 1 shot
assert('Shots: PH 22, SI 5', engine.shotsOnHole(22, 5), 1);
// SI 18: 18 ≤ 4 → no → 1 shot
assert('Shots: PH 22, SI 18', engine.shotsOnHole(22, 18), 1);

// PH 0: no shots
assert('Shots: PH 0', engine.shotsOnHole(0, 1), 0);

// PH 36: base = 2, remainder = 0 → all get exactly 2
assert('Shots: PH 36, SI 1', engine.shotsOnHole(36, 1), 2);
assert('Shots: PH 36, SI 18', engine.shotsOnHole(36, 18), 2);

// PH 19: base = 1, remainder = 1 → only SI 1 gets 2
assert('Shots: PH 19, SI 1', engine.shotsOnHole(19, 1), 2);
assert('Shots: PH 19, SI 2', engine.shotsOnHole(19, 2), 1);

// ── stablefordPoints ────────────────────────────────────────────

// Par 4, gross 5, 1 shot: nett = 4, diff = 0 → 2 pts (par)
assert('Stab: par 4, gross 5, 1 shot', engine.stablefordPoints(4, 5, 1), 2);

// Par 4, gross 4, 0 shots: nett = 4, → 2 pts (par)
assert('Stab: par 4, gross 4, 0 shots', engine.stablefordPoints(4, 4, 0), 2);

// Par 3, gross 3, 0 shots: → 2 pts
assert('Stab: par 3, gross 3, 0 shots', engine.stablefordPoints(3, 3, 0), 2);

// Birdie: par 4, gross 3, 0 shots: nett = 3, → 3 pts
assert('Stab: birdie', engine.stablefordPoints(4, 3, 0), 3);

// Eagle: par 5, gross 3, 0 shots: nett = 3, → 4 pts
assert('Stab: eagle', engine.stablefordPoints(5, 3, 0), 4);

// Double bogey: par 4, gross 6, 0 shots: nett = 6, → 0 pts
assert('Stab: double bogey', engine.stablefordPoints(4, 6, 0), 0);

// Bogey with shot: par 4, gross 6, 1 shot: nett = 5, → 1 pt
assert('Stab: bogey with shot', engine.stablefordPoints(4, 6, 1), 1);

// Null gross
assert('Stab: null gross', engine.stablefordPoints(4, null, 1), 0);

// ── holePoints (with picked_up) ─────────────────────────────────

assert('holePoints: picked up = 0', engine.holePoints(5, true, 4, 1, 18), 0);
assert('holePoints: normal score', engine.holePoints(5, false, 4, 1, 18), 2);

// ── buildStandings: individual ──────────────────────────────────

var testHoles = [
  { hole_number: 1, par: 4, stroke_index: 1 },
  { hole_number: 2, par: 3, stroke_index: 2 }
];

var testPlayers = [
  { id: 'p1', display_name: 'Alice', playing_handicap: 18, group_id: 'g1' },
  { id: 'p2', display_name: 'Bob', playing_handicap: 10, group_id: 'g1' }
];

var testGroups = [{ id: 'g1', group_number: 1 }];

var testScores = {
  // Alice: PH 18 → base 1, rem 0 → 1 shot on every hole
  // H1 (P4,SI1): gross 5, 1 shot, nett 4 → 2pts. H2 (P3,SI2): gross 4, 1 shot, nett 3 → 2pts. Total 4.
  p1: { 1: 5, 2: 4 },
  // Bob: PH 10 → base 0, rem 10 → 1 shot on SI 1-10
  // H1 (P4,SI1): gross 4, 1 shot, nett 3 → 3pts. H2 (P3,SI2): gross 3, 1 shot, nett 2 → 3pts. Total 6.
  p2: { 1: 4, 2: 3 }
};

var indResult = engine.buildStandings({
  scores: testScores,
  pickedUp: {},
  holes: testHoles,
  players: testPlayers,
  groups: testGroups,
  format: 'individual_stableford',
  maxHole: 18
});

assert('Individual: Bob first (6 pts)', indResult[0].names, 'Bob');
assert('Individual: Bob points', indResult[0].points, 6);
assert('Individual: Alice second (4 pts)', indResult[1].names, 'Alice');
assert('Individual: Alice points', indResult[1].points, 4);

// ── buildStandings: better_ball_pairs ───────────────────────────

var pairPlayers = [
  { id: 'p1', display_name: 'Alice', playing_handicap: 18, group_id: 'g1', pair_key: 'A' },
  { id: 'p2', display_name: 'Bob', playing_handicap: 10, group_id: 'g1', pair_key: 'A' }
];

var pairResult = engine.buildStandings({
  scores: testScores,
  pickedUp: {},
  holes: testHoles,
  players: pairPlayers,
  groups: testGroups,
  format: 'better_ball_pairs',
  maxHole: 18
});

// Hole 1: Alice 2pts, Bob 3pts → best = 3
// Hole 2: Alice 2pts, Bob 3pts → best = 3
// Total: 6
assert('BB Pairs: name', pairResult[0].names, 'Alice & Bob');
assert('BB Pairs: points', pairResult[0].points, 6);

// ── buildStandings: better_ball_2from4 ──────────────────────────

var fourPlayers = [
  { id: 'p1', display_name: 'Alice', playing_handicap: 18, group_id: 'g1' },
  { id: 'p2', display_name: 'Bob', playing_handicap: 10, group_id: 'g1' },
  { id: 'p3', display_name: 'Carol', playing_handicap: 20, group_id: 'g1' },
  { id: 'p4', display_name: 'Dave', playing_handicap: 5, group_id: 'g1' }
];

var fourScores = {
  p1: { 1: 5, 2: 4 },  // H1: 2pts, H2: 2pts
  p2: { 1: 4, 2: 3 },  // H1: 3pts, H2: 2pts
  p3: { 1: 6, 2: 5 },  // H1: 2pts (PH20, SI1 → 2 shots, nett 4 → 2pts), H2: 2pts (SI2 → 2 shots, nett 3 → 2pts)
  p4: { 1: 3, 2: 3 }   // H1: 3pts (PH5, SI1 → 1 shot, nett 2 → 4pts), H2: 2pts (SI2 → 0, nett 3 → 2pts)
};

var fourResult = engine.buildStandings({
  scores: fourScores,
  pickedUp: {},
  holes: testHoles,
  players: fourPlayers,
  groups: testGroups,
  format: 'better_ball_2from4',
  maxHole: 18
});

// Hole 1: Alice 2, Bob 3, Carol 2, Dave 4 → best 2 = 4+3 = 7
// Hole 2: Alice 2, Bob 3, Carol 2, Dave 3 → best 2 = 3+3 = 6
// Total: 13
assert('2from4: points', fourResult[0].points, 13);

// ── Countback ───────────────────────────────────────────────────

// Two players tied on points, different back 9
var cbHoles = [];
for (var i = 1; i <= 18; i++) {
  cbHoles.push({ hole_number: i, par: 4, stroke_index: i });
}

var cbPlayers = [
  { id: 'a', display_name: 'Amy', playing_handicap: 0, group_id: 'g1' },
  { id: 'b', display_name: 'Beth', playing_handicap: 0, group_id: 'g1' }
];

var cbScores = { a: {}, b: {} };
// Both score 36 points (2 per hole), but Amy gets 3 on hole 18
for (var i = 1; i <= 18; i++) {
  cbScores.a[i] = 4; // par = 2pts
  cbScores.b[i] = 4;
}
cbScores.a[18] = 3; // birdie = 3pts
cbScores.a[1] = 5;  // bogey = 1pt (keep total same)

var cbResult = engine.buildStandings({
  scores: cbScores,
  pickedUp: {},
  holes: cbHoles,
  players: cbPlayers,
  groups: [{ id: 'g1', group_number: 1 }],
  format: 'individual_stableford',
  maxHole: 18
});

// Both 36 total. Amy: back 9 = 1×8 + 3 = 19. Beth: back 9 = 18.
// Amy should be first.
assert('Countback: Amy first', cbResult[0].names, 'Amy');
assert('Countback: both have countback string', cbResult[0].countback !== null, true);
assert('Countback: Beth second', cbResult[1].names, 'Beth');

// ── Results ─────────────────────────────────────────────────────

console.log('');
console.log(passed + ' passed, ' + failed + ' failed');
if (failed > 0) {
  process.exit(1);
} else {
  console.log('All tests passed.');
}
