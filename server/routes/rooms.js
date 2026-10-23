const express = require('express');
const router = express.Router();
const roomController = require('../controllers/roomController');
const authMiddleware = require('../middleware/authMiddleware');

router.get('/', roomController.listRooms);
router.get('/:id/members', roomController.getRoomMembers);

router.post('/:id/join', authMiddleware, roomController.joinRoom);
router.post('/:id/heartbeat', authMiddleware, roomController.heartbeat);
router.post('/:id/leave', authMiddleware, roomController.leaveRoom);

module.exports = router;
