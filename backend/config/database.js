// Database Configuration for MODULEARN
// Handles MySQL connection pooling and configuration

const mysql = require('mysql2/promise');
require('dotenv').config();

// Database configuration
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'modulearn_user',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'modulearn_db',
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0
};

// Create connection pool
const pool = mysql.createPool(dbConfig);

// Test database connection
const testConnection = async () => {
  try {
    const connection = await pool.getConnection();
    console.log('Database connected successfully');
    connection.release();
    return true;
  } catch (error) {
    console.error('Database connection failed:', error.message);
    return false;
  }
};

// Execute query helper function
const query = async (sql, params) => {
  try {
    const [results] = await pool.execute(sql, params);
    return results;
  } catch (error) {
    console.error('Database query error:', error.message);
    throw error;
  }
};

// Get connection from pool
const getConnection = async () => {
  try {
    return await pool.getConnection();
  } catch (error) {
    console.error('Error getting connection from pool:', error.message);
    throw error;
  }
};

// Close pool
const closePool = async () => {
  try {
    await pool.end();
    console.log('Database pool closed');
  } catch (error) {
    console.error('Error closing pool:', error.message);
    throw error;
  }
};

module.exports = {
  pool,
  query,
  getConnection,
  testConnection,
  closePool
};
