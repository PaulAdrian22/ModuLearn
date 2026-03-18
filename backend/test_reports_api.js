const { query } = require('./config/database');
require('dotenv').config();

async function testReportsAPI() {
  try {
    console.log('=== Testing Reports API Query ===\n');
    
    // This is the exact query from the API endpoint
    const reports = await query(`
      SELECT 
        r.ReportID,
        r.IssueType as Category,
        r.UserID,
        u.Name as Name,
        u.Email,
        r.Status,
        r.Details,
        r.LessonTitle,
        r.ModuleID,
        r.created_at as CreatedAt
      FROM issue_reports r
      LEFT JOIN user u ON r.UserID = u.UserID
      ORDER BY r.created_at DESC
    `);
    
    console.log(`Found ${reports.length} reports\n`);
    
    if (reports.length > 0) {
      console.log('API Response Data:');
      console.log(JSON.stringify(reports, null, 2));
    } else {
      console.log('No reports found');
    }
    
  } catch (error) {
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    console.log('\nTest completed');
    process.exit(0);
  }
}

testReportsAPI();
