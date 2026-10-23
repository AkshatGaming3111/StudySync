const express = require('express');
const router = express.Router();
const marketplaceController = require('../controllers/marketplaceController');
const authMiddleware = require('../middleware/authMiddleware');

// Public listing & search
router.get('/', marketplaceController.listSyllabi);
router.get('/:id', marketplaceController.getSyllabus);

// Authenticated actions (cloning & liking)
router.post('/:id/clone', authMiddleware, marketplaceController.cloneSyllabus);
router.post('/:id/like', authMiddleware, marketplaceController.likeSyllabus);

module.exports = router;
