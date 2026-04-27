// Authentication Controller
// Handles user registration, login, and authentication

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('../config/database');

// Generate JWT token
const generateToken = (userId, username, name, role = 'student') => {
  return jwt.sign(
    { userId, username, email: username, name, role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE || '24h' }
  );
};

// Register new user
const register = async (req, res) => {
  try {
    const { name, password, age, educationalBackground } = req.body;
    const username = (req.body.username || req.body.email || '').trim();

    // Check if user already exists (Email column stores the username)
    const existingUser = await query(
      'SELECT UserID FROM user WHERE Email = ?',
      [username]
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

    // Insert new user (Email column stores username for backward compatibility)
    const result = await query(
      'INSERT INTO user (Name, Email, Password, Age, EducationalBackground, Role) VALUES (?, ?, ?, ?, ?, ?)',
      [name, username, hashedPassword, age || null, educationalBackground || null, 'student']
    );

    const userId = result.insertId;

    // Generate token
    const token = generateToken(userId, username, name, 'student');

    res.status(201).json({
      message: 'Registration successful',
      user: {
        userId,
        name,
        username,
        email: username,
        age,
        educationalBackground
      },
      token
    });
    
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to register user'
    });
  }
};

// Login user
const login = async (req, res) => {
  try {
    const { password } = req.body;
    const username = (req.body.username || req.body.email || '').trim();

    // Query user by username (stored in Email column for legacy reasons)
    const users = await query(
      'SELECT UserID, Name, Email, Password, Age, EducationalBackground, profile_picture, avatar_type, default_avatar, Role, last_login FROM user WHERE Email = ?',
      [username]
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

    // Generate token
    const token = generateToken(user.UserID, user.Email, user.Name, user.Role || 'student');

    // Only treat a learner as "new" on their first-ever successful login.
    // This prevents the initial assessment from reappearing for returning users.
    const isNewUser = !user.last_login;

    res.json({
      message: 'Login successful',
      user: {
        userId: user.UserID,
        name: user.Name,
        username: user.Email,
        email: user.Email,
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
    
    // Get fresh user data
    const users = await query(
      'SELECT UserID, Name, Email, Age, EducationalBackground, Role FROM user WHERE UserID = ?',
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
        username: users[0].Email,
        email: users[0].Email,
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
