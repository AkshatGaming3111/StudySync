const { dbAll, dbRun, dbGet } = require('../config/db');
const { calculateStudentProgress, getOrUpdateUserStreak } = require('../config/gamification');

// Algorithmic Fallback Schedule Generator (When no GEMINI_API_KEY is configured)
function generateAlgorithmicSchedule(syllabusText, examDateStr, dailyHours, userId) {
  const today = new Date();
  const examDate = new Date(examDateStr);
  const diffTime = examDate - today;
  const daysAvailable = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));

  // Parse topics from syllabus text
  let rawLines = syllabusText
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0 && !line.startsWith('#'));

  if (rawLines.length === 0) {
    rawLines = ['Core Concepts Review', 'Practice Problems & Exercises', 'Mock Test & Formula Review'];
  }

  const tasks = [];
  const dailyCapacityMinutes = Math.min(600, Math.max(30, (dailyHours || 3) * 60));

  // Determine subjects or infer from text
  const topicsList = [];
  rawLines.forEach(line => {
    // Check if line contains a subject header like "Math: Calculus"
    if (line.includes(':')) {
      const parts = line.split(':');
      const subject = parts[0].trim();
      const topic = parts.slice(1).join(':').trim();
      topicsList.push({ subject, topic });
    } else {
      topicsList.push({ subject: 'General Study', topic: line.replace(/^[-*•\d.]+\s*/, '') });
    }
  });

  // Expand topics across available days
  let currentTopicIdx = 0;
  const totalTopics = topicsList.length;

  for (let dayOffset = 0; dayOffset < daysAvailable; dayOffset++) {
    const targetDate = new Date(today);
    targetDate.setDate(today.getDate() + dayOffset);
    const dateStr = targetDate.toISOString().split('T')[0];

    let minutesAllocatedToday = 0;

    while (minutesAllocatedToday < dailyCapacityMinutes && currentTopicIdx < totalTopics * 2) {
      const topicItem = topicsList[currentTopicIdx % totalTopics];
      const isRevision = currentTopicIdx >= totalTopics;

      const duration = isRevision ? 45 : 60;
      const title = isRevision
        ? `Revision & Practice: ${topicItem.topic}`
        : `Deep Study: ${topicItem.topic}`;
      
      const priority = isRevision ? 'Medium' : (dayOffset < Math.ceil(daysAvailable / 2) ? 'High' : 'Medium');

      tasks.push({
        user_id: userId,
        title,
        subject: topicItem.subject,
        date: dateStr,
        duration_minutes: duration,
        priority,
        completed: 0,
        ai_generated: 1
      });

      minutesAllocatedToday += duration;
      currentTopicIdx++;
    }

    // Always add a quick wrap-up task if close to exam date
    if (dayOffset === daysAvailable - 1) {
      tasks.push({
        user_id: userId,
        title: 'Final Exam Preparation & Quick Review',
        subject: 'Final Review',
        date: dateStr,
        duration_minutes: 60,
        priority: 'High',
        completed: 0,
        ai_generated: 1
      });
    }
  }

  return tasks;
}

// Upload & Parse Syllabus Document (PDF or Text)
exports.uploadSyllabus = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Please attach a PDF or TXT syllabus file.' });
    }

    const fileBuffer = req.file.buffer;
    const fileName = req.file.originalname || '';
    let extractedText = '';

    if (fileName.toLowerCase().endsWith('.pdf') || req.file.mimetype === 'application/pdf') {
      try {
        const pdfModule = require('pdf-parse');
        const uint8Data = new Uint8Array(fileBuffer);
        if (typeof pdfModule === 'function') {
          const pdfData = await pdfModule(fileBuffer);
          extractedText = pdfData.text || '';
        } else if (pdfModule.PDFParse) {
          const parser = new pdfModule.PDFParse(uint8Data);
          if (typeof parser.load === 'function') await parser.load();
          const pdfData = typeof parser.getText === 'function' ? await parser.getText() : '';
          extractedText = typeof pdfData === 'string' ? pdfData : (pdfData.text || '');
        }
      } catch (pdfErr) {
        console.warn('pdf-parse primary parser error, using regex stream fallback:', pdfErr.message);
        const rawStr = fileBuffer.toString('latin1');
        const matches = rawStr.match(/[A-Za-z0-9\s:.,\-\(\)]{4,}/g) || [];
        extractedText = matches.filter(s => s.trim().length > 3).join('\n');
      }
    } else {
      extractedText = fileBuffer.toString('utf8');
    }

    // Clean up whitespace
    extractedText = extractedText.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

    if (!extractedText) {
      return res.status(422).json({ success: false, message: 'Could not extract readable text from the uploaded syllabus file.' });
    }

    res.status(200).json({
      success: true,
      message: `Successfully extracted syllabus text from ${fileName}`,
      fileName,
      charCount: extractedText.length,
      syllabusText: extractedText
    });
  } catch (err) {
    console.error('Upload Syllabus Error:', err);
    res.status(500).json({ success: false, message: 'Failed to process syllabus document: ' + err.message });
  }
};

// Generate AI Schedule using Gemini REST API or Fallback
exports.generateAISchedule = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { syllabus, examDate, dailyHours } = req.body;

    if (!syllabus || !examDate) {
      return res.status(400).json({
        success: false,
        message: 'Syllabus content and target exam date are required.'
      });
    }

    if (dailyHours) {
      const existingConfig = await dbGet('SELECT * FROM user_timetable_config WHERE user_id = ?', [userId]);
      if (existingConfig) {
        await dbRun('UPDATE user_timetable_config SET max_daily_study_hours = ? WHERE user_id = ?', [Number(dailyHours), userId]);
      } else {
        await dbRun('INSERT INTO user_timetable_config (user_id, max_daily_study_hours) VALUES (?, ?)', [userId, Number(dailyHours)]);
      }
    }

    // Priority: User's stored API Key -> Payload Key -> Environment Key
    let apiKey = '';
    const userRow = await dbGet('SELECT gemini_api_key FROM users WHERE id = ?', [userId]);
    if (userRow && userRow.gemini_api_key) {
      apiKey = userRow.gemini_api_key;
    }
    if (!apiKey) {
      const rawKey = req.body.apiKey || process.env.GEMINI_API_KEY;
      apiKey = (rawKey || '').trim().replace(/^["']|["']$/g, '');
    }

    let generatedTasks = [];
    let isGeminiUsed = false;
    let modelUsed = null;

    if (apiKey) {
      const models = [
        'gemini-3-flash-preview',
        'gemini-3.8-flash',
        'gemini-3.5-flash',
        'gemini-3.1-flash-lite',
        'gemini-flash-latest',
        'gemini-2.5-flash',
        'gemini-2.0-flash',
        'gemini-1.5-flash'
      ];
      const prompt = `You are an expert academic planner. Given the following student syllabus, exam date, and daily study hours, generate a structured, realistic day-by-day study task schedule leading up to the exam.
Syllabus / Topics:
${syllabus}

Target Exam Date: ${examDate}
Daily Capacity (Hours): ${dailyHours || 3}
Today's Date: ${new Date().toISOString().split('T')[0]}

Return ONLY a valid JSON array of objects with no markdown codeblocks or extra text. Each object must have these exact keys:
- "title": (string, specific subtopic or task)
- "subject": (string, main subject name)
- "date": (string, YYYY-MM-DD format)
- "duration_minutes": (number, e.g. 30, 45, 60, 90)
- "priority": (string, "High", "Medium", or "Low")`;

      for (const model of models) {
        try {
          const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }]
            }),
            signal: AbortSignal.timeout(25000)
          });

          if (response.ok) {
            const data = await response.json();
            const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
            const jsonMatch = rawText.match(/\[\s*\{[\s\S]*\}\s*\]/);
            const cleanedJson = jsonMatch ? jsonMatch[0] : rawText.replace(/```json/g, '').replace(/```/g, '').trim();
            const parsedTasks = JSON.parse(cleanedJson);

            if (Array.isArray(parsedTasks) && parsedTasks.length > 0) {
              const todayStr = new Date().toISOString().split('T')[0];
              generatedTasks = parsedTasks.map(t => {
                let taskDate = t.date;
                if (!taskDate || isNaN(new Date(taskDate).getTime())) {
                  taskDate = todayStr;
                }
                return {
                  user_id: userId,
                  title: t.title || 'Study Task',
                  subject: t.subject || 'General',
                  date: taskDate,
                  duration_minutes: Number(t.duration_minutes) || 45,
                  priority: (t.priority && ['High', 'Medium', 'Low'].includes(t.priority)) ? t.priority : 'Medium',
                  completed: 0,
                  ai_generated: 1
                };
              });
              isGeminiUsed = true;
              modelUsed = model;
              break; // Success!
            }
          }
        } catch (aiErr) {
          console.warn(`Gemini schedule generation with ${model} failed:`, aiErr.message);
        }
      }
    }

    if (generatedTasks.length === 0) {
      generatedTasks = generateAlgorithmicSchedule(syllabus, examDate, dailyHours, userId);
    }

    // Save tasks to database
    const insertedTasks = [];
    for (const task of generatedTasks) {
      const result = await dbRun(
        'INSERT INTO tasks (user_id, title, subject, date, duration_minutes, priority, completed, ai_generated) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [userId, task.title, task.subject, task.date, task.duration_minutes, task.priority, 0, 1]
      );
      insertedTasks.push({ id: result.lastID, ...task });
    }

    res.status(201).json({
      success: true,
      message: `Successfully generated ${insertedTasks.length} study tasks!`,
      count: insertedTasks.length,
      tasks: insertedTasks,
      isGemini: isGeminiUsed,
      model: modelUsed
    });
  } catch (err) {
    console.error('Generate AI Schedule Error:', err);
    res.status(500).json({ success: false, message: 'Failed to generate study schedule.' });
  }
};

// Bulk Complete Tasks
exports.bulkCompleteTasks = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { taskIds } = req.body;

    if (!Array.isArray(taskIds) || taskIds.length === 0) {
      return res.status(400).json({ success: false, message: 'taskIds array is required.' });
    }

    const placeholders = taskIds.map(() => '?').join(',');
    await dbRun(`UPDATE tasks SET completed = 1 WHERE user_id = ? AND id IN (${placeholders})`, [userId, ...taskIds]);

    res.status(200).json({ success: true, message: `Completed ${taskIds.length} tasks successfully.` });
  } catch (err) {
    console.error('Bulk Complete Tasks Error:', err);
    res.status(500).json({ success: false, message: 'Failed to bulk complete tasks.' });
  }
};

// Bulk Delete Tasks
exports.bulkDeleteTasks = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { taskIds } = req.body;

    if (!Array.isArray(taskIds) || taskIds.length === 0) {
      return res.status(400).json({ success: false, message: 'taskIds array is required.' });
    }

    const placeholders = taskIds.map(() => '?').join(',');
    await dbRun(`DELETE FROM tasks WHERE user_id = ? AND id IN (${placeholders})`, [userId, ...taskIds]);

    res.status(200).json({ success: true, message: `Deleted ${taskIds.length} tasks successfully.` });
  } catch (err) {
    console.error('Bulk Delete Tasks Error:', err);
    res.status(500).json({ success: false, message: 'Failed to bulk delete tasks.' });
  }
};

// Get all tasks for user
exports.getTasks = async (req, res) => {
  try {
    const userId = req.user.userId;
    const tasks = await dbAll(
      'SELECT * FROM tasks WHERE user_id = ? ORDER BY date ASC, priority DESC',
      [userId]
    );

    res.status(200).json({
      success: true,
      count: tasks.length,
      tasks
    });
  } catch (err) {
    console.error('Get Tasks Error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch tasks.' });
  }
};

// Create a custom task
exports.createTask = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { title, subject, date, duration_minutes, priority } = req.body;

    if (!title || !subject || !date) {
      return res.status(400).json({ success: false, message: 'Title, subject, and date are required.' });
    }

    const result = await dbRun(
      'INSERT INTO tasks (user_id, title, subject, date, duration_minutes, priority, completed, ai_generated) VALUES (?, ?, ?, ?, ?, ?, 0, 0)',
      [userId, title, subject, date, duration_minutes || 30, priority || 'Medium']
    );

    const newTask = await dbGet('SELECT * FROM tasks WHERE id = ?', [result.lastID]);

    res.status(201).json({
      success: true,
      message: 'Task created successfully.',
      task: newTask
    });
  } catch (err) {
    console.error('Create Task Error:', err);
    res.status(500).json({ success: false, message: 'Failed to create task.' });
  }
};

// Accurate Date Helper (Immune to UTC / Local timezone drift)
function addDaysToDateStr(dateStr, days) {
  if (!dateStr) return dateStr;
  const [y, m, d] = dateStr.split('-').map(Number);
  const dateObj = new Date(y, m - 1, d);
  dateObj.setDate(dateObj.getDate() + Number(days));
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Update task completion or content
exports.updateTask = async (req, res) => {
  try {
    const userId = req.user.userId;
    const taskId = req.params.id;
    const { completed, title, subject, priority, duration_minutes, date, extend_minutes, push_days } = req.body;

    const existingTask = await dbGet('SELECT * FROM tasks WHERE id = ? AND user_id = ?', [taskId, userId]);
    if (!existingTask) {
      return res.status(404).json({ success: false, message: 'Task not found.' });
    }

    const newCompleted = completed !== undefined ? (completed ? 1 : 0) : existingTask.completed;
    const newTitle = title || existingTask.title;
    const newSubject = subject || existingTask.subject;
    const newPriority = priority || existingTask.priority;

    let newDuration = existingTask.duration_minutes;
    if (duration_minutes !== undefined) {
      newDuration = Number(duration_minutes);
    } else if (extend_minutes) {
      newDuration = Number(existingTask.duration_minutes) + Number(extend_minutes);
    }

    let newDate = date;
    if (push_days) {
      newDate = addDaysToDateStr(existingTask.date, push_days);
    }
    if (!newDate) newDate = existingTask.date;

    const isRebalanced = (newDate !== existingTask.date) ? 1 : existingTask.is_rebalanced;
    const originalDate = existingTask.original_date || ((newDate !== existingTask.date) ? existingTask.date : null);

    await dbRun(
      'UPDATE tasks SET completed = ?, title = ?, subject = ?, priority = ?, duration_minutes = ?, date = ?, is_rebalanced = ?, original_date = ? WHERE id = ? AND user_id = ?',
      [newCompleted, newTitle, newSubject, newPriority, newDuration, newDate, isRebalanced, originalDate, taskId, userId]
    );

    // If task was newly completed, reward user XP based on priority!
    let xpGained = 0;
    let streak = 0;

    if (existingTask.completed === 0 && newCompleted === 1) {
      const taskPriority = newPriority || existingTask.priority || 'Medium';
      if (taskPriority === 'High') {
        xpGained = 150;
      } else if (taskPriority === 'Medium') {
        xpGained = 100;
      } else {
        xpGained = 50; // Low priority
      }

      const stats = await dbGet('SELECT * FROM user_stats WHERE user_id = ?', [userId]) || { xp_points: 0 };
      const newXP = (stats.xp_points || 0) + xpGained;
      const g = calculateStudentProgress(newXP);

      await dbRun(
        'UPDATE user_stats SET xp_points = ?, level = ? WHERE user_id = ?',
        [newXP, g.level, userId]
      );

      // Update student daily streak!
      streak = await getOrUpdateUserStreak(userId, true);
    } else {
      streak = await getOrUpdateUserStreak(userId, false);
    }

    const updatedTask = await dbGet('SELECT * FROM tasks WHERE id = ?', [taskId]);
    const userStats = await dbGet('SELECT * FROM user_stats WHERE user_id = ?', [userId]);
    const gamification = calculateStudentProgress(userStats?.xp_points || 0);

    res.status(200).json({
      success: true,
      message: newCompleted ? 'Task marked completed!' : 'Task updated successfully.',
      task: updatedTask,
      xpGained,
      streak,
      stats: userStats,
      gamification
    });
  } catch (err) {
    console.error('Update Task Error:', err);
    res.status(500).json({ success: false, message: 'Failed to update task.' });
  }
};

// Reschedule or Extend Study Task Directly
exports.rescheduleTask = async (req, res) => {
  try {
    const userId = req.user.userId;
    const taskId = req.params.id;
    const { newDate, pushDays, extendMinutes } = req.body;

    const task = await dbGet('SELECT * FROM tasks WHERE id = ? AND user_id = ?', [taskId, userId]);
    if (!task) {
      return res.status(404).json({ success: false, message: 'Task not found.' });
    }

    let finalDate = task.date;
    if (newDate) {
      finalDate = newDate;
    } else if (pushDays) {
      finalDate = addDaysToDateStr(task.date, pushDays);
    }

    let finalDuration = task.duration_minutes;
    if (extendMinutes) {
      finalDuration = Math.max(15, Math.min(360, Number(task.duration_minutes) + Number(extendMinutes)));
    }

    const isShifted = finalDate !== task.date;
    const originalDate = task.original_date || (isShifted ? task.date : null);

    await dbRun(
      'UPDATE tasks SET date = ?, duration_minutes = ?, is_rebalanced = ?, original_date = ? WHERE id = ? AND user_id = ?',
      [finalDate, finalDuration, isShifted ? 1 : task.is_rebalanced, originalDate, taskId, userId]
    );

    const updated = await dbGet('SELECT * FROM tasks WHERE id = ?', [taskId]);

    res.status(200).json({
      success: true,
      message: isShifted
        ? `Task rescheduled to ${finalDate}.`
        : `Task duration extended to ${finalDuration} mins.`,
      task: updated
    });
  } catch (err) {
    console.error('Reschedule Task Error:', err);
    res.status(500).json({ success: false, message: 'Failed to reschedule task: ' + err.message });
  }
};

// Delete task
exports.deleteTask = async (req, res) => {
  try {
    const userId = req.user.userId;
    const taskId = req.params.id;

    const result = await dbRun('DELETE FROM tasks WHERE id = ? AND user_id = ?', [taskId, userId]);

    if (result.changes === 0) {
      return res.status(404).json({ success: false, message: 'Task not found or unauthorized.' });
    }

    res.status(200).json({
      success: true,
      message: 'Task deleted successfully.'
    });
  } catch (err) {
    console.error('Delete Task Error:', err);
    res.status(500).json({ success: false, message: 'Failed to delete task.' });
  }
};

// Helper function to convert HH:MM to minutes
function timeToMins(timeStr) {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

// Helper function to convert minutes to HH:MM AM/PM
function minsToTimeStr(mins) {
  let h = Math.floor(mins / 60) % 24;
  let m = mins % 60;
  const ampm = h >= 12 ? 'PM' : 'AM';
  let displayH = h % 12;
  if (displayH === 0) displayH = 12;
  const displayM = m < 10 ? `0${m}` : `${m}`;
  return `${displayH}:${displayM} ${ampm}`;
}

// Generate Daily Timetable Algorithm
function generateDailyTimetable(config, tasks, todayStr) {
  const schoolStart = timeToMins(config.school_start || '08:00');
  const schoolEnd = timeToMins(config.school_end || '14:00');
  const lunchStart = timeToMins(config.lunch_start || '14:00');
  const lunchEnd = timeToMins(config.lunch_end || '14:30');
  const snackStart = timeToMins(config.snack_start || '17:00');
  const snackEnd = timeToMins(config.snack_end || '17:30');
  const dinnerStart = timeToMins(config.dinner_start || '20:30');
  const dinnerEnd = timeToMins(config.dinner_end || '21:15');
  const sleepStart = timeToMins(config.sleep_start || '22:30');
  const shortBreakMins = Number(config.short_break_mins) || 10;
  const maxStudyMins = Math.round((Number(config.max_daily_study_hours) || 3) * 60);

  // Fixed Routine Blocks
  const routineBlocks = [
    { start: schoolStart, end: schoolEnd, type: 'school', title: 'School / College Time', icon: 'graduation-cap' },
    { start: lunchStart, end: lunchEnd, type: 'lunch', title: 'Lunch Break & Refreshment', icon: 'utensils' },
    { start: snackStart, end: snackEnd, type: 'snack', title: 'Snack & Evening Break', icon: 'coffee' },
    { start: dinnerStart, end: dinnerEnd, type: 'dinner', title: 'Dinner Break', icon: 'sandwich' },
    { start: sleepStart, end: 24 * 60, type: 'sleep', title: 'Rest & Sleep', icon: 'moon' }
  ].filter(b => b.start < b.end).sort((a, b) => a.start - b.start);

  const timetable = [];
  const now = new Date();
  const currentMins = now.getHours() * 60 + now.getMinutes();

  // Add routine blocks to timetable
  routineBlocks.forEach(block => {
    if (block.start < sleepStart) {
      timetable.push({
        type: block.type,
        title: block.title,
        subject: 'Routine',
        startMins: block.start,
        endMins: block.end,
        startTime: minsToTimeStr(block.start),
        endTime: minsToTimeStr(block.end),
        duration_minutes: block.end - block.start,
        icon: block.icon,
        isLive: currentMins >= block.start && currentMins < block.end
      });
    }
  });

  // Calculate free study windows between 06:00 AM and sleepStart
  const dayStart = 6 * 60; // 06:00 AM
  const freeWindows = [];
  let ptr = dayStart;

  routineBlocks.forEach(block => {
    if (block.start > ptr && ptr < sleepStart) {
      const windowEnd = Math.min(block.start, sleepStart);
      if (windowEnd > ptr) {
        freeWindows.push({ start: ptr, end: windowEnd });
      }
    }
    ptr = Math.max(ptr, block.end);
  });

  if (ptr < sleepStart) {
    freeWindows.push({ start: ptr, end: sleepStart });
  }

  // Priority mapping
  const priorityScore = { 'High': 3, 'Medium': 2, 'Low': 1 };

  // Smart Sorting:
  // 1. Today's pending tasks (highest priority first)
  // 2. Overdue pending tasks (highest priority first)
  // 3. Today's completed tasks (so they show in schedule as done)
  // 4. Upcoming incomplete tasks (by date then priority)
  const sortedTasks = [...tasks].sort((a, b) => {
    const aIsTodayPending = (a.date === todayStr && !a.completed) ? 1 : 0;
    const bIsTodayPending = (b.date === todayStr && !b.completed) ? 1 : 0;
    if (aIsTodayPending !== bIsTodayPending) return bIsTodayPending - aIsTodayPending;

    const aIsOverdue = (a.date < todayStr && !a.completed) ? 1 : 0;
    const bIsOverdue = (b.date < todayStr && !b.completed) ? 1 : 0;
    if (aIsOverdue !== bIsOverdue) return bIsOverdue - aIsOverdue;

    const aIsTodayDone = (a.date === todayStr && a.completed) ? 1 : 0;
    const bIsTodayDone = (b.date === todayStr && b.completed) ? 1 : 0;
    if (aIsTodayDone !== bIsTodayDone) return bIsTodayDone - aIsTodayDone;

    const prioDiff = (priorityScore[b.priority] || 2) - (priorityScore[a.priority] || 2);
    if (prioDiff !== 0) return prioDiff;

    return (a.date || '').localeCompare(b.date || '') || a.id - b.id;
  });

  let taskIdx = 0;
  let totalAllocatedStudyMins = 0;

  for (const win of freeWindows) {
    let curr = win.start;
    while (curr < win.end && taskIdx < sortedTasks.length) {
      if (totalAllocatedStudyMins >= maxStudyMins) {
        break;
      }

      const task = sortedTasks[taskIdx];
      const taskDuration = Number(task.duration_minutes) || 45;
      const remainingWindowMins = win.end - curr;
      const remainingDailyCapacity = maxStudyMins - totalAllocatedStudyMins;

      let allocableDuration = Math.min(taskDuration, remainingDailyCapacity);

      if (allocableDuration > remainingWindowMins) {
        if (remainingWindowMins >= 20) {
          allocableDuration = remainingWindowMins;
        } else {
          // Less than 20 mins remaining in this window; advance to next window
          break;
        }
      }

      if (allocableDuration > 0 && curr + allocableDuration <= win.end) {
        const slotEnd = curr + allocableDuration;
        const isUpcoming = task.date > todayStr;
        const isOverdue = task.date < todayStr && !task.completed;

        let displaySubject = task.subject;
        if (isOverdue) displaySubject = `${task.subject} (Overdue Catch-Up)`;
        else if (isUpcoming) displaySubject = `${task.subject} (Upcoming: ${task.date})`;

        timetable.push({
          type: 'study',
          taskId: task.id,
          title: task.title,
          subject: displaySubject,
          rawSubject: task.subject,
          priority: task.priority,
          completed: !!task.completed,
          taskDate: task.date,
          isToday: task.date === todayStr,
          isOverdue,
          isUpcoming,
          startMins: curr,
          endMins: slotEnd,
          startTime: minsToTimeStr(curr),
          endTime: minsToTimeStr(slotEnd),
          duration_minutes: allocableDuration,
          icon: task.completed ? 'check-circle' : 'book-open',
          isLive: currentMins >= curr && currentMins < slotEnd
        });

        curr = slotEnd;
        totalAllocatedStudyMins += allocableDuration;
        taskIdx++;

        // Insert Short Break if window still has time and more study tasks remain
        if (curr + shortBreakMins <= win.end && taskIdx < sortedTasks.length && totalAllocatedStudyMins < maxStudyMins) {
          const breakEnd = curr + shortBreakMins;
          timetable.push({
            type: 'break',
            title: 'Short Study Break & Hydration',
            subject: 'Break',
            startMins: curr,
            endMins: breakEnd,
            startTime: minsToTimeStr(curr),
            endTime: minsToTimeStr(breakEnd),
            duration_minutes: shortBreakMins,
            icon: 'cup-soda',
            isLive: currentMins >= curr && currentMins < breakEnd
          });
          curr = breakEnd;
        }
      } else {
        break;
      }
    }
  }

  return timetable.sort((a, b) => a.startMins - b.startMins);
}

// Get User Timetable Config
exports.getTimetableConfig = async (req, res) => {
  try {
    const userId = req.user.userId;
    let config = await dbGet('SELECT * FROM user_timetable_config WHERE user_id = ?', [userId]);

    if (!config) {
      await dbRun('INSERT INTO user_timetable_config (user_id) VALUES (?)', [userId]);
      config = await dbGet('SELECT * FROM user_timetable_config WHERE user_id = ?', [userId]);
    }

    res.status(200).json({ success: true, config });
  } catch (err) {
    console.error('Get Timetable Config Error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch timetable config.' });
  }
};

// Update User Timetable Config
exports.updateTimetableConfig = async (req, res) => {
  try {
    const userId = req.user.userId;
    const {
      school_start, school_end,
      lunch_start, lunch_end,
      snack_start, snack_end,
      dinner_start, dinner_end,
      sleep_start, short_break_mins, max_daily_study_hours
    } = req.body;

    let config = await dbGet('SELECT * FROM user_timetable_config WHERE user_id = ?', [userId]);

    if (!config) {
      await dbRun(
        `INSERT INTO user_timetable_config (
          user_id, school_start, school_end, lunch_start, lunch_end,
          snack_start, snack_end, dinner_start, dinner_end, sleep_start, short_break_mins, max_daily_study_hours
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          userId,
          school_start || '08:00', school_end || '14:00',
          lunch_start || '14:00', lunch_end || '14:30',
          snack_start || '17:00', snack_end || '17:30',
          dinner_start || '20:30', dinner_end || '21:15',
          sleep_start || '22:30', short_break_mins || 10,
          max_daily_study_hours || 3
        ]
      );
    } else {
      await dbRun(
        `UPDATE user_timetable_config SET
          school_start = ?, school_end = ?,
          lunch_start = ?, lunch_end = ?,
          snack_start = ?, snack_end = ?,
          dinner_start = ?, dinner_end = ?,
          sleep_start = ?, short_break_mins = ?,
          max_daily_study_hours = ?
        WHERE user_id = ?`,
        [
          school_start || config.school_start, school_end || config.school_end,
          lunch_start || config.lunch_start, lunch_end || config.lunch_end,
          snack_start || config.snack_start, snack_end || config.snack_end,
          dinner_start || config.dinner_start, dinner_end || config.dinner_end,
          sleep_start || config.sleep_start, short_break_mins || config.short_break_mins,
          max_daily_study_hours !== undefined ? max_daily_study_hours : config.max_daily_study_hours,
          userId
        ]
      );
    }

    const updatedConfig = await dbGet('SELECT * FROM user_timetable_config WHERE user_id = ?', [userId]);

    res.status(200).json({
      success: true,
      message: 'Timetable routine updated successfully.',
      config: updatedConfig
    });
  } catch (err) {
    console.error('Update Timetable Config Error:', err);
    res.status(500).json({ success: false, message: 'Failed to update timetable config.' });
  }
};

// Get Daily Timetable
exports.getTimetable = async (req, res) => {
  try {
    const userId = req.user.userId;
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    // Fetch user routine config
    let config = await dbGet('SELECT * FROM user_timetable_config WHERE user_id = ?', [userId]);
    if (!config) {
      await dbRun('INSERT INTO user_timetable_config (user_id) VALUES (?)', [userId]);
      config = await dbGet('SELECT * FROM user_timetable_config WHERE user_id = ?', [userId]);
    }

    // 1. Fetch ALL tasks scheduled for today (both completed and pending)
    const todayTasks = await dbAll(
      `SELECT * FROM tasks 
       WHERE user_id = ? AND date = ? 
       ORDER BY completed ASC, CASE WHEN priority = 'High' THEN 1 WHEN priority = 'Medium' THEN 2 ELSE 3 END, id ASC`,
      [userId, todayStr]
    );

    // 2. Fetch overdue incomplete tasks from past dates
    const overdueTasks = await dbAll(
      `SELECT * FROM tasks 
       WHERE user_id = ? AND completed = 0 AND date < ? 
       ORDER BY CASE WHEN priority = 'High' THEN 1 WHEN priority = 'Medium' THEN 2 ELSE 3 END, date ASC, id ASC`,
      [userId, todayStr]
    );

    // 3. Fetch upcoming incomplete tasks
    const upcomingTasks = await dbAll(
      `SELECT * FROM tasks 
       WHERE user_id = ? AND completed = 0 AND date > ? 
       ORDER BY date ASC, CASE WHEN priority = 'High' THEN 1 WHEN priority = 'Medium' THEN 2 ELSE 3 END, id ASC
       LIMIT 10`,
      [userId, todayStr]
    );

    // Candidate tasks prioritizing today's tasks
    const candidateTasks = [...todayTasks, ...overdueTasks, ...upcomingTasks];

    const timetable = generateDailyTimetable(config, candidateTasks, todayStr);

    const studySlots = timetable.filter(s => s.type === 'study');
    const todayStudySlots = studySlots.filter(s => s.isToday);
    const completedStudySlots = studySlots.filter(s => s.completed);
    const allTodayCompleted = todayTasks.length > 0 && todayTasks.every(t => t.completed === 1);

    res.status(200).json({
      success: true,
      date: todayStr,
      config,
      timetable,
      stats: {
        totalStudySlots: studySlots.length,
        completedStudySlots: completedStudySlots.length,
        pendingStudySlots: studySlots.length - completedStudySlots.length,
        todayTasksCount: todayTasks.length,
        todayCompletedCount: todayTasks.filter(t => t.completed === 1).length,
        overdueCount: overdueTasks.length,
        allTodayCompleted
      }
    });
  } catch (err) {
    console.error('Get Timetable Error:', err);
    res.status(500).json({ success: false, message: 'Failed to generate timetable.' });
  }
};

// Get Rebalancing Status & Deficit Analysis
exports.getRebalanceStatus = async (req, res) => {
  try {
    const userId = req.user.userId;
    const todayStr = new Date().toISOString().split('T')[0];

    // Fetch user timetable config
    const config = await dbGet('SELECT * FROM user_timetable_config WHERE user_id = ?', [userId]) || {};
    const maxDailyHours = Number(config.max_daily_study_hours) || 3;

    // Fetch overdue incomplete tasks
    const overdueTasks = await dbAll(
      `SELECT * FROM tasks 
       WHERE user_id = ? AND completed = 0 AND date < ? 
       ORDER BY date ASC, priority DESC`,
      [userId, todayStr]
    );

    // Fetch all pending tasks
    const pendingTasks = await dbAll(
      `SELECT * FROM tasks 
       WHERE user_id = ? AND completed = 0 
       ORDER BY date ASC, priority DESC`,
      [userId]
    );

    const overdueCount = overdueTasks.length;
    const overdueMinutes = overdueTasks.reduce((acc, t) => acc + (Number(t.duration_minutes) || 45), 0);
    const totalPendingMinutes = pendingTasks.reduce((acc, t) => acc + (Number(t.duration_minutes) || 45), 0);

    // Determine target exam date
    let targetExamDate = config.target_exam_date;
    if (!targetExamDate) {
      const validDates = pendingTasks.map(t => t.date).filter(d => d >= todayStr);
      if (validDates.length > 0) {
        validDates.sort();
        targetExamDate = validDates[validDates.length - 1];
      } else {
        const defaultDate = new Date();
        defaultDate.setDate(defaultDate.getDate() + 14);
        targetExamDate = defaultDate.toISOString().split('T')[0];
      }
    }

    // Days until exam
    const todayDateObj = new Date(todayStr + 'T00:00:00Z');
    const examDateObj = new Date(targetExamDate + 'T00:00:00Z');
    const diffMs = examDateObj - todayDateObj;
    const daysUntilExam = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));

    // Calculate required daily study hours to finish all pending topics without cramming
    const requiredDailyHours = +(totalPendingMinutes / 60 / daysUntilExam).toFixed(1);
    const isOverloaded = requiredDailyHours > maxDailyHours;

    res.status(200).json({
      success: true,
      hasDeficit: overdueCount > 0,
      overdueCount,
      overdueHours: +(overdueMinutes / 60).toFixed(1),
      totalPendingCount: pendingTasks.length,
      totalPendingHours: +(totalPendingMinutes / 60).toFixed(1),
      targetExamDate,
      daysUntilExam,
      maxDailyHours,
      requiredDailyHours,
      isOverloaded,
      overdueTasks
    });
  } catch (err) {
    console.error('Get Rebalance Status Error:', err);
    res.status(500).json({ success: false, message: 'Failed to retrieve rebalance status.' });
  }
};

// Execute Dynamic AI Syllabus Rebalance
exports.rebalanceSchedule = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { targetExamDate, sickDayDate, mode = 'even', dailyHours } = req.body;

    const todayStr = new Date().toISOString().split('T')[0];

    // Fetch config
    let config = await dbGet('SELECT * FROM user_timetable_config WHERE user_id = ?', [userId]);
    const maxDailyHours = Number(dailyHours) || Number(config?.max_daily_study_hours) || 3;

    // Fetch all pending (incomplete) tasks
    const pendingTasks = await dbAll(
      `SELECT * FROM tasks 
       WHERE user_id = ? AND completed = 0 
       ORDER BY CASE WHEN priority = 'High' THEN 1 WHEN priority = 'Medium' THEN 2 ELSE 3 END, date ASC, id ASC`,
      [userId]
    );

    if (pendingTasks.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No pending study tasks to rebalance. Great job staying on track!',
        rebalancedCount: 0,
        tasks: []
      });
    }

    // Determine target exam date (must be today or in the future)
    let finalExamDate = targetExamDate;
    if (!finalExamDate || finalExamDate < todayStr) {
      const dates = pendingTasks.map(t => t.date).filter(d => d >= todayStr);
      if (dates.length > 0) {
        dates.sort();
        finalExamDate = dates[dates.length - 1];
      } else {
        const d = new Date();
        d.setDate(d.getDate() + 14);
        finalExamDate = d.toISOString().split('T')[0];
      }
    }

    // Persist target exam date in config
    if (config) {
      await dbRun('UPDATE user_timetable_config SET target_exam_date = ? WHERE user_id = ?', [finalExamDate, userId]);
    } else {
      await dbRun('INSERT INTO user_timetable_config (user_id, target_exam_date) VALUES (?, ?)', [userId, finalExamDate]);
    }

    // Generate valid study dates from today (or tomorrow if sickDayDate is today) up to finalExamDate in UTC
    const availableDates = [];
    const currDate = new Date(todayStr + 'T00:00:00Z');
    const endDate = new Date(finalExamDate + 'T00:00:00Z');

    while (currDate <= endDate) {
      const dateStr = currDate.toISOString().split('T')[0];
      // Skip sick day
      if (sickDayDate && dateStr === sickDayDate) {
        currDate.setUTCDate(currDate.getUTCDate() + 1);
        continue;
      }
      availableDates.push(dateStr);
      currDate.setUTCDate(currDate.getUTCDate() + 1);
    }

    // If availableDates is empty (e.g. sick day was the only day), add the day after finalExamDate
    if (availableDates.length === 0) {
      const fallbackDate = new Date(endDate);
      fallbackDate.setDate(fallbackDate.getDate() + 1);
      availableDates.push(fallbackDate.toISOString().split('T')[0]);
    }

    // Order tasks based on chosen strategy
    let orderedTasks = [...pendingTasks];
    if (mode === 'priority') {
      // High priority foundational topics first, then Medium, then Low
      const pOrder = { 'High': 1, 'Medium': 2, 'Low': 3 };
      orderedTasks.sort((a, b) => (pOrder[a.priority] || 2) - (pOrder[b.priority] || 2));
    } else if (mode === 'even') {
      // Group logically by subject then maintain curriculum order
      orderedTasks.sort((a, b) => (a.subject || '').localeCompare(b.subject || '') || a.id - b.id);
    }

    // Smart Multi-Day Bucket Packing without cramming
    const totalMinutes = orderedTasks.reduce((sum, t) => sum + (Number(t.duration_minutes) || 45), 0);
    const minRequiredMinutesPerDay = Math.ceil(totalMinutes / availableDates.length);
    const targetDailyLimit = Math.max(maxDailyHours * 60, minRequiredMinutesPerDay);

    const dayBuckets = {};
    availableDates.forEach(d => { dayBuckets[d] = { minutes: 0, tasks: [] }; });

    let currentDayIdx = 0;
    const rebalancedAssignments = [];

    for (const task of orderedTasks) {
      const taskMins = Number(task.duration_minutes) || 45;

      // Advance bucket if this day has reached targetDailyLimit
      while (
        currentDayIdx < availableDates.length - 1 &&
        dayBuckets[availableDates[currentDayIdx]].minutes + taskMins > targetDailyLimit &&
        dayBuckets[availableDates[currentDayIdx]].minutes > 0
      ) {
        currentDayIdx++;
      }

      const assignedDate = availableDates[currentDayIdx];
      dayBuckets[assignedDate].minutes += taskMins;
      dayBuckets[assignedDate].tasks.push(task);

      rebalancedAssignments.push({
        taskId: task.id,
        newDate: assignedDate,
        originalDate: task.original_date || task.date
      });
    }

    // Update SQLite database with new dates
    for (const item of rebalancedAssignments) {
      await dbRun(
        `UPDATE tasks 
         SET date = ?, 
             is_rebalanced = 1, 
             original_date = ? 
         WHERE id = ? AND user_id = ?`,
        [item.newDate, item.originalDate, item.taskId, userId]
      );
    }

    // Fetch refreshed task list
    const updatedTasks = await dbAll(
      'SELECT * FROM tasks WHERE user_id = ? ORDER BY date ASC, priority DESC',
      [userId]
    );

    const avgHoursPerDay = +(totalMinutes / 60 / availableDates.length).toFixed(1);

    res.status(200).json({
      success: true,
      message: `Successfully rebalanced ${rebalancedAssignments.length} study tasks evenly across ${availableDates.length} days without cramming!`,
      rebalancedCount: rebalancedAssignments.length,
      daysDistributed: availableDates.length,
      targetExamDate: finalExamDate,
      avgHoursPerDay,
      sickDayApplied: sickDayDate || null,
      mode,
      tasks: updatedTasks
    });
  } catch (err) {
    console.error('Rebalance Schedule Error:', err);
    res.status(500).json({ success: false, message: 'Failed to rebalance study schedule: ' + err.message });
  }
};
