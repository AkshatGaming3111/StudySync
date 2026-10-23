const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'studysync.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error connecting to SQLite database:', err.message);
  } else {
    console.log('Connected to SQLite database at', dbPath);
  }
});

// Helper promises
const dbRun = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
};

const dbGet = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

const dbAll = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

// Initialize Schemas
const initDb = async () => {
  const schema = `
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      subject TEXT NOT NULL,
      date TEXT NOT NULL,
      duration_minutes INTEGER DEFAULT 30,
      priority TEXT DEFAULT 'Medium',
      completed INTEGER DEFAULT 0,
      ai_generated INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS focus_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      duration_minutes INTEGER NOT NULL,
      distractions_count INTEGER DEFAULT 0,
      mode TEXT DEFAULT 'Pomodoro',
      sound_track TEXT DEFAULT 'None',
      completed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS screentime_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      site TEXT DEFAULT 'General Activity',
      url TEXT,
      date TEXT NOT NULL,
      category TEXT NOT NULL,
      minutes INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS screentime_limits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      category TEXT NOT NULL,
      limit_minutes INTEGER NOT NULL,
      UNIQUE(user_id, category),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS user_stats (
      user_id INTEGER PRIMARY KEY,
      current_streak INTEGER DEFAULT 0,
      last_study_date TEXT,
      total_focus_minutes INTEGER DEFAULT 0,
      xp_points INTEGER DEFAULT 0,
      level INTEGER DEFAULT 1,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS user_timetable_config (
      user_id INTEGER PRIMARY KEY,
      school_start TEXT DEFAULT '08:00',
      school_end TEXT DEFAULT '14:00',
      lunch_start TEXT DEFAULT '14:00',
      lunch_end TEXT DEFAULT '14:30',
      snack_start TEXT DEFAULT '17:00',
      snack_end TEXT DEFAULT '17:30',
      dinner_start TEXT DEFAULT '20:30',
      dinner_end TEXT DEFAULT '21:15',
      sleep_start TEXT DEFAULT '22:30',
      short_break_mins INTEGER DEFAULT 10,
      max_daily_study_hours REAL DEFAULT 3,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      role TEXT NOT NULL,
      message TEXT NOT NULL,
      action_json TEXT,
      is_gemini INTEGER DEFAULT 0,
      model_used TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS active_focus_sessions (
      user_id INTEGER PRIMARY KEY,
      duration_minutes INTEGER NOT NULL,
      mode TEXT DEFAULT 'Pomodoro',
      sound_track TEXT DEFAULT 'None',
      start_time DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS password_resets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token TEXT UNIQUE NOT NULL,
      expires_at DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS user_companion (
      user_id INTEGER PRIMARY KEY,
      stage INTEGER DEFAULT 1,
      growth_points INTEGER DEFAULT 0,
      vitality INTEGER DEFAULT 100,
      companion_type TEXT DEFAULT 'bonsai',
      equipped_decor TEXT DEFAULT '[]',
      hydration_glasses INTEGER DEFAULT 0,
      decor_positions TEXT DEFAULT '{}',
      last_watered_date TEXT,
      last_active_date TEXT,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `;

  return new Promise((resolve, reject) => {
    db.exec(schema, async (err) => {
      if (err) {
        console.error('Failed to initialize database tables:', err);
        reject(err);
        return;
      }

      const addCol = (table, col, def) => new Promise((res) => {
        db.run(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`, () => res());
      });

      try {
        await addCol('user_timetable_config', 'max_daily_study_hours', 'REAL DEFAULT 3');
        await addCol('user_timetable_config', 'target_exam_date', 'TEXT');
        await addCol('users', 'gemini_api_key', 'TEXT');
        await addCol('users', 'preferred_theme', "TEXT DEFAULT 'default'");
        await addCol('tasks', 'is_rebalanced', 'INTEGER DEFAULT 0');
        await addCol('tasks', 'original_date', 'TEXT');
        await addCol('user_companion', 'decor_positions', "TEXT DEFAULT '{}'");
        await addCol('screentime_logs', 'site', "TEXT DEFAULT 'General Activity'");
        await addCol('screentime_logs', 'url', 'TEXT');
        await addCol('user_stats', 'longest_streak', 'INTEGER DEFAULT 0');
        console.log('Database tables & column upgrades initialized successfully.');
        resolve();
      } catch (colErr) {
        console.warn('Column upgrade notice:', colErr.message);
        resolve();
      }
    });
  });
};

module.exports = {
  db,
  dbRun,
  dbGet,
  dbAll,
  initDb
};
