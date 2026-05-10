const { query } = require('../../config/database');

async function renameEmailToUsername() {
  try {
    console.log('Renaming user.Email -> user.Username...');

    const cols = await query('DESCRIBE user');
    const hasEmail = cols.some(c => c.Field === 'Email');
    const hasUsername = cols.some(c => c.Field === 'Username');

    if (hasUsername && !hasEmail) {
      console.log('Username column already in place, nothing to do');
      process.exit(0);
    }

    if (!hasEmail) {
      console.error('Neither Email nor Username column found on user table');
      process.exit(1);
    }

    const indexes = await query("SHOW INDEX FROM user WHERE Key_name = 'idx_email'");
    if (indexes.length > 0) {
      await query('ALTER TABLE user DROP INDEX idx_email');
      console.log('Dropped idx_email');
    }

    const views = ['v_user_progress_summary', 'v_assessment_performance', 'v_learning_skill_analysis', 'v_bkt_knowledge_state'];
    for (const v of views) {
      await query(`DROP VIEW IF EXISTS ${v}`);
    }
    console.log('Dropped dependent views');

    await query('ALTER TABLE user CHANGE COLUMN Email Username VARCHAR(100) NOT NULL');
    console.log('Renamed column Email -> Username');

    await query('ALTER TABLE user ADD UNIQUE KEY uniq_username (Username)');
    await query('ALTER TABLE user ADD INDEX idx_username (Username)');
    console.log('Added uniq_username and idx_username');

    await query(`
      CREATE VIEW v_user_progress_summary AS
      SELECT u.UserID, u.Name, u.Username, m.ModuleID, m.ModuleTitle,
             p.CompletionRate, p.DateStarted, p.DateCompletion
      FROM user u
      LEFT JOIN progress p ON u.UserID = p.UserID
      LEFT JOIN module m ON p.ModuleID = m.ModuleID
    `);

    await query(`
      CREATE VIEW v_assessment_performance AS
      SELECT u.UserID, u.Name, a.AssessmentID, a.AssessmentType, a.DateTaken,
             a.TotalScore, a.ResultStatus,
             COUNT(ua.AnswerID) AS total_questions,
             SUM(CASE WHEN ua.IsCorrect = TRUE THEN 1 ELSE 0 END) AS correct_answers
      FROM user u
      LEFT JOIN assessment a ON u.UserID = a.UserID
      LEFT JOIN user_answer ua ON a.AssessmentID = ua.AssessmentID
      GROUP BY u.UserID, a.AssessmentID
    `);

    await query(`
      CREATE VIEW v_learning_skill_analysis AS
      SELECT u.UserID, u.Name, ls.SkillCategory,
             AVG(ls.ScorePercentage) AS average_score,
             COUNT(ls.SkillID) AS evaluation_count,
             MAX(ls.EvaluationDate) AS last_evaluation
      FROM user u
      LEFT JOIN learning_skill ls ON u.UserID = ls.UserID
      GROUP BY u.UserID, ls.SkillCategory
    `);

    await query(`
      CREATE VIEW v_bkt_knowledge_state AS
      SELECT u.UserID, u.Name, bkt.SkillName, bkt.PKnown, bkt.PLearn, bkt.PSlip, bkt.PGuess,
             CASE
               WHEN bkt.PKnown >= 0.95 THEN 'Mastered'
               WHEN bkt.PKnown >= 0.70 THEN 'Advanced'
               WHEN bkt.PKnown >= 0.50 THEN 'Intermediate'
               ELSE 'Beginner'
             END AS proficiency_level
      FROM user u
      LEFT JOIN bkt_model bkt ON u.UserID = bkt.UserID
    `);
    console.log('Recreated views with Username');

    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    console.error(err);
    process.exit(1);
  }
}

renameEmailToUsername();
