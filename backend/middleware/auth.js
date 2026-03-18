// Authentication Middleware
// Verifies JWT tokens and protects routes

const jwt = require('jsonwebtoken');

// Verify JWT token
const authenticate = (req, res, next) => {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;
    
    console.log('Auth middleware - Path:', req.path);
    console.log('Auth middleware - Authorization header present:', !!authHeader);
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('Auth middleware - No valid token');
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'No token provided'
      });
    }
    
    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    console.log('Auth middleware - Token verified for user:', decoded.userId);
    
    // Attach user info to request
    req.user = {
      userId: decoded.userId,
      email: decoded.email,
      name: decoded.name,
      role: decoded.role || 'student'
    };
    
    next();
    
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Token has expired'
      });
    }
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid token'
      });
    }
    
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Authentication failed'
    });
  }
};

// Optional authentication (doesn't fail if no token)
const optionalAuth = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      req.user = {
        userId: decoded.userId,
        email: decoded.email,
        name: decoded.name,
        role: decoded.role || 'student'
      };
    }
    
    next();
    
  } catch (error) {
    // Continue without authentication
    next();
  }
};

// Admin-only middleware
const requireAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Authentication required'
    });
  }
  
  if (req.user.role !== 'admin') {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Admin access required'
    });
  }
  
  next();
};

module.exports = {
  authenticate,
  optionalAuth,
  requireAdmin
};
