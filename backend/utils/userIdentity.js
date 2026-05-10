const { query } = require('../config/database');

let cachedIdentityColumn = null;
let identityColumnPromise = null;

const getUserIdentityColumn = async () => {
  if (cachedIdentityColumn) return cachedIdentityColumn;
  if (identityColumnPromise) return identityColumnPromise;

  identityColumnPromise = (async () => {
    const [usernameColumns, emailColumns] = await Promise.all([
      query("SHOW COLUMNS FROM user LIKE 'Username'"),
      query("SHOW COLUMNS FROM user LIKE 'Email'")
    ]);

    if (usernameColumns.length > 0) {
      return 'Username';
    }

    if (emailColumns.length > 0) {
      return 'Email';
    }

    throw new Error('User identity column not found (expected Username or Email).');
  })();

  try {
    cachedIdentityColumn = await identityColumnPromise;
    return cachedIdentityColumn;
  } finally {
    identityColumnPromise = null;
  }
};

module.exports = {
  getUserIdentityColumn
};
