// Authentication Controller
// Handles user registration, login, and authentication

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('../config/database');
const { getUserIdentityColumn } = require('../utils/userIdentity');

// Self-heal: make sure the Gender column exists before inserting. Cached after
// the first call so subsequent registrations don't re-query schema.
let genderColumnEnsured = false;
const ensureGenderColumn = async () => {
  if (genderColumnEnsured) return;
  try {
    const cols = await query('DESCRIBE user');
    const hasGender = cols.some((c) => c.Field === 'Gender');
    if (!hasGender) {
      await query("ALTER TABLE user ADD COLUMN Gender ENUM('Male', 'Female') NULL AFTER Age");
      console.log('Added missing Gender column to user table.');
    }
    genderColumnEnsured = true;
  } catch (error) {
    if (error?.code === 'ER_DUP_FIELDNAME') {
      genderColumnEnsured = true;
      return;
    }
    console.warn('ensureGenderColumn failed:', error?.code || error?.message);
    // Don't flip the sentinel — retry on next request.
  }
};

// Generate JWT token
const generateToken = (userId, username, name, role = 'student') => {
  return jwt.sign(
    { userId, username, name, role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE || '24h' }
  );
};

// Register new user
const register = async (req, res) => {
  try {
    const { name, password, age, gender, educationalBackground } = req.body;
    const username = (req.body.username || '').trim();

    await ensureGenderColumn();

    const identityColumn = await getUserIdentityColumn();
    const identityValue = username;

    const existingUser = await query(
      `SELECT UserID FROM user WHERE ${identityColumn} = ?`,
      [identityValue]
    );

    if (existingUser.length > 0) {
      return res.status(400).json({
        error: 'Registration Failed',
        message: 'Username already taken'
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(
      password,
      parseInt(process.env.BCRYPT_ROUNDS) || 10
    );

    const result = await query(
      `INSERT INTO user (Name, ${identityColumn}, Password, Age, Gender, EducationalBackground, Role) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [name, identityValue, hashedPassword, age, gender, educationalBackground || null, 'student']
    );

    const userId = result.insertId;

    const token = generateToken(userId, identityValue, name, 'student');

    res.status(201).json({
      message: 'Registration successful',
      user: {
        userId,
        name,
        username: identityValue,
        age,
        gender,
        educationalBackground
      },
      token
    });
    
  } catch (error) {
    console.error('Registration error:', { code: error?.code, message: error?.message });
    res.status(500).json({
      error: 'Internal Server Error',
      message: `Failed to register user: ${error?.code || error?.message || 'unknown error'}`
    });
  }
};

// Login user
const login = async (req, res) => {
  try {
    const { password } = req.body;
    const username = (req.body.username || '').trim();

    const identityColumn = await getUserIdentityColumn();
    const identityValue = username;

    const users = await query(
      `SELECT UserID, Name, ${identityColumn} AS Username, Password, Age, EducationalBackground, profile_picture, avatar_type, default_avatar, Role, last_login FROM user WHERE ${identityColumn} = ?`,
      [identityValue]
    );

    if (users.length === 0) {
      return res.status(401).json({
        error: 'Authentication Failed',
        message: 'Invalid username or password'
      });
    }

    const user = users[0];

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.Password);

    if (!isValidPassword) {
      return res.status(401).json({
        error: 'Authentication Failed',
        message: 'Invalid username or password'
      });
    }

    // Update last login
    await query(
      'UPDATE user SET last_login = CURRENT_TIMESTAMP WHERE UserID = ?',
      [user.UserID]
    );

    const token = generateToken(user.UserID, user.Username, user.Name, user.Role || 'student');

    // Only treat a learner as "new" on their first-ever successful login.
    // This prevents the initial assessment from reappearing for returning users.
    const isNewUser = !user.last_login;

    res.json({
      message: 'Login successful',
      user: {
        userId: user.UserID,
        name: user.Name,
        username: user.Username,
        age: user.Age,
        educationalBackground: user.EducationalBackground,
        profile_picture: user.profile_picture,
        avatar_type: user.avatar_type,
        default_avatar: user.default_avatar,
        role: user.Role || 'student'
      },
      token,
      isNewUser
    });
    
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to login'
    });
  }
};

// Verify token
const verifyToken = async (req, res) => {
  try {
    // Token already verified by middleware
    const userId = req.user.userId;
    
    const identityColumn = await getUserIdentityColumn();

    const users = await query(
      `SELECT UserID, Name, ${identityColumn} AS Username, Age, EducationalBackground, Role FROM user WHERE UserID = ?`,
      [userId]
    );

    if (users.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'User not found'
      });
    }

    res.json({
      valid: true,
      user: {
        userId: users[0].UserID,
        name: users[0].Name,
        username: users[0].Username,
        age: users[0].Age,
        educationalBackground: users[0].EducationalBackground,
        role: users[0].Role || 'student'
      }
    });
    
  } catch (error) {
    console.error('Token verification error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to verify token'
    });
  }
};

// Logout (client-side token removal, but can log the action)
const logout = async (req, res) => {
  try {
    // In a stateless JWT setup, logout is primarily client-side
    // You can log the logout action here if needed
    
    res.json({
      message: 'Logout successful'
    });
    
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to logout'
    });
  }
};

module.exports = {
  register,
  login,
  verifyToken,
  logout
};
