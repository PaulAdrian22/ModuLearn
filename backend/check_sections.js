const { query } = require('./config/database');

async function checkSections() {
  try {
    const modules = await query('SELECT ModuleID, ModuleTitle, sections FROM module ORDER BY ModuleID DESC LIMIT 3');
    
    console.log('=== Recent Modules ===\n');
    modules.forEach(m => {
      console.log(`ID: ${m.ModuleID}`);
      console.log(`Title: ${m.ModuleTitle}`);
      console.log(`Sections (raw):`, m.sections);
      console.log(`Sections type:`, typeof m.sections);
      if (m.sections) {
        try {
          const parsed = JSON.parse(m.sections);
          console.log(`Sections (parsed):`, parsed);
          console.log(`Sections count:`, parsed.length);
        } catch (e) {
          console.log(`Parse error:`, e.message);
        }
      }
      console.log('---\n');
    });
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkSections();
