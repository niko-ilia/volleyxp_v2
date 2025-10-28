const express = require('express');
const router = express.Router();
const telegramController = require('../controllers/telegramController');

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

module.exports = router;


