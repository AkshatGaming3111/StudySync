const express = require('express');
const router = express.Router();
const focusController = require('../controllers/focusController');
const authMiddleware = require('../middleware/authMiddleware');

router.use(authMiddleware);

router.post('/start', focusController.startSession);
router.get('/active', focusController.getActiveSession);
router.post('/session', focusController.logSession);
router.get('/stats', focusController.getFocusStats);
router.get('/companion', focusController.getCompanion);
router.post('/companion/interact', focusController.interactCompanion);
router.get('/wellness', focusController.getWellnessRadar);
router.post('/wellness/hydrate', focusController.logHydration);

module.exports = router;
