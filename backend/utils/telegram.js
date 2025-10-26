const axios = require('axios');

async function sendTelegramMessage({ chatId, text, parseMode }) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('Missing TELEGRAM_BOT_TOKEN');
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const payload = { chat_id: chatId, text, parse_mode: parseMode };
  await axios.post(url, payload);
}

module.exports = { sendTelegramMessage };

// Low-level Telegram Bot API helpers used by channel verification
async function botGetChat(chatIdOrUsername) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('Missing TELEGRAM_BOT_TOKEN');
  const base = `https://api.telegram.org/bot${token}`;
  const res = await axios.get(`${base}/getChat`, { params: { chat_id: chatIdOrUsername } });
  return res.data?.result;
}

async function botGetChatMember(chatId, userId) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('Missing TELEGRAM_BOT_TOKEN');
  const base = `https://api.telegram.org/bot${token}`;
  const res = await axios.get(`${base}/getChatMember`, { params: { chat_id: chatId, user_id: userId } });
  return res.data?.result;
}

async function getMe() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('Missing TELEGRAM_BOT_TOKEN');
  const res = await axios.get(`https://api.telegram.org/bot${token}/getMe`);
  return res.data?.result; // { id, username, ... }
}

async function isBotInChat(chatIdOrUsername) {
  const me = await getMe();
  const chat = await botGetChat(chatIdOrUsername);
  const member = await botGetChatMember(chat.id, me.id);
  const status = member?.status; // administrator|member|left|kicked|restricted
  return status === 'administrator' || status === 'member' || status === 'creator';
}

module.exports.botGetChat = botGetChat;
module.exports.botGetChatMember = botGetChatMember;
module.exports.getMe = getMe;
module.exports.isBotInChat = isBotInChat;


