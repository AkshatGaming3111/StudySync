const { dbAll, dbGet, dbRun } = require('../config/db');

// List marketplace syllabi with optional search, category, and sorting
exports.listSyllabi = async (req, res) => {
  try {
    const { category, search, sort = 'popular' } = req.query;

    let sql = 'SELECT id, title, subject, category, difficulty_level, duration_days, downloads_count, likes_count, author_name, description, is_featured, created_at FROM marketplace_syllabi WHERE 1=1';
    const params = [];

    if (category && category !== 'All') {
      sql += ' AND category = ?';
      params.push(category);
    }

    if (search) {
      sql += ' AND (title LIKE ? OR subject LIKE ? OR author_name LIKE ? OR description LIKE ?)';
      const s = `%${search}%`;
      params.push(s, s, s, s);
    }

    if (sort === 'popular') {
      sql += ' ORDER BY downloads_count DESC, likes_count DESC';
    } else if (sort === 'difficulty') {
      sql += ' ORDER BY difficulty_level DESC';
    } else {
      sql += ' ORDER BY created_at DESC';
    }

    const syllabi = await dbAll(sql, params);

    res.status(200).json({
      success: true,
      count: syllabi.length,
      syllabi
    });
  } catch (err) {
    console.error('List Marketplace Syllabi Error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch marketplace syllabi.' });
  }
};

// Get single syllabus details with full task breakdown preview
exports.getSyllabus = async (req, res) => {
  try {
    const { id } = req.params;
    const syllabus = await dbGet('SELECT * FROM marketplace_syllabi WHERE id = ?', [id]);

    if (!syllabus) {
      return res.status(404).json({ success: false, message: 'Syllabus roadmap not found.' });
    }

    syllabus.tasks = JSON.parse(syllabus.tasks_json || '[]');
    delete syllabus.tasks_json;

    res.status(200).json({
      success: true,
      syllabus
    });
  } catch (err) {
    console.error('Get Marketplace Syllabus Error:', err);
    res.status(500).json({ success: false, message: 'Failed to load syllabus roadmap.' });
  }
};

// One-click clone syllabus roadmap into user's personal task board
exports.cloneSyllabus = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;
    const { startDate } = req.body;

    const syllabus = await dbGet('SELECT * FROM marketplace_syllabi WHERE id = ?', [id]);
    if (!syllabus) {
      return res.status(404).json({ success: false, message: 'Syllabus roadmap not found.' });
    }

    const tasks = JSON.parse(syllabus.tasks_json || '[]');
    if (!tasks || tasks.length === 0) {
      return res.status(400).json({ success: false, message: 'This roadmap has no tasks to import.' });
    }

    // Base start date defaults to tomorrow or provided date
    const baseDate = startDate ? new Date(startDate) : new Date();
    if (!startDate) baseDate.setDate(baseDate.getDate() + 1);

    let insertedCount = 0;
    const curDate = new Date(baseDate);

    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];
      const dateStr = curDate.toISOString().split('T')[0];

      await dbRun(
        `INSERT INTO tasks 
          (user_id, title, subject, date, duration_minutes, priority, ai_generated, is_rebalanced, original_date) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          userId,
          task.title || `Study Module ${i + 1}`,
          task.subject || syllabus.subject || 'General',
          dateStr,
          task.duration || 45,
          task.priority || 'Medium',
          1,
          0,
          dateStr
        ]
      );

      insertedCount++;
      // Spread every 1-2 tasks per day
      if (i % 2 === 1) {
        curDate.setDate(curDate.getDate() + 1);
      }
    }

    // Increment downloads count on marketplace
    await dbRun('UPDATE marketplace_syllabi SET downloads_count = downloads_count + 1 WHERE id = ?', [id]);

    res.status(201).json({
      success: true,
      message: `🎉 Successfully imported "${syllabus.title}"! ${insertedCount} scheduled tasks added to your planner.`,
      importedCount: insertedCount
    });
  } catch (err) {
    console.error('Clone Syllabus Error:', err);
    res.status(500).json({ success: false, message: 'Failed to import syllabus roadmap.' });
  }
};

// Upvote / Like a syllabus
exports.likeSyllabus = async (req, res) => {
  try {
    const { id } = req.params;
    await dbRun('UPDATE marketplace_syllabi SET likes_count = likes_count + 1 WHERE id = ?', [id]);
    const updated = await dbGet('SELECT likes_count FROM marketplace_syllabi WHERE id = ?', [id]);

    res.status(200).json({
      success: true,
      likes: updated?.likes_count || 0
    });
  } catch (err) {
    console.error('Like Syllabus Error:', err);
    res.status(500).json({ success: false, message: 'Failed to like syllabus.' });
  }
};
