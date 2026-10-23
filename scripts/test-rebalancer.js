const { initDb, dbRun, dbGet, dbAll } = require('../server/config/db');
const plannerController = require('../server/controllers/plannerController');

async function testRebalancer() {
  console.log('--- Starting Rebalancer Unit & Integration Test ---');
  await initDb();

  // Create or retrieve test user
  const email = 'rebalance_test@example.com';
  let user = await dbGet('SELECT * FROM users WHERE email = ?', [email]);
  if (!user) {
    const res = await dbRun(
      'INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)',
      ['Test Student', email, 'hash123']
    );
    user = { id: res.lastID, name: 'Test Student', email };
  }
  const userId = user.id;

  // Clean old test tasks for this user
  await dbRun('DELETE FROM tasks WHERE user_id = ?', [userId]);

  const todayStr = new Date().toISOString().split('T')[0];
  const yesterdayStr = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  const twoDaysAgoStr = new Date(Date.now() - 2 * 86400000).toISOString().split('T')[0];

  // Insert overdue tasks (2 missed tasks)
  await dbRun(
    'INSERT INTO tasks (user_id, title, subject, date, duration_minutes, priority, completed, ai_generated) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [userId, 'Calculus Integrals', 'Math', twoDaysAgoStr, 60, 'High', 0, 1]
  );
  await dbRun(
    'INSERT INTO tasks (user_id, title, subject, date, duration_minutes, priority, completed, ai_generated) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [userId, 'Thermodynamics Laws', 'Physics', yesterdayStr, 45, 'Medium', 0, 1]
  );

  // Insert 1 already completed task (historical)
  await dbRun(
    'INSERT INTO tasks (user_id, title, subject, date, duration_minutes, priority, completed, ai_generated) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [userId, 'Kinematics Formulas', 'Physics', twoDaysAgoStr, 30, 'Low', 1, 1]
  );

  // Insert 1 future task
  const futureExamDate = new Date(Date.now() + 10 * 86400000).toISOString().split('T')[0];
  await dbRun(
    'INSERT INTO tasks (user_id, title, subject, date, duration_minutes, priority, completed, ai_generated) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [userId, 'Organic Chemistry Lab', 'Chemistry', futureExamDate, 60, 'High', 0, 1]
  );

  console.log('Inserted test tasks with overdue dates.');

  // Test 1: getRebalanceStatus
  const mockReqStatus = { user: { userId } };
  let statusResult = null;
  const mockResStatus = {
    status: (code) => ({
      json: (data) => {
        statusResult = data;
      }
    })
  };

  await plannerController.getRebalanceStatus(mockReqStatus, mockResStatus);
  console.log('Status Result:', {
    hasDeficit: statusResult?.hasDeficit,
    overdueCount: statusResult?.overdueCount,
    overdueHours: statusResult?.overdueHours,
    daysUntilExam: statusResult?.daysUntilExam
  });

  if (!statusResult || !statusResult.hasDeficit || statusResult.overdueCount !== 2) {
    throw new Error('Test 1 Failed: getRebalanceStatus did not detect 2 overdue tasks!');
  }
  console.log('✓ Test 1 Passed: Overdue detection verified.');

  // Test 2: rebalanceSchedule with Even Spread and Sick Day
  const sickDayDate = todayStr; // Student takes today off!
  const mockReqRebalance = {
    user: { userId },
    body: {
      targetExamDate: futureExamDate,
      sickDayDate: sickDayDate,
      mode: 'even',
      dailyHours: 3
    }
  };

  let rebalanceResult = null;
  const mockResRebalance = {
    status: (code) => ({
      json: (data) => {
        rebalanceResult = data;
      }
    })
  };

  await plannerController.rebalanceSchedule(mockReqRebalance, mockResRebalance);
  console.log('Rebalance Result:', {
    success: rebalanceResult?.success,
    rebalancedCount: rebalanceResult?.rebalancedCount,
    daysDistributed: rebalanceResult?.daysDistributed,
    avgHoursPerDay: rebalanceResult?.avgHoursPerDay
  });

  if (!rebalanceResult || !rebalanceResult.success) {
    throw new Error('Test 2 Failed: rebalanceSchedule returned failure: ' + rebalanceResult?.message);
  }

  // Verify database tasks after rebalance
  const postTasks = await dbAll('SELECT * FROM tasks WHERE user_id = ? ORDER BY date ASC', [userId]);
  console.log('Tasks after rebalance:');
  for (const t of postTasks) {
    console.log(` - [${t.completed ? 'COMPLETED' : 'PENDING'}] ${t.title}: Date = ${t.date} (Orig: ${t.original_date || 'N/A'}, Rebalanced: ${t.is_rebalanced})`);
  }

  // Checks:
  // 1. Completed task Kinematics Formulas should still have date == twoDaysAgoStr
  const completedTask = postTasks.find(t => t.title === 'Kinematics Formulas');
  if (completedTask.date !== twoDaysAgoStr) {
    throw new Error(`Completed task date was altered! Expected ${twoDaysAgoStr}, got ${completedTask.date}`);
  }

  // 2. No pending tasks should be scheduled on sickDayDate
  const sickDayTasks = postTasks.filter(t => !t.completed && t.date === sickDayDate);
  if (sickDayTasks.length > 0) {
    throw new Error(`Tasks were scheduled on sick day (${sickDayDate})!`);
  }

  // 3. Overdue tasks should now be in the future (>= today, and since today is sick day, > today)
  const rebalancedTasks = postTasks.filter(t => !t.completed);
  for (const t of rebalancedTasks) {
    if (t.date < todayStr) {
      throw new Error(`Task ${t.title} is still in the past (${t.date})!`);
    }
  }

  console.log('✓ Test 2 Passed: Completed task preserved, sick day cleared, and tasks rebalanced to future dates.');

  // Clean up test tasks
  await dbRun('DELETE FROM tasks WHERE user_id = ?', [userId]);
  await dbRun('DELETE FROM users WHERE id = ?', [userId]);

  console.log('--- All Rebalancer Tests Passed Successfully! ---');
  process.exit(0);
}

testRebalancer().catch(err => {
  console.error('Rebalancer Test Failed:', err);
  process.exit(1);
});
