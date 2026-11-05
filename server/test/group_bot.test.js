const assert = require('assert');
const {
  isGroupChat,
  formatLobbyText,
  buildLobbyKeyboard,
  buildGroupWelcomeKeyboard,
  formatMatchReadyMessage,
  buildOpenGameKeyboard,
  getMiniAppDirectLink,
  isValidHttpsUrl,
  getValidWebAppUrl
} = require('../src/bot/bot');
const {
  createMatch,
  joinMatch,
  startMatch,
  cancelMatch,
  getMatchById,
  getWaitingMatchByGroup,
  getActiveGroupMatches,
  onMatchCompleted,
  onMatchStarted,
  completeMatch
} = require('../src/services/matchService');
const { findOrCreateUser } = require('../src/middleware/auth');

console.log('🧪 Starting Telegram Group Gaming Integration Tests...\n');

let passed = 0;
let failed = 0;

async function test(description, fn) {
  try {
    await fn();
    console.log(`✅ PASS: ${description}`);
    passed++;
  } catch (err) {
    console.error(`❌ FAIL: ${description}`);
    console.error(err);
    failed++;
  }
}

(async () => {
  // 1. Group Chat Detection
  await test('1. isGroupChat accurately identifies group and supergroup chats', () => {
    assert.strictEqual(isGroupChat({ type: 'group' }), true);
    assert.strictEqual(isGroupChat({ type: 'supergroup' }), true);
    assert.strictEqual(isGroupChat({ type: 'private' }), false);
    assert.strictEqual(isGroupChat({ type: 'channel' }), false);
    assert.strictEqual(isGroupChat(null), false);
  });

  // 2. Command Regex Parsing with bot mentions
  await test('2. Command regexes support group @AnayaReplyBot mentions and player counts', () => {
    const cmdRegex = /\/(?:newgame|ludo)(?:@\w+)?(?:\s+(.+))?/;

    assert.strictEqual(cmdRegex.test('/newgame'), true);
    assert.strictEqual(cmdRegex.test('/newgame@AnayaReplyBot'), true);
    assert.strictEqual(cmdRegex.test('/newgame@AnayaReplyBot 2'), true);
    assert.strictEqual(cmdRegex.test('/ludo'), true);
    assert.strictEqual(cmdRegex.test('/ludo@AnayaReplyBot'), true);
    assert.strictEqual(cmdRegex.test('/ludo 3'), true);

    const matchWithArg = '/newgame@AnayaReplyBot 4'.match(cmdRegex);
    assert.strictEqual(matchWithArg[1], '4');
  });

  // 3. Group Welcome Keyboard Safety
  await test('3. Group welcome keyboard never contains localhost URLs', () => {
    delete process.env.WEB_APP_URL;
    const keyboard = buildGroupWelcomeKeyboard();
    assert.ok(keyboard && keyboard.inline_keyboard);

    for (const row of keyboard.inline_keyboard) {
      for (const btn of row) {
        if (btn.url) {
          assert.strictEqual(btn.url.includes('localhost'), false, `Forbidden localhost in button: ${btn.url}`);
          assert.strictEqual(btn.url.includes('127.0.0.1'), false);
        }
      }
    }
  });

  // 4. Lobby Message Formatting
  await test('4. formatLobbyText renders correct player slots, host, and room code', () => {
    const fakeMatch = {
      id: 'm1',
      room_code: 'LUDO99',
      max_players: 4,
      creator_id: 'u1'
    };
    const fakePlayers = [
      { userId: 'u1', username: 'HostPlayer', color: 'red', position: 0 }
    ];

    const text = formatLobbyText(fakeMatch, fakePlayers, '@HostPlayer');
    assert.ok(text.includes('LUDO99'), 'Contains room code');
    assert.ok(text.includes('@HostPlayer'), 'Contains host username');
    assert.ok(text.includes('1/4'), 'Shows current players 1/4');
    assert.ok(text.includes('🔴 *@HostPlayer* (Host)'), 'Shows host in red slot');
    assert.ok(text.includes('🔵 _Waiting..._'), 'Shows waiting slot');
  });

  // 5. Lobby Keyboard Structure
  await test('5. buildLobbyKeyboard generates safe buttons for joining, watching, starting and cancelling', () => {
    const fakeMatch = { id: 'test-match-123', max_players: 4, room_code: 'TEST01' };

    // With 1 player: should have join, watch, cancel (no start until >= 2 players)
    const kb1 = buildLobbyKeyboard(fakeMatch, 1);
    const flattenedCallbacks1 = kb1.inline_keyboard.flat().map(b => b.callback_data).filter(Boolean);
    assert.ok(flattenedCallbacks1.includes('join_match:test-match-123'));
    assert.ok(flattenedCallbacks1.includes('cancel_match:test-match-123'));
    assert.strictEqual(flattenedCallbacks1.includes('start_match:test-match-123'), false);

    // With 2 players: start match button appears
    const kb2 = buildLobbyKeyboard(fakeMatch, 2);
    const flattenedCallbacks2 = kb2.inline_keyboard.flat().map(b => b.callback_data).filter(Boolean);
    assert.ok(flattenedCallbacks2.includes('start_match:test-match-123'));
  });

  // 6. Multi-Group Match Isolation in Database
  await test('6. Group matches are isolated by telegram_group_id', async () => {
    const groupAId = -1001111111111;
    const groupBId = -1002222222222;

    const hostA = await findOrCreateUser({ id: 900001, username: 'host_a', first_name: 'Host A' });
    const hostB = await findOrCreateUser({ id: 900002, username: 'host_b', first_name: 'Host B' });

    const matchA = await createMatch(hostA.id, {
      name: 'Group A Game',
      maxPlayers: 4,
      telegramGroupId: groupAId
    });

    const matchB = await createMatch(hostB.id, {
      name: 'Group B Game',
      maxPlayers: 2,
      telegramGroupId: groupBId
    });

    const waitingInA = await getWaitingMatchByGroup(groupAId);
    const waitingInB = await getWaitingMatchByGroup(groupBId);

    assert.strictEqual(waitingInA.id, matchA.id);
    assert.strictEqual(waitingInB.id, matchB.id);
    assert.strictEqual(waitingInA.telegram_group_id, String(groupAId));
    assert.strictEqual(waitingInB.telegram_group_id, String(groupBId));
  });

  // 7. Joining a Group Match and Starting It
  await test('7. Players can join a group match and host can start when >= 2 players', async () => {
    const groupId = -1003333333333;
    const host = await findOrCreateUser({ id: 900003, username: 'ludoking', first_name: 'King' });
    const player2 = await findOrCreateUser({ id: 900004, username: 'challenger', first_name: 'Challenger' });

    const match = await createMatch(host.id, {
      name: 'Lobby Test Match',
      maxPlayers: 4,
      telegramGroupId: groupId
    });

    // Player 2 joins
    const joinResult = await joinMatch(match.id, player2.id);
    assert.strictEqual(joinResult.match.current_players, 2);

    const matchDetails = await getMatchById(match.id);
    assert.strictEqual(matchDetails.players.length, 2);

    // Host starts match
    const startResult = await startMatch(match.id, host.id);
    assert.strictEqual(startResult.match.status, 'playing');

    const updated = await getMatchById(match.id);
    assert.strictEqual(updated.status, 'playing');
  });

  // 8. Cancelling a Group Match
  await test('8. Host or Admin can cancel a waiting match', async () => {
    const groupId = -1004444444444;
    const host = await findOrCreateUser({ id: 900005, username: 'cancel_host', first_name: 'Cancel Host' });

    const match = await createMatch(host.id, {
      name: 'To Be Cancelled',
      maxPlayers: 2,
      telegramGroupId: groupId
    });

    const cancelled = await cancelMatch(match.id, host.id, false);
    assert.strictEqual(cancelled.status, 'cancelled');

    const check = await getWaitingMatchByGroup(groupId);
    assert.strictEqual(check, null);
  });

  // 9. Match Completed Announcement Hook
  await test('9. onMatchCompleted hook notifies Telegram group when match finishes', async () => {
    const groupId = -1005555555555;
    const host = await findOrCreateUser({ id: 900006, username: 'winner_player', first_name: 'Winner' });
    const opponent = await findOrCreateUser({ id: 900007, username: 'runner_player', first_name: 'Runner' });

    const match = await createMatch(host.id, {
      name: 'Championship Final',
      maxPlayers: 2,
      telegramGroupId: groupId
    });

    await joinMatch(match.id, opponent.id);
    await startMatch(match.id, host.id);

    let hookCalled = false;
    let hookedGroupId = null;
    let hookedWinnerUsername = null;

    onMatchCompleted((finishedMatch, winners) => {
      if (finishedMatch.id === match.id) {
        hookCalled = true;
        hookedGroupId = finishedMatch.telegram_group_id;
        hookedWinnerUsername = winners[0]?.username;
      }
    });

    await completeMatch(match.id, [
      { userId: host.id, username: 'winner_player', color: 'red' },
      { userId: opponent.id, username: 'runner_player', color: 'blue' }
    ]);

    assert.strictEqual(hookCalled, true);
    assert.strictEqual(String(hookedGroupId), String(groupId));
    assert.strictEqual(hookedWinnerUsername, 'winner_player');
  });

  // 10. Direct Telegram Mini App Launch URL format
  await test('10. getMiniAppDirectLink produces named app link when short name is configured, and Main Mini App link when empty', () => {
    process.env.TELEGRAM_BOT_USERNAME = 'AnayaReplyBot';
    process.env.TELEGRAM_MINI_APP_SHORT_NAME = 'ludo';

    const testMatchId = 'e72089da-b461-460d-a77a-694589d31191';
    const namedLink = getMiniAppDirectLink(testMatchId);

    assert.strictEqual(
      namedLink,
      `https://t.me/AnayaReplyBot/ludo?startapp=${testMatchId}`
    );

    // Test Main Mini App link (when short name is empty)
    process.env.TELEGRAM_MINI_APP_SHORT_NAME = '';
    const mainAppLink = getMiniAppDirectLink(testMatchId);
    assert.strictEqual(
      mainAppLink,
      `https://t.me/AnayaReplyBot?startapp=${testMatchId}`
    );
    assert.strictEqual(mainAppLink.includes('localhost'), false);
    assert.strictEqual(mainAppLink.includes('http://'), false);
    assert.ok(mainAppLink.startsWith('https://t.me/'));
  });

  // 11. Match Ready Message format
  await test('11. formatMatchReadyMessage produces exact attractive invitation without room codes or IDs', () => {
    const players = [
      { username: 'Harsh' },
      { username: 'strider_is_here' }
    ];

    const msg = formatMatchReadyMessage(players);

    assert.ok(msg.includes('🎲 LUDO MATCH IS READY!'));
    assert.ok(msg.includes('The match has started!'));
    assert.ok(msg.includes('👥 Players:'));
    assert.ok(msg.includes('🔴 @Harsh'));
    assert.ok(msg.includes('🔵 @strider_is_here'));
    assert.ok(msg.includes('Tap below to enter the game and play!'));

    // Verify exclusions
    assert.strictEqual(msg.includes('Room Code'), false);
    assert.strictEqual(msg.includes('localhost'), false);
    assert.strictEqual(msg.includes('http'), false);
    assert.strictEqual(msg.includes('uuid'), false);
  });

  // 12. OPEN GAME Keyboard Button
  await test('12. buildOpenGameKeyboard creates single 🎮 OPEN GAME direct launch button', () => {
    process.env.TELEGRAM_MINI_APP_SHORT_NAME = '';
    const testMatchId = 'test-match-uuid-999';
    const kb = buildOpenGameKeyboard(testMatchId);

    assert.ok(kb && kb.inline_keyboard);
    assert.strictEqual(kb.inline_keyboard.length, 1);
    assert.strictEqual(kb.inline_keyboard[0].length, 1);

    const btn = kb.inline_keyboard[0][0];
    assert.strictEqual(btn.text, '🎮 OPEN GAME');
    assert.strictEqual(
      btn.url,
      `https://t.me/AnayaReplyBot?startapp=${testMatchId}`
    );
  });

  // 13. onMatchStarted hook notifies on game start
  await test('13. onMatchStarted hook triggers with active match and player list on startMatch', async () => {
    const groupId = -1006666666666;
    const host = await findOrCreateUser({ id: 900008, username: 'start_host', first_name: 'Start Host' });
    const p2 = await findOrCreateUser({ id: 900009, username: 'start_p2', first_name: 'P2' });

    const match = await createMatch(host.id, {
      name: 'Start Hook Match',
      maxPlayers: 2,
      telegramGroupId: groupId
    });

    await joinMatch(match.id, p2.id);

    let startedCalled = false;
    let startedMatchId = null;
    let startedPlayers = null;

    onMatchStarted((m, players) => {
      if (m.id === match.id) {
        startedCalled = true;
        startedMatchId = m.id;
        startedPlayers = players;
      }
    });

    await startMatch(match.id, host.id);

    assert.strictEqual(startedCalled, true);
    assert.strictEqual(startedMatchId, match.id);
    assert.strictEqual(startedPlayers.length, 2);
  });

  console.log(`\n========================================`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log(`========================================\n`);

  if (failed > 0) process.exit(1);
})();

