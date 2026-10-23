const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatController');

const authMiddleware = require('../middleware/authMiddleware');

router.post('/', (req, res, next) => {
  // Optional auth middleware pass-through so unauthenticated landing page visitors can still ask basic questions
  if (req.headers.authorization || (req.cookies && req.cookies.token)) {
    return authMiddleware(req, res, next);
  }
  next();
}, chatController.handleChatMessage);

router.post('/set-key', authMiddleware, chatController.setApiKey);
router.get('/history', authMiddleware, chatController.getChatHistory);
router.delete('/history', authMiddleware, chatController.clearChatHistory);

module.exports = router;
