const express = require('express');
const router = express.Router();
const screentimeController = require('../controllers/screentimeController');
const authMiddleware = require('../middleware/authMiddleware');

router.use(authMiddleware);

router.get('/', screentimeController.getLogsAndLimits);
router.post('/log', screentimeController.logScreentime);
router.post('/telemetry', screentimeController.logTelemetry);
router.delete('/log/:id', screentimeController.deleteLog);
router.post('/limits', screentimeController.setLimits);

module.exports = router;
