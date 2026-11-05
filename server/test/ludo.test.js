const assert = require('assert');
const {
  initializeGameState,
  processDiceRoll,
  processMove,
  getValidMoves,
  TOKEN_STATUS,
  SAFE_CELLS
} = require('../src/game/ludoEngine');

console.log('🧪 Starting Ludo Engine & Multiplayer Autoritative Tests...\n');

let passed = 0;
let failed = 0;

function test(description, fn) {
  try {
    fn();
    console.log(`✅ PASS: ${description}`);
    passed++;
  } catch (err) {
    console.error(`❌ FAIL: ${description}`);
    console.error(err);
    failed++;
  }
}

// 1. Two players game initialization
test('1. Two users join and initialize match', () => {
  const players = [
    { userId: 'u1', username: 'Alice' },
    { userId: 'u2', username: 'Bob' }
  ];
  const state = initializeGameState(players);
  assert.strictEqual(state.phase, 'playing');
  assert.strictEqual(state.players.length, 2);
  assert.strictEqual(state.currentPlayerIndex, 0);
  assert.strictEqual(state.boardState.red.tokens.length, 4);
  assert.strictEqual(state.boardState.blue.tokens.length, 4);
  assert.strictEqual(state.boardState.red.tokens[0].status, TOKEN_STATUS.HOME);
});

// 2. Four players game initialization
test('2. Four users join and initialize match', () => {
  const players = [
    { userId: 'u1', username: 'P1' },
    { userId: 'u2', username: 'P2' },
    { userId: 'u3', username: 'P3' },
    { userId: 'u4', username: 'P4' }
  ];
  const state = initializeGameState(players);
  assert.strictEqual(state.players.length, 4);
  assert.ok(state.boardState.red);
  assert.ok(state.boardState.blue);
  assert.ok(state.boardState.green);
  assert.ok(state.boardState.yellow);
});

// 3. User tries to roll or move during another player's turn
test('3. Prevents action when not player turn', () => {
  const state = initializeGameState([
    { userId: 'u1', username: 'Alice' },
    { userId: 'u2', username: 'Bob' }
  ]);
  // Current player is u1 (red)
  const rollRes = processDiceRoll(state, 'u2');
  assert.strictEqual(rollRes.success, false);
  assert.strictEqual(rollRes.error, 'Not your turn');

  const moveRes = processMove(state, 'u2', 0, 0);
  assert.strictEqual(moveRes.success, false);
  assert.strictEqual(moveRes.error, 'Not your turn');
});

// 4. Token cannot leave base without rolling a 6
test('4. Token cannot leave home base with roll < 6', () => {
  const state = initializeGameState([
    { userId: 'u1', username: 'Alice' },
    { userId: 'u2', username: 'Bob' }
  ]);
  const moves = getValidMoves(state, 'red', 4);
  assert.strictEqual(moves.length, 0);
});

// 5. Token can leave home base when rolling a 6
test('5. Token can leave home base with roll of 6', () => {
  const state = initializeGameState([
    { userId: 'u1', username: 'Alice' },
    { userId: 'u2', username: 'Bob' }
  ]);
  const moves = getValidMoves(state, 'red', 6);
  assert.strictEqual(moves.length, 4); // all 4 tokens in base can enter
  assert.strictEqual(moves[0].type, 'enter_board');
  assert.strictEqual(moves[0].to, 0); // red start cell
});

// 6. Token move execution and position advancement
test('6. Executes token entry on rolling 6', () => {
  const state = initializeGameState([
    { userId: 'u1', username: 'Alice' },
    { userId: 'u2', username: 'Bob' }
  ]);
  state.diceRolled = true;
  state.diceValue = 6;

  const result = processMove(state, 'u1', 0, 0);
  assert.strictEqual(result.success, true);
  const redToken0 = result.gameState.boardState.red.tokens[0];
  assert.strictEqual(redToken0.status, TOKEN_STATUS.ACTIVE);
  assert.strictEqual(redToken0.boardPosition, 0);
});

// 7. Token capture returns opponent to base
test('7. Authoritative capture of opponent token on non-safe tile', () => {
  const state = initializeGameState([
    { userId: 'u1', username: 'Alice' },
    { userId: 'u2', username: 'Bob' }
  ]);

  // Place red token at cell 4
  state.boardState.red.tokens[0].status = TOKEN_STATUS.ACTIVE;
  state.boardState.red.tokens[0].boardPosition = 4;
  state.boardState.red.tokens[0].position = 4;

  // Place blue token at cell 7 (non-safe cell)
  state.boardState.blue.tokens[0].status = TOKEN_STATUS.ACTIVE;
  state.boardState.blue.tokens[0].boardPosition = 7;
  state.boardState.blue.tokens[0].position = 7;

  // Red rolls 3: 4 + 3 = 7 -> lands on blue
  state.diceRolled = true;
  state.diceValue = 3;

  const result = processMove(state, 'u1', 0, 7);
  assert.strictEqual(result.success, true);
  assert.ok(result.captured, 'Capture should be recorded');
  assert.strictEqual(result.captured.color, 'blue');
  assert.strictEqual(result.captured.tokenId, 0);

  // Blue token should now be back in home
  assert.strictEqual(result.gameState.boardState.blue.tokens[0].status, TOKEN_STATUS.HOME);
  assert.strictEqual(result.gameState.boardState.blue.tokens[0].boardPosition, null);
});

// 8. Safe cells prevent capture
test('8. Safe star cells protect tokens from capture', () => {
  const state = initializeGameState([
    { userId: 'u1', username: 'Alice' },
    { userId: 'u2', username: 'Bob' }
  ]);

  // Safe cell 8
  assert.ok(SAFE_CELLS.has(8));

  state.boardState.red.tokens[0].status = TOKEN_STATUS.ACTIVE;
  state.boardState.red.tokens[0].boardPosition = 5;

  state.boardState.blue.tokens[0].status = TOKEN_STATUS.ACTIVE;
  state.boardState.blue.tokens[0].boardPosition = 8;

  state.diceRolled = true;
  state.diceValue = 3; // 5 + 3 = 8

  const result = processMove(state, 'u1', 0, 8);
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.captured, null, 'Safe cells must not allow capture');
  assert.strictEqual(result.gameState.boardState.blue.tokens[0].status, TOKEN_STATUS.ACTIVE);
});

// 9. Turn advancement when no 6 and no capture
test('9. Turn advances to next player after standard non-6 move', () => {
  const state = initializeGameState([
    { userId: 'u1', username: 'Alice' },
    { userId: 'u2', username: 'Bob' }
  ]);

  state.boardState.red.tokens[0].status = TOKEN_STATUS.ACTIVE;
  state.boardState.red.tokens[0].boardPosition = 1;
  state.diceRolled = true;
  state.diceValue = 2;

  const result = processMove(state, 'u1', 0, 3);
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.gameState.currentPlayerIndex, 1, 'Turn should pass to Bob');
  assert.strictEqual(result.gameState.diceRolled, false);
  assert.strictEqual(result.gameState.diceValue, null);
});

// 10. Win condition detection
test('10. Detects victory when all 4 tokens finish', () => {
  const state = initializeGameState([
    { userId: 'u1', username: 'Alice' },
    { userId: 'u2', username: 'Bob' }
  ]);

  // Set 3 tokens already finished
  state.boardState.red.finishedTokens = 3;
  state.boardState.red.tokens[0].status = TOKEN_STATUS.FINISHED;
  state.boardState.red.tokens[1].status = TOKEN_STATUS.FINISHED;
  state.boardState.red.tokens[2].status = TOKEN_STATUS.FINISHED;

  // 4th token in safe home column: position 105 (step 5)
  state.boardState.red.tokens[3].status = TOKEN_STATUS.SAFE;
  state.boardState.red.tokens[3].boardPosition = 105;

  // Dice roll 1 moves it into center
  state.diceRolled = true;
  state.diceValue = 1;

  const result = processMove(state, 'u1', 3, 'center');
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.gameOver, true);
  assert.strictEqual(result.gameState.phase, 'completed');
  assert.strictEqual(result.winners[0].userId, 'u1');
});

console.log(`\n========================================`);
console.log(`Test Results: ${passed} Passed, ${failed} Failed`);
console.log(`========================================\n`);

if (failed > 0) process.exit(1);

