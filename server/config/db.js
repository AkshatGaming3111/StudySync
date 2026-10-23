const path = require('path');
const fs = require('fs');

const isPostgres = Boolean(process.env.DATABASE_URL);

let sqliteDb = null;
let pgPool = null;

if (isPostgres) {
  const { Pool } = require('pg');
  pgPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false }
  });
  console.log('Connected to PostgreSQL database at', process.env.DATABASE_URL.split('@')[1] || 'remote host');
} else {
  const sqlite3 = require('sqlite3').verbose();
  const dataDir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  const dbPath = path.join(dataDir, 'studysync.db');
  sqliteDb = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.error('Error connecting to SQLite database:', err.message);
    } else {
      console.log('Connected to SQLite database at', dbPath);
    }
  });
}

// Convert SQLite '?' placeholders to PostgreSQL '$1, $2, ...'
function formatPgQuery(sql) {
  let index = 1;
  return sql.replace(/\?/g, () => `$${index++}`);
}

// Helper promises: dbRun
const dbRun = (sql, params = []) => {
  if (isPostgres) {
    return new Promise((resolve, reject) => {
      let pgSql = formatPgQuery(sql);
      // Append RETURNING id if it's an insert and doesn't already have RETURNING
      const isInsert = /^\s*insert\s+into/i.test(pgSql);
      if (isInsert && !/returning/i.test(pgSql)) {
        pgSql += ' RETURNING id';
      }
      pgPool.query(pgSql, params, (err, result) => {
        if (err) return reject(err);
        const lastID = result.rows && result.rows[0] ? result.rows[0].id : null;
        resolve({ lastID, changes: result.rowCount });
      });
    });
  } else {
    return new Promise((resolve, reject) => {
      sqliteDb.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  }
};

// Helper promises: dbGet
const dbGet = (sql, params = []) => {
  if (isPostgres) {
    return new Promise((resolve, reject) => {
      pgPool.query(formatPgQuery(sql), params, (err, result) => {
        if (err) return reject(err);
        resolve(result.rows ? result.rows[0] : null);
      });
    });
  } else {
    return new Promise((resolve, reject) => {
      sqliteDb.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }
};

// Helper promises: dbAll
const dbAll = (sql, params = []) => {
  if (isPostgres) {
    return new Promise((resolve, reject) => {
      pgPool.query(formatPgQuery(sql), params, (err, result) => {
        if (err) return reject(err);
        resolve(result.rows || []);
      });
    });
  } else {
    return new Promise((resolve, reject) => {
      sqliteDb.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }
};

// Schema Initialization
const initDb = async () => {
  const sqliteSchema = `
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      is_pro INTEGER DEFAULT 0,
      pro_tier TEXT DEFAULT 'free',
      stripe_customer_id TEXT,
      subscription_id TEXT,
      subscription_status TEXT DEFAULT 'inactive',
      pro_expires_at TEXT,
      billing_cycle TEXT DEFAULT 'monthly',
      gemini_api_key TEXT,
      preferred_theme TEXT DEFAULT 'default',
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
      is_rebalanced INTEGER DEFAULT 0,
      original_date TEXT,
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
      longest_streak INTEGER DEFAULT 0,
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
      target_exam_date TEXT,
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

    CREATE TABLE IF NOT EXISTS marketplace_syllabi (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      subject TEXT NOT NULL,
      category TEXT DEFAULT 'General',
      difficulty_level INTEGER DEFAULT 3,
      duration_days INTEGER DEFAULT 30,
      downloads_count INTEGER DEFAULT 0,
      likes_count INTEGER DEFAULT 0,
      author_name TEXT DEFAULT 'StudySync Academic Team',
      description TEXT,
      tasks_json TEXT NOT NULL,
      is_featured INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS study_rooms (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      category TEXT DEFAULT 'Silent Study',
      icon TEXT DEFAULT 'book-open',
      max_members INTEGER DEFAULT 50,
      is_official INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS room_participants (
      room_id TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      user_name TEXT NOT NULL,
      current_task TEXT,
      timer_mode TEXT DEFAULT 'Pomodoro',
      remaining_seconds INTEGER DEFAULT 1500,
      last_heartbeat DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (room_id, user_id)
    );
  `;

  if (isPostgres) {
    // Execute PostgreSQL equivalent schema
    const pgSchema = sqliteSchema
      .replace(/INTEGER PRIMARY KEY AUTOINCREMENT/g, 'SERIAL PRIMARY KEY')
      .replace(/DATETIME/g, 'TIMESTAMP')
      .replace(/INTEGER DEFAULT 0/g, 'INTEGER DEFAULT 0')
      .replace(/REAL/g, 'FLOAT');

    await pgPool.query(pgSchema);
    console.log('PostgreSQL schema initialized successfully.');
  } else {
    await new Promise((resolve, reject) => {
      sqliteDb.exec(sqliteSchema, async (err) => {
        if (err) {
          console.error('Failed to initialize database tables:', err);
          return reject(err);
        }

        const addCol = (table, col, def) => new Promise((res) => {
          sqliteDb.run(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`, () => res());
        });

        try {
          await addCol('users', 'is_pro', 'INTEGER DEFAULT 0');
          await addCol('users', 'pro_tier', "TEXT DEFAULT 'free'");
          await addCol('users', 'stripe_customer_id', 'TEXT');
          await addCol('users', 'subscription_id', 'TEXT');
          await addCol('users', 'subscription_status', "TEXT DEFAULT 'inactive'");
          await addCol('users', 'pro_expires_at', 'TEXT');
          await addCol('users', 'billing_cycle', "TEXT DEFAULT 'monthly'");
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
  }

  // Seed default official study rooms and marketplace courses if empty
  await seedInitialCommercialData();
};

async function seedInitialCommercialData() {
  try {
    const existingRooms = await dbAll('SELECT id FROM study_rooms LIMIT 1');
    if (!existingRooms || existingRooms.length === 0) {
      await dbRun(
        'INSERT INTO study_rooms (id, name, description, category, icon, is_official) VALUES (?, ?, ?, ?, ?, ?)',
        ['room_deep_work', 'Deep Work & Alpha Waves', 'Silent, high-intensity study room with 50-minute deep blocks.', 'Deep Work', 'zap', 1]
      );
      await dbRun(
        'INSERT INTO study_rooms (id, name, description, category, icon, is_official) VALUES (?, ?, ?, ?, ?, ?)',
        ['room_pomodoro_25', 'Pomodoro 25/5 Classic', 'Standard 25m work + 5m break pacing. Perfect for exam revisions.', 'Pomodoro', 'timer', 1]
      );
      await dbRun(
        'INSERT INTO study_rooms (id, name, description, category, icon, is_official) VALUES (?, ?, ?, ?, ?, ?)',
        ['room_stem_olympiad', 'STEM & Engineering Cohort', 'Calculus, Physics, Algorithms, and Code revision.', 'STEM', 'code', 1]
      );
      await dbRun(
        'INSERT INTO study_rooms (id, name, description, category, icon, is_official) VALUES (?, ?, ?, ?, ?, ?)',
        ['room_night_owls', 'Late Night Study Hall', 'Ambient lo-fi & quiet focus for late night cram sessions.', 'Lo-Fi', 'moon', 1]
      );
      console.log('Seeded official study rooms.');
    }

    const existingSyllabi = await dbAll('SELECT id FROM marketplace_syllabi LIMIT 1');
    if (!existingSyllabi || existingSyllabi.length === 0) {
      const calcTasks = [
        { title: 'Limits & Continuity Concepts', subject: 'Calculus', duration: 45, priority: 'High', difficulty: 2 },
        { title: 'Derivatives & Power Rules Mastery', subject: 'Calculus', duration: 60, priority: 'High', difficulty: 3 },
        { title: 'Chain Rule & Implicit Differentiation', subject: 'Calculus', duration: 60, priority: 'High', difficulty: 4 },
        { title: 'Optimization & Related Rates Problems', subject: 'Calculus', duration: 75, priority: 'High', difficulty: 5 },
        { title: 'Definite & Indefinite Integrals', subject: 'Calculus', duration: 60, priority: 'High', difficulty: 3 },
        { title: 'Integration by Parts & Substitution', subject: 'Calculus', duration: 75, priority: 'High', difficulty: 4 }
      ];

      const dsaTasks = [
        { title: 'Big-O Asymptotics & Time Complexity', subject: 'DSA', duration: 45, priority: 'Medium', difficulty: 2 },
        { title: 'Arrays & Dynamic Sizing Mechanics', subject: 'DSA', duration: 60, priority: 'High', difficulty: 3 },
        { title: 'Two Pointers & Sliding Window Patterns', subject: 'DSA', duration: 60, priority: 'High', difficulty: 4 },
        { title: 'Linked Lists & Reversal Invariance', subject: 'DSA', duration: 60, priority: 'Medium', difficulty: 3 },
        { title: 'Binary Trees & BFS/DFS Traversal', subject: 'DSA', duration: 75, priority: 'High', difficulty: 4 },
        { title: 'Dynamic Programming: 1D Memoization', subject: 'DSA', duration: 90, priority: 'High', difficulty: 5 }
      ];

      const mcatBioTasks = [
        { title: 'Amino Acids & Protein Structure', subject: 'Biochemistry', duration: 60, priority: 'High', difficulty: 3 },
        { title: 'Enzyme Kinetics & Michaelis-Menten', subject: 'Biochemistry', duration: 60, priority: 'High', difficulty: 4 },
        { title: 'Cellular Respiration & ATP Cycle', subject: 'Biology', duration: 75, priority: 'High', difficulty: 4 },
        { title: 'DNA Replication & Gene Expression', subject: 'Genetics', duration: 60, priority: 'High', difficulty: 3 }
      ];

      await dbRun(
        `INSERT INTO marketplace_syllabi 
          (title, subject, category, difficulty_level, duration_days, downloads_count, likes_count, author_name, description, tasks_json, is_featured) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          'Calculus III: Multivariable & Vector Calculus',
          'Mathematics',
          'University STEM',
          4,
          21,
          420,
          189,
          'Prof. Lin & StudySync Curators',
          'Complete 3-week mastery schedule covering limits, multi-step differentiation, and double integration.',
          JSON.stringify(calcTasks),
          1
        ]
      );

      await dbRun(
        `INSERT INTO marketplace_syllabi 
          (title, subject, category, difficulty_level, duration_days, downloads_count, likes_count, author_name, description, tasks_json, is_featured) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          'Data Structures & Algorithms: 30-Day LeetCode Sprint',
          'Computer Science',
          'Coding & Tech',
          5,
          30,
          950,
          512,
          'Silicon Valley Tech Fellows',
          'Structured daily sprint through core algorithmic patterns: Sliding Window, Trees, and Dynamic Programming.',
          JSON.stringify(dsaTasks),
          1
        ]
      );

      await dbRun(
        `INSERT INTO marketplace_syllabi 
          (title, subject, category, difficulty_level, duration_days, downloads_count, likes_count, author_name, description, tasks_json, is_featured) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          'MCAT Biology & Biochemistry High-Yield Review',
          'Pre-Med & Bio',
          'Medical Exams',
          4,
          14,
          310,
          144,
          'Dr. K. Patel (Johns Hopkins Alum)',
          'High-yield breakdown of metabolic pathways, amino acid properties, and genetic regulation.',
          JSON.stringify(mcatBioTasks),
          1
        ]
      );

      console.log('Seeded curated marketplace syllabi.');
    }
  } catch (seedErr) {
    console.warn('Seeding notice:', seedErr.message);
  }
}

module.exports = {
  db: sqliteDb,
  dbRun,
  dbGet,
  dbAll,
  initDb,
  isPostgres
};
