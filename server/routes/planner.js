const express = require('express');
const router = express.Router();
const plannerController = require('../controllers/plannerController');
const authMiddleware = require('../middleware/authMiddleware');

const multer = require('multer');
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

router.use(authMiddleware);

router.post('/upload-syllabus', upload.single('file'), plannerController.uploadSyllabus);
router.post('/generate', plannerController.generateAISchedule);
router.get('/tasks', plannerController.getTasks);
router.post('/tasks', plannerController.createTask);
router.put('/tasks/:id', plannerController.updateTask);
router.post('/tasks/:id/reschedule', plannerController.rescheduleTask);
router.delete('/tasks/:id', plannerController.deleteTask);
router.post('/tasks/bulk-complete', plannerController.bulkCompleteTasks);
router.post('/tasks/bulk-delete', plannerController.bulkDeleteTasks);
router.get('/timetable', plannerController.getTimetable);
router.get('/timetable/config', plannerController.getTimetableConfig);
router.post('/timetable/config', plannerController.updateTimetableConfig);
router.get('/rebalance/status', plannerController.getRebalanceStatus);
router.post('/rebalance', plannerController.rebalanceSchedule);

module.exports = router;
