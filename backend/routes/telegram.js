const express = require('express');
const router = express.Router();
const telegramController = require('../controllers/telegramController');

// Trace hits to this router for debugging
router.use((req, _res, next) => {
  try {
    console.log('[TG] router hit', req.method, req.originalUrl, req.headers['content-type'] || '');
  } catch {}
  next();
});

// Telegram webhook endpoint (no auth)
router.post('/webhook', telegramController.webhook);

// Helpful diagnostics for wrong method to the same path
router.all('/webhook', (req, res) => {
  return res.status(405).json({
    code: 'METHOD_NOT_ALLOWED',
    message: 'Use POST with JSON body (Telegram update) at this endpoint',
    method: req.method,
  });
});

// Simple readiness/debug probe to confirm router is mounted in prod
router.get('/__debug', (req, res) => {
  res.json({ ok: true, where: 'telegram-router', ts: new Date().toISOString() });
});

module.exports = router;


