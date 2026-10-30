// pluralise.test.js — unit test for the pluralise helper
// Run: node tests/pluralise.test.js

'use strict';

function pluralise(n, singular, plural) {
  return n + ' ' + (n === 1 ? singular : (plural || singular + 's'));
}

var passed = 0;
var failed = 0;

function assert(label, actual, expected) {
  if (actual === expected) {
    passed++;
    console.log('  PASS  ' + label);
  } else {
    failed++;
    console.error('  FAIL  ' + label + ' — expected "' + expected + '", got "' + actual + '"');
  }
}

console.log('pluralise helper\n');

// Singular
assert('1 player', pluralise(1, 'player'), '1 player');
assert('1 group',  pluralise(1, 'group'),  '1 group');
assert('1 hole',   pluralise(1, 'hole'),   '1 hole');
assert('1 prize',  pluralise(1, 'prize'),  '1 prize');

// Plural (auto -s)
assert('0 players', pluralise(0, 'player'), '0 players');
assert('2 groups',  pluralise(2, 'group'),  '2 groups');
assert('18 holes',  pluralise(18, 'hole'),  '18 holes');
assert('3 prizes',  pluralise(3, 'prize'),  '3 prizes');

// Larger numbers
assert('36 players', pluralise(36, 'player'), '36 players');
assert('12 groups',  pluralise(12, 'group'),  '12 groups');

// Custom plural form
assert('1 handicap',   pluralise(1, 'handicap'),               '1 handicap');
assert('5 handicaps',  pluralise(5, 'handicap'),               '5 handicaps');
assert('1 person',     pluralise(1, 'person', 'people'),       '1 person');
assert('3 people',     pluralise(3, 'person', 'people'),       '3 people');

console.log('\n' + passed + ' passed, ' + failed + ' failed, ' + (passed + failed) + ' total');
process.exit(failed > 0 ? 1 : 0);
