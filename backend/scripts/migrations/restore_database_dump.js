const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const requiredEnv = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
const missing = requiredEnv.filter((key) => !process.env[key]);

if (missing.length) {
  console.error(`Missing required environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const dumpFile = path.resolve(
  process.cwd(),
  process.env.DB_RESTORE_FILE || path.join(repoRoot, 'database', 'modulearn_latest.sql')
);

const parseBooleanEnv = (value, fallback = false) => {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
};

const dbHost = process.env.DB_HOST;
const isAzureMysqlHost = /\.mysql\.database\.azure\.com$/i.test(dbHost);
const shouldUseSsl = parseBooleanEnv(process.env.DB_SSL, isAzureMysqlHost);
const shouldRejectUnauthorizedSsl = parseBooleanEnv(
  process.env.DB_SSL_REJECT_UNAUTHORIZED,
  false
);

const splitSqlStatements = (sql) => {
  const statements = [];
  let current = '';
  let quote = null;
  let lineComment = false;
  let blockComment = false;

  for (let i = 0; i < sql.length; i += 1) {
    const char = sql[i];
    const next = sql[i + 1];
    const prev = sql[i - 1];

    if (lineComment) {
      current += char;
      if (char === '\n') lineComment = false;
      continue;
    }

    if (blockComment) {
      current += char;
      if (char === '*' && next === '/') {
        current += next;
        i += 1;
        blockComment = false;
      }
      continue;
    }

    if (!quote && char === '-' && next === '-') {
      const after = sql[i + 2];
      if (after === ' ' || after === '\t' || after === '\r' || after === '\n') {
        current += char + next;
        i += 1;
        lineComment = true;
        continue;
      }
    }

    if (!quote && char === '/' && next === '*') {
      current += char + next;
      i += 1;
      blockComment = true;
      continue;
    }

    if (quote) {
      current += char;
      if (char === quote && prev !== '\\') quote = null;
      continue;
    }

    if (char === '\'' || char === '"' || char === '`') {
      quote = char;
      current += char;
      continue;
    }

    if (char === ';') {
      const statement = current.trim();
      if (statement) statements.push(statement);
      current = '';
      continue;
    }

    current += char;
  }

  const last = current.trim();
  if (last) statements.push(last);
  return statements;
};

async function main() {
  if (!fs.existsSync(dumpFile)) {
    throw new Error(`Database dump not found: ${dumpFile}`);
  }

  const sql = fs.readFileSync(dumpFile, 'utf8');
  const statements = splitSqlStatements(sql)
    .filter((statement) => !/^--/m.test(statement) || /[\r\n](SET|DROP|CREATE|INSERT|ALTER|UPDATE|DELETE)\b/i.test(statement));

  if (!statements.length) {
    throw new Error(`No SQL statements found in dump: ${dumpFile}`);
  }

  const connectionConfig = {
    host: dbHost,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: Number(process.env.DB_PORT || 3306),
    connectTimeout: 30000,
    multipleStatements: false
  };

  if (shouldUseSsl) {
    connectionConfig.ssl = {
      minVersion: 'TLSv1.2',
      rejectUnauthorized: shouldRejectUnauthorizedSsl
    };
  }

  const connection = await mysql.createConnection(connectionConfig);

  try {
    await connection.query('SET FOREIGN_KEY_CHECKS=0');

    for (let i = 0; i < statements.length; i += 1) {
      const statement = statements[i];
      try {
        await connection.query(statement);
      } catch (error) {
        error.message = `Statement ${i + 1}/${statements.length} failed: ${error.message}`;
        throw error;
      }
    }

    await connection.query('SET FOREIGN_KEY_CHECKS=1');
    console.log(`Restored ${statements.length} SQL statements from ${dumpFile}`);
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(`Database restore failed: ${error.message}`);
  process.exit(1);
});
