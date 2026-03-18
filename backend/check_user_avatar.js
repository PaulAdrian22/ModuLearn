const { query } = require('./config/database');

async function checkUserProfile() {
  try {
    // Get the user with the email from the screenshot
    const users = await query(
      'SELECT UserID, Name, Email, avatar_type, default_avatar, profile_picture FROM user WHERE Email = ?',
      ['pauladriangozo@gmail.com']
    );
    
    if (users.length === 0) {
      console.log('❌ User not found');
      process.exit(1);
    }
    
    const user = users[0];
    console.log('User Profile Data:');
    console.log('- UserID:', user.UserID);
    console.log('- Name:', user.Name);
    console.log('- Email:', user.Email);
    console.log('- avatar_type:', user.avatar_type);
    console.log('- default_avatar:', user.default_avatar);
    console.log('- profile_picture:', user.profile_picture);
    
    // Check if uploaded files exist
    const fs = require('fs');
    const path = require('path');
    
    if (user.profile_picture) {
      const filePath = path.join(__dirname, user.profile_picture);
      const exists = fs.existsSync(filePath);
      console.log('\nProfile Picture File:');
      console.log('- Path:', filePath);
      console.log('- Exists:', exists);
      
      if (exists) {
        const stats = fs.statSync(filePath);
        console.log('- Size:', stats.size, 'bytes');
      }
    }
    
    // List all files in uploads/profiles
    const uploadsDir = path.join(__dirname, 'uploads', 'profiles');
    if (fs.existsSync(uploadsDir)) {
      const files = fs.readdirSync(uploadsDir);
      console.log('\nFiles in uploads/profiles:');
      files.forEach(file => console.log('- ', file));
    }
    
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

checkUserProfile();
