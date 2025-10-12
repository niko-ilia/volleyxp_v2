const formData = require('form-data');
const Mailgun = require('mailgun.js');
require('dotenv').config();

const apiKey = process.env.MAILGUN_API_KEY;
const domain = process.env.MAILGUN_DOMAIN;

// Создаем заглушки для локальной разработки
let mg = null;
if (apiKey && domain) {
  const mailgun = new Mailgun(formData);
  mg = mailgun.client({
    username: 'api',
    key: apiKey,
    url: 'https://api.eu.mailgun.net'
  });
}

function sendMail({ to, subject, text, html }) {
  if (!mg) {
    console.log('📧 Mail service not configured, skipping email send');
    return Promise.resolve();
  }
  return mg.messages.create(domain, {
    from: `VolleyXP <noreply@${domain}>`,
    to,
    subject,
    text,
    html,
  });
}

async function sendPasswordResetMail({ to, resetUrl }) {
  if (!mg) {
    console.log('📧 Mail service not configured, skipping password reset email');
    return Promise.resolve();
  }
  return mg.messages.create(domain, {
    from: `VolleyXP <noreply@${domain}>`,
    to,
    subject: 'Восстановление пароля',
    text: `Перейдите по ссылке для сброса пароля: ${resetUrl}`,
    html: `<p>Перейдите по <a href='${resetUrl}'>ссылке</a> для сброса пароля.</p>`
  });
}

module.exports = {
  sendMail,
  sendPasswordResetMail
}; 