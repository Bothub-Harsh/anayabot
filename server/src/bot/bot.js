const TelegramBot = require('node-telegram-bot-api');
const {
  findUserByTelegramId,
  getLeaderboardUsers,
  models,
  memoryStore
} = require('../database/db');
const { findOrCreateUser } = require('../middleware/auth');
const {
  createMatch,
  joinMatch,
  startMatch,
  cancelMatch,
  getMatchById,
  getMatchByRoomCode,
  getPublicMatches,
  getWaitingMatchByGroup,
  getActiveGroupMatches,
  updateMatchTelegramMessage,
  onMatchCompleted,
  onMatchStarted
} = require('../services/matchService');

let bot = null;
const BOT_USERNAME = process.env.TELEGRAM_BOT_USERNAME || 'AnayaReplyBot';
const MINI_APP_SHORT_NAME = process.env.TELEGRAM_MINI_APP_SHORT_NAME || 'ludo';

/**
 * Validates whether a URL is a valid, public HTTPS URL acceptable for Telegram WebApp
 */
function isValidHttpsUrl(urlString) {
  if (!urlString || typeof urlString !== 'string') return false;
  const trimmed = urlString.trim();
  if (!trimmed) return false;

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:') return false;
    // Telegram rejects localhost and loopback IPs in keyboard buttons
    if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' || parsed.hostname === '::1') {
      return false;
    }
    return true;
  } catch (err) {
    return false;
  }
}

/**
 * Builds a valid HTTPS WebApp URL or returns null if not configured
 */
function getValidWebAppUrl(pathOrParams = '') {
  const rawUrl = process.env.WEB_APP_URL;
  if (!isValidHttpsUrl(rawUrl)) return null;

  const base = rawUrl.trim();
  if (!pathOrParams) return base;

  if (pathOrParams.startsWith('?')) {
    const glue = base.includes('?') ? '&' : '?';
    return `${base}${glue}${pathOrParams.substring(1)}`;
  }
  return `${base.replace(/\/$/, '')}/${pathOrParams.replace(/^\//, '')}`;
}

/**
 * Generates direct Telegram Mini App launch link
 * Format: https://t.me/BOT_USERNAME/APP_SHORT_NAME?startapp=match_MATCH_ID
 */
function getMiniAppDirectLink(matchId = '') {
  const botUsername = (process.env.TELEGRAM_BOT_USERNAME || BOT_USERNAME || 'AnayaReplyBot').trim().replace(/^@/, '');
  const shortName = (process.env.TELEGRAM_MINI_APP_SHORT_NAME || MINI_APP_SHORT_NAME || 'ludo').trim();

  const param = matchId ? `match_${matchId}` : '';
  if (shortName) {
    return `https://t.me/${botUsername}/${shortName}${param ? `?startapp=${param}` : ''}`;
  }
  return `https://t.me/${botUsername}${param ? `?startapp=${param}` : ''}`;
}

/**
 * Formats the clean, attractive match start invitation for Telegram groups
 */
function formatMatchReadyMessage(players = []) {
  const colorEmojis = ['🔴', '🔵', '🟢', '🟡'];
  const playerRows = players.map((p, idx) => {
    const emoji = colorEmojis[idx] || '⚪';
    const username = p.username
      ? `@${p.username}`
      : (p.first_name ? `@${p.first_name}` : 'Player');
    return `${emoji} ${username}`;
  });

  return (
    `🎲 LUDO MATCH IS READY!\n\n` +
    `The match has started!\n\n` +
    `👥 Players:\n` +
    playerRows.join('\n') + `\n\n` +
    `Tap below to enter the game and play!`
  );
}

/**
 * Builds the inline keyboard for the OPEN GAME button
 */
function buildOpenGameKeyboard(matchId) {
  const directLink = getMiniAppDirectLink(matchId);
  return {
    inline_keyboard: [
      [
        { text: '🎮 OPEN GAME', url: directLink }
      ]
    ]
  };
}

/**
 * Helper to check if a chat is a group or supergroup
 */
function isGroupChat(chat) {
  if (!chat || !chat.type) return false;
  return chat.type === 'group' || chat.type === 'supergroup';
}

/**
 * Check if a user is an administrator or creator of a group chat
 */
async function isGroupAdmin(chatId, userId) {
  if (!bot) return false;
  try {
    const member = await bot.getChatMember(chatId, userId);
    return member.status === 'creator' || member.status === 'administrator';
  } catch (err) {
    return false;
  }
}

/**
 * Robust message sender with automatic fallback to plain message if Telegram rejects markup or markdown
 */
async function safeSendMessage(chatId, text, options = {}) {
  if (!bot) return null;

  try {
    return await bot.sendMessage(chatId, text, options);
  } catch (primaryErr) {
    console.warn(`[Telegram Bot] sendMessage failed (${primaryErr.message}). Retrying fallback...`);
    try {
      // Retry without reply_markup
      return await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
    } catch (markdownErr) {
      // Retry as raw text without markdown
      try {
        const plainText = text.replace(/[*_`\[\]()]/g, '');
        return await bot.sendMessage(chatId, plainText);
      } catch (finalErr) {
        console.error(`[Telegram Bot] Could not send message to chatId ${chatId}:`, finalErr.message);
        return null;
      }
    }
  }
}

/**
 * Robust message editor for updating lobby in-place
 */
async function safeEditMessage(chatId, messageId, text, options = {}) {
  if (!bot) return null;
  try {
    return await bot.editMessageText(text, {
      chat_id: chatId,
      message_id: messageId,
      ...options
    });
  } catch (err) {
    if (err.message && err.message.includes('message is not modified')) {
      return null;
    }
    console.warn(`[Telegram Bot] editMessageText failed (${err.message}). Retrying plain edit...`);
    try {
      const plainText = text.replace(/[*_`\[\]()]/g, '');
      return await bot.editMessageText(plainText, {
        chat_id: chatId,
        message_id: messageId
      });
    } catch (finalErr) {
      console.error(`[Telegram Bot] Could not edit message ${messageId}:`, finalErr.message);
      return null;
    }
  }
}

/**
 * Formats the markdown lobby text for a match
 */
function formatLobbyText(match, players = [], hostUsername = 'Host') {
  const max = match.max_players || 4;
  const current = players.length;
  const colorEmojis = ['🔴', '🔵', '🟢', '🟡'];

  const playerRows = [];
  for (let i = 0; i < max; i++) {
    const p = players[i];
    const emoji = colorEmojis[i] || '⚪';
    if (p) {
      const isCreator = p.userId === match.creator_id;
      const tag = isCreator ? ' (Host)' : '';
      const name = p.username ? `@${p.username}` : (p.first_name || 'Player');
      playerRows.push(`${i + 1}. ${emoji} *${name}*${tag}`);
    } else {
      playerRows.push(`${i + 1}. ${emoji} _Waiting..._`);
    }
  }

  const isFull = current >= max;
  const statusLine = isFull
    ? '✅ *Lobby Full!* Host can start the match.'
    : `⏳ *Waiting for players...* (${current}/${max})`;

  return (
    `🎲 *Ludo Arena Match Lobby*\n\n` +
    `🔑 *Room Code:* \`${match.room_code}\`\n` +
    `👑 *Host:* ${hostUsername}\n` +
    `🎮 *Mode:* ${max} Players\n\n` +
    `👥 *Players (${current}/${max}):*\n` +
    playerRows.join('\n') + `\n\n` +
    statusLine
  );
}

/**
 * Builds the inline keyboard for a lobby message
 */
function buildLobbyKeyboard(match, currentCount = 1) {
  const matchId = match.id;
  const max = match.max_players || 4;
  const isFull = currentCount >= max;
  const httpsUrl = getValidWebAppUrl(`?join=${match.room_code || matchId}`);

  const keyboard = [];

  // Row 1: Join button (if not full)
  if (!isFull) {
    keyboard.push([
      { text: '➕ Join Match', callback_data: `join_match:${matchId}` }
    ]);
  }

  // Row 2: Watch / Spectate
  if (httpsUrl) {
    keyboard.push([
      { text: '👁 Watch Match', url: httpsUrl }
    ]);
  } else {
    keyboard.push([
      { text: '👁 Watch Match', callback_data: `watch_match:${matchId}` }
    ]);
  }

  // Row 3: Start match (host/admin only)
  if (currentCount >= 2) {
    keyboard.push([
      { text: '🚀 Start Match', callback_data: `start_match:${matchId}` }
    ]);
  }

  // Row 4: Cancel match (host/admin only)
  keyboard.push([
    { text: '❌ Cancel Match', callback_data: `cancel_match:${matchId}` }
  ]);

  return { inline_keyboard: keyboard };
}

/**
 * Builds the inline keyboard for the group /start welcome message
 */
function buildGroupWelcomeKeyboard() {
  const httpsUrl = getValidWebAppUrl();
  const directLink = `https://t.me/${BOT_USERNAME}`;

  const keyboard = [];

  if (httpsUrl) {
    keyboard.push([
      { text: '🎮 Play Ludo', url: httpsUrl },
      { text: '👁 Watch Live Matches', url: getValidWebAppUrl('?page=spectate') }
    ]);
    keyboard.push([
      { text: '🏆 Leaderboard', url: getValidWebAppUrl('?page=leaderboard') },
      { text: '📖 How to Play', callback_data: 'how_to_play' }
    ]);
  } else {
    keyboard.push([
      { text: '🎮 Play Ludo', url: directLink },
      { text: '👁 Watch Live Matches', callback_data: 'group_matches' }
    ]);
    keyboard.push([
      { text: '🏆 Leaderboard', callback_data: 'group_leaderboard' },
      { text: '📖 How to Play', callback_data: 'how_to_play' }
    ]);
  }

  return { inline_keyboard: keyboard };
}

function initializeBot() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.warn('⚠️  TELEGRAM_BOT_TOKEN not set, bot disabled');
    return null;
  }

  // Ensure any existing polling instance is cleanly stopped
  if (bot) {
    try {
      bot.stopPolling();
    } catch (e) {}
    bot = null;
  }

  try {
    bot = new TelegramBot(token, { polling: true });

    bot.on('polling_error', (error) => {
      if (error.message && error.message.includes('409 Conflict')) {
        console.warn('⚠️ [Telegram Bot] Polling conflict: another instance is active. Retrying...');
        return;
      }
      console.warn('⚠️ [Telegram Bot] Polling error:', error.message);
    });

    bot.on('error', (error) => {
      console.error('❌ [Telegram Bot] Error:', error.message);
    });

    const configuredWebAppUrl = getValidWebAppUrl();
    if (configuredWebAppUrl) {
      console.log('🔗 [Telegram Bot] Mini App URL active: HTTPS verified');
    } else {
      console.log('ℹ️ [Telegram Bot] WEB_APP_URL is not set or not HTTPS.');
      console.log('   Using Telegram-safe direct deep links and callbacks to avoid HTTP 400.');
    }

    // Register hook for match completions in groups
    onMatchCompleted(async (match, winners) => {
      if (!match || !match.telegram_group_id) return;
      try {
        const topWinner = winners[0];
        const runnerUp = winners[1];

        let announcement =
          `🏆 *MATCH FINISHED!*\n\n` +
          `Match Room: \`${match.room_code}\`\n\n` +
          `🥇 *Winner:* ${topWinner?.username ? '@' + topWinner.username : 'Champion'} (+100 XP)\n`;

        if (runnerUp) {
          announcement += `🥈 *Runner-Up:* ${runnerUp?.username ? '@' + runnerUp.username : 'Second Place'} (+25 XP)\n`;
        }

        announcement += `\n🎉 Fantastic game! Ready for another round? Send /newgame to start!`;

        const keyboard = {
          inline_keyboard: [
            [
              { text: '🎮 New Game', callback_data: 'new_group_game' },
              { text: '🏆 Leaderboard', callback_data: 'group_leaderboard' }
            ]
          ]
        };

        await safeSendMessage(match.telegram_group_id, announcement, {
          parse_mode: 'Markdown',
          reply_markup: keyboard
        });
      } catch (e) {
        console.warn('[Telegram Bot] Match completion announcement failed:', e.message);
      }
    });

    // Register hook for match start in groups (Direct Telegram Mini App launch)
    onMatchStarted(async (match, players) => {
      if (!match || !match.telegram_group_id) return;
      try {
        const messageText = formatMatchReadyMessage(players);
        const keyboard = buildOpenGameKeyboard(match.id);

        if (match.telegram_message_id) {
          const edited = await safeEditMessage(match.telegram_group_id, match.telegram_message_id, messageText, {
            reply_markup: keyboard
          });
          if (edited) return;
        }

        await safeSendMessage(match.telegram_group_id, messageText, {
          reply_markup: keyboard
        });
      } catch (e) {
        console.warn('[Telegram Bot] onMatchStarted group message error:', e.message);
      }
    });

    // =========================================================================
    // COMMAND: /start
    // =========================================================================
    bot.onText(/\/start(?:@\w+)?(?:\s+(.+))?/, async (msg, match) => {
      const chatId = msg.chat.id;
      const telegramUser = msg.from;
      const startParam = match && match[1] ? match[1].trim() : '';

      // Register or update user in database
      try {
        await findOrCreateUser({
          id: telegramUser.id,
          username: telegramUser.username,
          first_name: telegramUser.first_name,
          last_name: telegramUser.last_name,
          language_code: telegramUser.language_code
        });
      } catch (dbErr) {
        console.warn('User registration note in /start:', dbErr.message);
      }

      // Group Chat Welcome
      if (isGroupChat(msg.chat)) {
        const groupWelcomeText =
          `🎲 Welcome to Ludo Arena!\n\n` +
          `Hey everyone! Ready for multiplayer Ludo?\n\n` +
          `Play with your friends, invite other players and watch live matches.\n\n` +
          `Features:\n` +
          `🎮 2–4 Player Multiplayer Ludo\n` +
          `👁 Live Spectator Mode\n` +
          `💬 Live Comments and Reactions\n` +
          `🏆 Leaderboards and XP\n` +
          `🔥 Competitive Matches`;

        return safeSendMessage(chatId, groupWelcomeText, {
          reply_markup: buildGroupWelcomeKeyboard()
        });
      }

      // Private Chat Welcome
      const webAppUrl = getValidWebAppUrl(startParam ? `?join=${startParam}` : '');
      const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';

      let welcomeText =
        `🎲 *Welcome to Ludo Arena!*\n\n` +
        `Hey ${telegramUser.first_name}! Ready for multiplayer Ludo on Telegram?\n\n` +
        `✨ *Features:*\n` +
        `🎮 2 to 4 Players Live Arena\n` +
        `👁 Spectator Mode with Real-Time View\n` +
        `💬 Live Chat & Emoji Reactions\n` +
        `🏆 Competitive Rankings & XP`;

      const sendOptions = { parse_mode: 'Markdown' };

      if (webAppUrl) {
        welcomeText += `\n\nTap *Play Ludo Arena* below to jump into the action!`;
        sendOptions.reply_markup = {
          inline_keyboard: [
            [{ text: '🎲 Play Ludo Arena', web_app: { url: webAppUrl } }],
            [
              { text: '👁 Spectate Matches', web_app: { url: getValidWebAppUrl('?page=spectate') } },
              { text: '🏆 Leaderboard', web_app: { url: getValidWebAppUrl('?page=leaderboard') } }
            ]
          ]
        };
      } else {
        welcomeText +=
          `\n\n🌐 *Local Development Play:*\n` +
          `Open the web app in your browser:\n\`${clientUrl}\`\n\n` +
          `💡 *To enable in-app Telegram buttons:*\n` +
          `Run \`ngrok http 5173\` and set \`WEB_APP_URL=https://...\` in \`server/.env\`.`;
      }

      await safeSendMessage(chatId, welcomeText, sendOptions);
    });

    // =========================================================================
    // COMMAND: /newgame or /ludo (Group Match Lobby Creator)
    // =========================================================================
    const handleNewGame = async (msg, match) => {
      const chatId = msg.chat.id;
      const telegramUser = msg.from;

      try {
        const user = await findOrCreateUser({
          id: telegramUser.id,
          username: telegramUser.username,
          first_name: telegramUser.first_name,
          last_name: telegramUser.last_name,
          language_code: telegramUser.language_code
        });

        // Parse optional player count (e.g. /newgame 2, /newgame 3, /newgame 4)
        let maxPlayers = 4;
        const arg = match && match[1] ? match[1].trim() : '';
        const parsedCount = parseInt(arg, 10);
        if (parsedCount >= 2 && parsedCount <= 4) {
          maxPlayers = parsedCount;
        }

        // Check if there is already an active waiting match in this group
        if (isGroupChat(msg.chat)) {
          const existing = await getWaitingMatchByGroup(chatId);
          if (existing) {
            return safeSendMessage(
              chatId,
              `⚠️ *A match lobby is already open in this group!*\n\n` +
              `🔑 Room Code: \`${existing.room_code}\`\n` +
              `Players: ${existing.current_players}/${existing.max_players}\n\n` +
              `Tap below to join, or use /cancel to cancel it:`,
              {
                parse_mode: 'Markdown',
                reply_markup: buildLobbyKeyboard(existing, existing.current_players)
              }
            );
          }
        }

        // Create match
        const newMatch = await createMatch(user.id, {
          name: isGroupChat(msg.chat) ? `${msg.chat.title || 'Group'} Match` : `${user.first_name}'s Match`,
          maxPlayers,
          visibility: 'public',
          telegramGroupId: chatId
        });

        // Fetch detailed match with players
        const matchData = await getMatchById(newMatch.id);
        const hostName = telegramUser.username ? `@${telegramUser.username}` : telegramUser.first_name;
        const lobbyText = formatLobbyText(matchData, matchData.players, hostName);
        const replyMarkup = buildLobbyKeyboard(matchData, matchData.players?.length || 1);

        const sent = await safeSendMessage(chatId, lobbyText, {
          parse_mode: 'Markdown',
          reply_markup: replyMarkup
        });

        if (sent && sent.message_id) {
          await updateMatchTelegramMessage(newMatch.id, sent.message_id);
        }
      } catch (err) {
        console.error('Error creating match via bot:', err);
        await safeSendMessage(chatId, `❌ Failed to create match: ${err.message}`);
      }
    };

    bot.onText(/\/newgame(?:@\w+)?(?:\s+(.+))?/, handleNewGame);
    bot.onText(/\/ludo(?:@\w+)?(?:\s+(.+))?/, handleNewGame);

    // =========================================================================
    // COMMAND: /join
    // =========================================================================
    bot.onText(/\/join(?:@\w+)?(?:\s+(.+))?/, async (msg, match) => {
      const chatId = msg.chat.id;
      const codeOrId = match && match[1] ? match[1].trim().toUpperCase() : '';

      try {
        const user = await findOrCreateUser({
          id: msg.from.id,
          username: msg.from.username,
          first_name: msg.from.first_name,
          last_name: msg.from.last_name,
          language_code: msg.from.language_code
        });

        let targetMatch = null;

        if (codeOrId) {
          targetMatch = await getMatchByRoomCode(codeOrId);
        } else if (isGroupChat(msg.chat)) {
          targetMatch = await getWaitingMatchByGroup(chatId);
        }

        if (!targetMatch) {
          return safeSendMessage(
            chatId,
            'ℹ️ No waiting match found to join. Use `/newgame` to create a new match lobby!',
            { parse_mode: 'Markdown' }
          );
        }

        // Attempt to join
        try {
          await joinMatch(targetMatch.id, user.id);
        } catch (joinErr) {
          return safeSendMessage(chatId, `⚠️ ${joinErr.message}`);
        }

        const updatedMatch = await getMatchById(targetMatch.id);
        const hostName = updatedMatch.creator_username ? `@${updatedMatch.creator_username}` : (updatedMatch.creator_name || 'Host');
        const lobbyText = formatLobbyText(updatedMatch, updatedMatch.players, hostName);
        const replyMarkup = buildLobbyKeyboard(updatedMatch, updatedMatch.players?.length || 1);

        // Edit existing lobby message if message_id is known
        if (updatedMatch.telegram_message_id) {
          await safeEditMessage(chatId, updatedMatch.telegram_message_id, lobbyText, {
            parse_mode: 'Markdown',
            reply_markup: replyMarkup
          });
        }

        await safeSendMessage(
          chatId,
          `✅ @${msg.from.username || msg.from.first_name} joined match \`${updatedMatch.room_code}\`! (${updatedMatch.players.length}/${updatedMatch.max_players})`,
          { parse_mode: 'Markdown' }
        );
      } catch (err) {
        console.error('Error joining match:', err);
        await safeSendMessage(chatId, `❌ Could not join match: ${err.message}`);
      }
    });

    // =========================================================================
    // COMMAND: /cancel
    // =========================================================================
    bot.onText(/\/cancel(?:@\w+)?/, async (msg) => {
      const chatId = msg.chat.id;
      const userId = msg.from.id;

      try {
        const user = await findOrCreateUser({
          id: userId,
          username: msg.from.username,
          first_name: msg.from.first_name,
          last_name: msg.from.last_name
        });

        const waitingMatch = isGroupChat(msg.chat)
          ? await getWaitingMatchByGroup(chatId)
          : null;

        if (!waitingMatch) {
          return safeSendMessage(chatId, 'ℹ️ No active waiting match found in this chat to cancel.');
        }

        // Verify authority: must be creator or group admin
        const isAdmin = isGroupChat(msg.chat) ? await isGroupAdmin(chatId, userId) : false;
        if (waitingMatch.creator_id !== user.id && !isAdmin) {
          return safeSendMessage(chatId, '⚠️ Only the host or a group admin can cancel this match.');
        }

        await cancelMatch(waitingMatch.id, user.id, isAdmin);

        // Edit lobby message
        if (waitingMatch.telegram_message_id) {
          await safeEditMessage(
            chatId,
            waitingMatch.telegram_message_id,
            `❌ *MATCH CANCELLED*\n\nRoom: \`${waitingMatch.room_code}\`\nCancelled by @${msg.from.username || msg.from.first_name}.`,
            { parse_mode: 'Markdown' }
          );
        }

        await safeSendMessage(
          chatId,
          `🚫 Match \`${waitingMatch.room_code}\` was cancelled by @${msg.from.username || msg.from.first_name}.`,
          { parse_mode: 'Markdown' }
        );
      } catch (err) {
        console.error('Error cancelling match:', err);
        await safeSendMessage(chatId, `❌ Could not cancel match: ${err.message}`);
      }
    });

    // =========================================================================
    // COMMAND: /watch or /spectate
    // =========================================================================
    const handleWatch = async (msg) => {
      const chatId = msg.chat.id;
      try {
        const activeMatches = isGroupChat(msg.chat)
          ? await getActiveGroupMatches(chatId)
          : await getPublicMatches();

        if (!activeMatches || activeMatches.length === 0) {
          return safeSendMessage(chatId, '👁 No live matches are currently running. Send /newgame to start one!');
        }

        const lines = activeMatches.slice(0, 5).map(m => {
          const statusIcon = m.status === 'playing' ? '🔴 LIVE' : '⏳ Waiting';
          return `• *${m.name}* [\`${m.room_code}\`] — ${m.current_players}/${m.max_players} (${statusIcon})`;
        });

        const httpsUrl = getValidWebAppUrl('?page=spectate');
        const keyboard = httpsUrl
          ? { inline_keyboard: [[{ text: '👁 Open Spectator Lounge', url: httpsUrl }]] }
          : undefined;

        await safeSendMessage(
          chatId,
          `👁 *Live Matches in Arena:*\n\n${lines.join('\n')}\n\nJoin or watch live!`,
          {
            parse_mode: 'Markdown',
            reply_markup: keyboard
          }
        );
      } catch (err) {
        await safeSendMessage(chatId, 'Unable to retrieve matches.');
      }
    };

    bot.onText(/\/watch(?:@\w+)?/, handleWatch);
    bot.onText(/\/spectate(?:@\w+)?/, handleWatch);

    // =========================================================================
    // COMMAND: /matches
    // =========================================================================
    bot.onText(/\/matches(?:@\w+)?/, async (msg) => {
      const chatId = msg.chat.id;
      try {
        const matches = isGroupChat(msg.chat)
          ? await getActiveGroupMatches(chatId)
          : await getPublicMatches();

        if (!matches || matches.length === 0) {
          return safeSendMessage(chatId, '🎲 No active matches right now. Use /newgame to create one!');
        }

        const text = matches
          .slice(0, 8)
          .map(m => `• *${m.name}* [Code: \`${m.room_code}\`] — ${m.current_players}/${m.max_players} (${m.status})`)
          .join('\n');

        await safeSendMessage(chatId, `🎮 *Matches:*\n\n${text}\n\nSend /newgame to create a new match!`, { parse_mode: 'Markdown' });
      } catch (err) {
        await safeSendMessage(chatId, 'Unable to load matches at the moment.');
      }
    });

    // =========================================================================
    // COMMAND: /leaderboard
    // =========================================================================
    bot.onText(/\/leaderboard(?:@\w+)?/, async (msg) => {
      const chatId = msg.chat.id;
      try {
        const { leaderboard } = await getLeaderboardUsers({ limit: 10 });

        if (!leaderboard || leaderboard.length === 0) {
          return safeSendMessage(chatId, '🏆 No match records found yet! Be the first to win by sending /newgame!');
        }

        const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
        const text = leaderboard
          .map((r, i) => `${medals[i]} ${r.username ? '@' + r.username : r.first_name}: *${r.wins} wins* (${r.total_matches} matches, ${r.total_xp || 0} XP)`)
          .join('\n');

        await safeSendMessage(chatId, `🏆 *Top Ludo Arena Champions*\n\n${text}`, { parse_mode: 'Markdown' });
      } catch (err) {
        await safeSendMessage(chatId, 'Leaderboard is currently updating. Check back soon!');
      }
    });

    // =========================================================================
    // COMMAND: /profile
    // =========================================================================
    bot.onText(/\/profile(?:@\w+)?/, async (msg) => {
      const chatId = msg.chat.id;
      try {
        const p = await findUserByTelegramId(msg.from.id);

        if (!p) {
          return safeSendMessage(chatId, 'Profile not found. Please send /start first to register.');
        }

        const winRate = p.total_matches > 0
          ? ((p.wins / p.total_matches) * 100).toFixed(1)
          : '0.0';

        await safeSendMessage(
          chatId,
          `👤 *Profile: ${p.first_name}*\n\n` +
          `🎮 *Matches:* ${p.total_matches || 0}\n` +
          `🏆 *Wins:* ${p.wins || 0}\n` +
          `💔 *Losses:* ${p.losses || 0}\n` +
          `📈 *Win Rate:* ${winRate}%\n` +
          `🔥 *Current Streak:* ${p.win_streak || 0}\n` +
          `⭐ *Level:* ${p.level || 1} (${p.total_xp || 0} XP)`,
          { parse_mode: 'Markdown' }
        );
      } catch (err) {
        await safeSendMessage(chatId, 'Unable to load profile at the moment.');
      }
    });

    // =========================================================================
    // COMMAND: /play
    // =========================================================================
    bot.onText(/\/play(?:@\w+)?/, async (msg) => {
      const webAppUrl = getValidWebAppUrl();
      const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';

      if (isGroupChat(msg.chat)) {
        return safeSendMessage(
          msg.chat.id,
          `🎲 To start a group match, use \`/newgame\` or \`/ludo\`!\nTo open your personal dashboard, click below:`,
          {
            parse_mode: 'Markdown',
            reply_markup: buildGroupWelcomeKeyboard()
          }
        );
      }

      if (webAppUrl) {
        await safeSendMessage(
          msg.chat.id,
          `🎲 *Ludo Arena*\n\nTap below to launch the Mini App:`,
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: '🎮 Launch Ludo Arena', web_app: { url: webAppUrl } }]
              ]
            }
          }
        );
      } else {
        await safeSendMessage(
          msg.chat.id,
          `🎲 *Ludo Arena*\n\nOpen in your browser:\n\`${clientUrl}\``,
          { parse_mode: 'Markdown' }
        );
      }
    });

    // =========================================================================
    // COMMAND: /help or /rules
    // =========================================================================
    const handleHelp = async (msg) => {
      await safeSendMessage(
        msg.chat.id,
        `📖 *Ludo Arena Group Gaming Guide*\n\n` +
        `*Group Commands:*\n` +
        `• /newgame [2|3|4] — Create a match lobby in this group\n` +
        `• /ludo — Shortcut to create a 4-player game lobby\n` +
        `• /join — Join the waiting match in this group\n` +
        `• /watch — Spectate active games live\n` +
        `• /matches — List active matches in this group\n` +
        `• /leaderboard — Global player rankings\n` +
        `• /profile — View your stats and XP\n` +
        `• /cancel — Cancel the waiting match (Host/Admin)\n` +
        `• /help — Show this guide\n\n` +
        `*Rules of Play:*\n` +
        `• 2, 3, or 4 players compete on the classic Ludo cross.\n` +
        `• Roll a 6 to bring a token out of the home yard.\n` +
        `• Land on an opponent's token to capture it and send it home!\n` +
        `• Star cells (⭐) and home paths are safe zones.\n` +
        `• First player to bring all 4 tokens to the center wins!`,
        { parse_mode: 'Markdown' }
      );
    };

    bot.onText(/\/help(?:@\w+)?/, handleHelp);
    bot.onText(/\/rules(?:@\w+)?/, handleHelp);

    // =========================================================================
    // COMMAND: /history
    // =========================================================================
    bot.onText(/\/history(?:@\w+)?/, async (msg) => {
      const chatId = msg.chat.id;
      try {
        const user = await findUserByTelegramId(msg.from.id);
        let historyMatches = [];
        if (user) {
          const userId = user.id || user._id;
          if (models.Match && models.Match.db.readyState === 1) {
            historyMatches = await models.Match.find({
              'players.userId': userId,
              status: 'completed'
            })
            .sort({ completed_at: -1 })
            .limit(10)
            .lean();
          } else {
            historyMatches = Array.from(memoryStore.matches.values())
              .filter(m => m.status === 'completed' && (m.players || []).some(p => p.userId === userId))
              .sort((a, b) => new Date(b.completed_at || 0) - new Date(a.completed_at || 0))
              .slice(0, 10);
          }
        }

        if (!historyMatches || historyMatches.length === 0) {
          return safeSendMessage(chatId, '📜 No completed matches in your history yet.');
        }

        const userId = user?.id || user?._id;
        const text = historyMatches
          .map(m => {
            const p = (m.players || []).find(x => x.userId === userId);
            return `• Match \`${m.room_code}\` | ${(p?.color || 'red').toUpperCase()} | Finished: #${p?.finished_position || '-'}`;
          })
          .join('\n');

        await safeSendMessage(chatId, `📜 *Recent Matches:*\n\n${text}`, { parse_mode: 'Markdown' });
      } catch (err) {
        await safeSendMessage(chatId, 'Unable to load match history.');
      }
    });

    // =========================================================================
    // COMMAND: /settings
    // =========================================================================
    bot.onText(/\/settings(?:@\w+)?/, async (msg) => {
      const settingsUrl = getValidWebAppUrl('?page=settings');
      const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';

      if (settingsUrl) {
        await safeSendMessage(
          msg.chat.id,
          `⚙️ *Ludo Arena Settings*\n\nConfigure sound effects, language, and notification alerts inside the app.`,
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [[{ text: '⚙️ Open Settings', web_app: { url: settingsUrl } }]]
            }
          }
        );
      } else {
        await safeSendMessage(
          msg.chat.id,
          `⚙️ *Ludo Arena Settings*\n\nManage settings in your browser:\n\`${clientUrl}?page=settings\``,
          { parse_mode: 'Markdown' }
        );
      }
    });

    // =========================================================================
    // CALLBACK QUERY HANDLER (In-place Telegram button interactions)
    // =========================================================================
    bot.on('callback_query', async (queryObj) => {
      const data = queryObj.data || '';
      const chatId = queryObj.message?.chat?.id;
      const messageId = queryObj.message?.message_id;
      const fromUser = queryObj.from;

      try {
        // --- 1. How to play callback ---
        if (data === 'how_to_play') {
          await bot.answerCallbackQuery(queryObj.id, { text: 'Opening rules...' });
          return safeSendMessage(
            chatId,
            `📖 *How to Play Ludo Arena:*\n\n` +
            `1. Roll a 6 to release a token from home.\n` +
            `2. Move clockwise around the circuit.\n` +
            `3. Landing on an opponent captures their token!\n` +
            `4. Safe spots (⭐) protect tokens from capture.\n` +
            `5. Guide all 4 tokens into the center to WIN! 🏆`,
            { parse_mode: 'Markdown' }
          );
        }

        // --- 2. Leaderboard callback ---
        if (data === 'group_leaderboard') {
          await bot.answerCallbackQuery(queryObj.id);
          const { leaderboard } = await getLeaderboardUsers({ limit: 5 });
          if (!leaderboard || leaderboard.length === 0) {
            return safeSendMessage(chatId, '🏆 No match records found yet! Use /newgame to play!');
          }
          const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];
          const lines = leaderboard.map((r, i) => `${medals[i]} ${r.username ? '@' + r.username : r.first_name}: ${r.wins} wins`);
          return safeSendMessage(chatId, `🏆 *Top Champions:*\n\n${lines.join('\n')}`, { parse_mode: 'Markdown' });
        }

        // --- 3. View matches callback ---
        if (data === 'group_matches') {
          await bot.answerCallbackQuery(queryObj.id);
          const active = await getPublicMatches();
          if (!active || active.length === 0) {
            return safeSendMessage(chatId, '🎲 No active matches right now. Send /newgame to start one!');
          }
          const list = active.slice(0, 5).map(m => `• *${m.name}* [\`${m.room_code}\`] (${m.current_players}/${m.max_players})`).join('\n');
          return safeSendMessage(chatId, `🎮 *Active Matches:*\n\n${list}`, { parse_mode: 'Markdown' });
        }

        // --- 4. New game shortcut button ---
        if (data === 'new_group_game') {
          await bot.answerCallbackQuery(queryObj.id);
          return handleNewGame(queryObj.message, null);
        }

        // --- 5. Watch match info callback ---
        if (data.startsWith('watch_match:')) {
          const matchId = data.replace('watch_match:', '');
          const match = await getMatchById(matchId);
          await bot.answerCallbackQuery(queryObj.id, { text: 'Viewing match...' });
          const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
          return safeSendMessage(
            chatId,
            `👁 Spectate match \`${match?.room_code || matchId}\` in your browser:\n\`${clientUrl}?join=${match?.room_code || matchId}\``,
            { parse_mode: 'Markdown' }
          );
        }

        // --- 6. Join match callback ---
        if (data.startsWith('join_match:')) {
          const matchId = data.replace('join_match:', '');
          const user = await findOrCreateUser({
            id: fromUser.id,
            username: fromUser.username,
            first_name: fromUser.first_name,
            last_name: fromUser.last_name,
            language_code: fromUser.language_code
          });

          const currentMatch = await getMatchById(matchId);
          if (!currentMatch) {
            return bot.answerCallbackQuery(queryObj.id, { text: 'Match not found.', show_alert: true });
          }

          if (currentMatch.status !== 'waiting') {
            return bot.answerCallbackQuery(queryObj.id, {
              text: `Match is no longer accepting players (${currentMatch.status}).`,
              show_alert: true
            });
          }

          // Check if already in match
          const alreadyIn = currentMatch.players && currentMatch.players.some(p => p.userId === user.id);
          if (alreadyIn) {
            return bot.answerCallbackQuery(queryObj.id, { text: 'You are already in this match!' });
          }

          // Join match
          try {
            await joinMatch(matchId, user.id);
          } catch (joinErr) {
            return bot.answerCallbackQuery(queryObj.id, { text: joinErr.message, show_alert: true });
          }

          await bot.answerCallbackQuery(queryObj.id, { text: '✅ Joined match successfully!' });

          // Update lobby in-place
          const updatedMatch = await getMatchById(matchId);
          const hostName = updatedMatch.creator_username ? `@${updatedMatch.creator_username}` : (updatedMatch.creator_name || 'Host');
          const lobbyText = formatLobbyText(updatedMatch, updatedMatch.players, hostName);
          const replyMarkup = buildLobbyKeyboard(updatedMatch, updatedMatch.players?.length || 1);

          await safeEditMessage(chatId, messageId, lobbyText, {
            parse_mode: 'Markdown',
            reply_markup: replyMarkup
          });
          return;
        }

        // --- 7. Start match callback ---
        if (data.startsWith('start_match:')) {
          const matchId = data.replace('start_match:', '');
          const user = await findOrCreateUser({
            id: fromUser.id,
            username: fromUser.username,
            first_name: fromUser.first_name,
            last_name: fromUser.last_name
          });

          const currentMatch = await getMatchById(matchId);
          if (!currentMatch) {
            return bot.answerCallbackQuery(queryObj.id, { text: 'Match not found.', show_alert: true });
          }

          // Authority check: host or admin
          const isAdmin = isGroupChat(queryObj.message.chat) ? await isGroupAdmin(chatId, fromUser.id) : false;
          if (currentMatch.creator_id !== user.id && !isAdmin) {
            return bot.answerCallbackQuery(queryObj.id, {
              text: '⚠️ Only the host or a group administrator can start this match.',
              show_alert: true
            });
          }

          if (currentMatch.players.length < 2) {
            return bot.answerCallbackQuery(queryObj.id, {
              text: '⚠️ Need at least 2 players to start the match!',
              show_alert: true
            });
          }

          // Start match
          try {
            await startMatch(matchId, currentMatch.creator_id);
          } catch (startErr) {
            return bot.answerCallbackQuery(queryObj.id, { text: startErr.message, show_alert: true });
          }

          await bot.answerCallbackQuery(queryObj.id, { text: '🎲 Match started! Opening game...' });

          // Send or update the group message with the clean Match Ready invitation
          const messageText = formatMatchReadyMessage(currentMatch.players);
          const replyMarkup = buildOpenGameKeyboard(matchId);

          const edited = await safeEditMessage(chatId, messageId, messageText, {
            reply_markup: replyMarkup
          });

          if (!edited) {
            await safeSendMessage(chatId, messageText, {
              reply_markup: replyMarkup
            });
          }
          return;
        }

        // --- 8. Cancel match callback ---
        if (data.startsWith('cancel_match:')) {
          const matchId = data.replace('cancel_match:', '');
          const user = await findOrCreateUser({
            id: fromUser.id,
            username: fromUser.username,
            first_name: fromUser.first_name,
            last_name: fromUser.last_name
          });

          const currentMatch = await getMatchById(matchId);
          if (!currentMatch) {
            return bot.answerCallbackQuery(queryObj.id, { text: 'Match not found.', show_alert: true });
          }

          const isAdmin = isGroupChat(queryObj.message.chat) ? await isGroupAdmin(chatId, fromUser.id) : false;
          if (currentMatch.creator_id !== user.id && !isAdmin) {
            return bot.answerCallbackQuery(queryObj.id, {
              text: '⚠️ Only the host or a group administrator can cancel this match.',
              show_alert: true
            });
          }

          await cancelMatch(matchId, user.id, true);
          await bot.answerCallbackQuery(queryObj.id, { text: 'Match cancelled.' });

          await safeEditMessage(
            chatId,
            messageId,
            `❌ *MATCH CANCELLED*\n\nRoom: \`${currentMatch.room_code}\`\nCancelled by @${fromUser.username || fromUser.first_name}.`,
            { parse_mode: 'Markdown' }
          );
          return;
        }

        // Acknowledge any other callback
        await bot.answerCallbackQuery(queryObj.id).catch(() => {});
      } catch (cbErr) {
        if (!cbErr.message?.includes('query is too old')) {
          console.error('Error handling callback_query:', cbErr.message);
        }
        try {
          await bot.answerCallbackQuery(queryObj.id, { text: 'An error occurred.' }).catch(() => {});
        } catch (e) {}
      }
    });

    console.log('✅ Telegram bot listening and group commands registered');
    return bot;
  } catch (err) {
    console.error('Failed to initialize bot:', err.message);
    return null;
  }
}

// Clean shutdown handlers
process.once('SIGINT', () => { if (bot) bot.stopPolling(); });
process.once('SIGTERM', () => { if (bot) bot.stopPolling(); });

function getBot() {
  return bot;
}

async function sendNotification(telegramId, message, options = {}) {
  if (!bot) return null;
  return await safeSendMessage(telegramId, message, options);
}

module.exports = {
  initializeBot,
  getBot,
  sendNotification,
  isValidHttpsUrl,
  getValidWebAppUrl,
  getMiniAppDirectLink,
  isGroupChat,
  formatLobbyText,
  buildLobbyKeyboard,
  buildGroupWelcomeKeyboard,
  formatMatchReadyMessage,
  buildOpenGameKeyboard,
  safeSendMessage,
  safeEditMessage
};
