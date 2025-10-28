const User = require('../models/User');
const { sendTelegramMessage, answerCallbackQuery } = require('../utils/telegram');
const Match = require('../models/Match');

// Проверка секретного токена вебхука (simple shared secret)
function assertWebhookSecret(req) {
  const expected = process.env.TG_WEBHOOK_SECRET;
  if (!expected) return true; // если не настроен — пропускаем в dev
  const got = req.headers['x-telegram-secret']
    || req.headers['x-telegram-bot-api-secret-token']
    || req.query.secret
    || req.body?.secret;
  return Boolean(got && got === expected);
}

// POST /api/telegram/webhook — стандартный Telegram webhook update
// Мы используем его, чтобы сохранять chat_id и language_code пользователя
async function webhook(req, res) {
  try {
    if (!assertWebhookSecret(req)) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    const update = req.body || {};
    const message = update.message || update.edited_message || null;
    const membership = update.my_chat_member || update.chat_member || null;
    const source = message || membership || null;
    if (!source) return res.json({ ok: true });

    const from = source.from || null;
    const chat = source.chat || null;
    const chatId = String((chat && chat.id) || (from && from.id) || '');
    if (!from || !chatId) return res.json({ ok: true });

    const telegramId = typeof from.id === 'string' ? Number(from.id) : from.id;
    const language = from.language_code;
    const username = from.username;

    if (telegramId) {
      const user = await User.findOne({ telegramId });
      if (user) {
        let changed = false;
        if (!user.telegramChatId || user.telegramChatId !== chatId) {
          user.telegramChatId = chatId;
          changed = true;
        }
        if (language && user.telegramLanguage !== language) {
          user.telegramLanguage = language;
          changed = true;
        }
        if (username && user.telegramUsername !== username) {
          user.telegramUsername = username;
          changed = true;
        }
        if (changed) await user.save();
      }
    }

    // Ответ на /start
    if (message && typeof message.text === 'string' && /\b\/start\b/i.test(message.text)) {
      try {
        await sendTelegramMessage({ chatId, text: '✅ Telegram connected. You will receive notifications here.' });
      } catch (_) {}
    }

    // Handle Inline "Join match" callback
    if (update.callback_query && update.callback_query.data) {
      const cb = update.callback_query;
      const data = String(cb.data || '');
      if (data.startsWith('join:')) {
        const matchId = data.split(':')[1];
        try {
          const user = await User.findOne({ telegramId: from.id });
          if (!user) {
            await answerCallbackQuery({ callbackQueryId: cb.id, text: 'Link your Telegram in profile first', showAlert: true });
            return res.json({ ok: true });
          }
          const match = await Match.findById(matchId);
          if (!match) {
            await answerCallbackQuery({ callbackQueryId: cb.id, text: 'Match not found', showAlert: true });
            return res.json({ ok: true });
          }
          if (match.participants.some(p => String(p) === String(user._id))) {
            await answerCallbackQuery({ callbackQueryId: cb.id, text: 'Already joined' });
            return res.json({ ok: true });
          }
          const now = new Date();
          const joinDeadline = new Date(new Date(match.startDateTime).getTime() + 12 * 60 * 60 * 1000);
          if (now > joinDeadline) {
            await answerCallbackQuery({ callbackQueryId: cb.id, text: 'Too late for join', showAlert: true });
            return res.json({ ok: true });
          }
          if (Array.isArray(match.participants) && match.participants.length >= match.maxParticipants) {
            await answerCallbackQuery({ callbackQueryId: cb.id, text: 'Match full', showAlert: true });
            return res.json({ ok: true });
          }
          match.participants.push(user._id);
          match.joinSnapshots = match.joinSnapshots || [];
          match.joinSnapshots.push({ userId: user._id, rating: user.rating });
          await match.save();
          await answerCallbackQuery({ callbackQueryId: cb.id, text: 'Joined!' });
          return res.json({ ok: true });
        } catch (e) {
          await answerCallbackQuery({ callbackQueryId: cb.id, text: 'Error', showAlert: true });
          return res.json({ ok: true });
        }
      }
    }

    return res.json({ ok: true });
  } catch (e) {
    console.error('Telegram webhook error:', e);
    return res.status(200).json({ ok: true });
  }
}

module.exports = { webhook };


