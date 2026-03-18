const { query } = require('./config/database');
require('dotenv').config();

async function checkReports() {
  try {
    console.log('Checking database...\n');
    
    // Check if table exists
    const tables = await query("SHOW TABLES LIKE 'issue_reports'");
    console.log('=== Table Check ===');
    console.log('issue_reports table exists:', tables.length > 0);
    
    if (tables.length > 0) {
      // Get all reports
      const reports = await query('SELECT * FROM issue_reports ORDER BY created_at DESC');
      console.log('\n=== Issue Reports ===');
      console.log('Total reports:', reports.length);
      
      if (reports.length > 0) {
        reports.forEach((r, index) => {
          console.log(`\n--- Report ${index + 1} ---`);
          console.log('ReportID:', r.ReportID);
          console.log('UserID:', r.UserID);
          console.log('IssueType:', r.IssueType);
          console.log('Details:', r.Details);
          console.log('Status:', r.Status);
          console.log('Created:', r.created_at);
        });
      } else {
        console.log('No reports found in database');
      }
      
      // Also check user table to see if users exist
      const users = await query('SELECT UserID, Name, Email FROM user LIMIT 5');
      console.log('\n=== Sample Users ===');
      console.log('Total users (first 5):', users.length);
      users.forEach(u => {
        console.log(`UserID: ${u.UserID}, Name: ${u.Name}, Email: ${u.Email}`);
      });
    } else {
      console.log('Table does not exist. It should be created automatically on first report submission.');
    }
    
  } catch (error) {
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    console.log('\nCheck completed');
    process.exit(0);
  }
}

checkReports();
