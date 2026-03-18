const { query } = require('./config/database');

async function addAvatarColumns() {
  try {
    console.log('Adding avatar columns to user table...');
    
    // Check if columns exist first
    const cols = await query('DESCRIBE user');
    const hasAvatarType = cols.some(c => c.Field === 'avatar_type');
    const hasDefaultAvatar = cols.some(c => c.Field === 'default_avatar');
    
    if (!hasAvatarType) {
      console.log('Adding avatar_type column...');
      await query("ALTER TABLE user ADD COLUMN avatar_type ENUM('default', 'custom') DEFAULT 'default' AFTER profile_picture");
      console.log('✅ avatar_type column added');
    } else {
      console.log('ℹ️  avatar_type column already exists');
    }
    
    if (!hasDefaultAvatar) {
      console.log('Adding default_avatar column...');
      await query("ALTER TABLE user ADD COLUMN default_avatar VARCHAR(50) DEFAULT 'avatar1.svg' AFTER avatar_type");
      console.log('✅ default_avatar column added');
    } else {
      console.log('ℹ️  default_avatar column already exists');
    }
    
    // Verify
    const updatedCols = await query('DESCRIBE user');
    console.log('\nFinal user table structure:');
    updatedCols.forEach(c => console.log(`- ${c.Field} (${c.Type})`));
    
    console.log('\n✅ Migration completed successfully!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    console.error(err);
    process.exit(1);
  }
}

addAvatarColumns();
