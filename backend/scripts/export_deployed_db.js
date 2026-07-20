const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const required = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
const missing = required.filter((name) => !process.env[name]);

if (missing.length) {
  console.error(`Missing required environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

const outDir = process.env.DB_EXPORT_DIR || path.resolve(__dirname, '..', '..', 'database_backups');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outFile = path.join(outDir, `${process.env.DB_NAME}_deployed_${stamp}.sql`);

const quoteIdentifier = (identifier) => `\`${String(identifier).replace(/`/g, '``')}\``;

const escapeValue = (connection, value) => {
  if (Buffer.isBuffer(value)) return connection.escape(value);
  if (value && typeof value === 'object') return connection.escape(JSON.stringify(value));
  return connection.escape(value);
};

const insertChunkRows = Math.max(1, Number(process.env.DB_EXPORT_INSERT_CHUNK_ROWS || 1));

const chunk = (items, size) => {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
};

async function main() {
  fs.mkdirSync(outDir, { recursive: true });

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: Number(process.env.DB_PORT || 3306),
    ssl: { rejectUnauthorized: false },
    dateStrings: true,
    supportBigNumbers: true,
    bigNumberStrings: true,
    connectTimeout: 20000
  });

  const write = fs.createWriteStream(outFile, { encoding: 'utf8' });
  const line = (value = '') => write.write(`${value}\n`);

  try {
    const [tables] = await connection.query(
      `
        SELECT TABLE_NAME, TABLE_TYPE
        FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE()
        ORDER BY TABLE_TYPE, TABLE_NAME
      `
    );

    line('-- MODULEARN deployed database export');
    line(`-- Database: ${process.env.DB_NAME}`);
    line(`-- Exported at: ${new Date().toISOString()}`);
    line('SET NAMES utf8mb4;');
    line('SET FOREIGN_KEY_CHECKS=0;');
    line();

    for (const table of tables) {
      const tableName = table.TABLE_NAME;
      const quoted = quoteIdentifier(tableName);

      if (table.TABLE_TYPE === 'VIEW') continue;

      const [createRows] = await connection.query(`SHOW CREATE TABLE ${quoted}`);
      line(`DROP TABLE IF EXISTS ${quoted};`);
      line(`${createRows[0]['Create Table']};`);
      line();
    }

    for (const table of tables) {
      if (table.TABLE_TYPE !== 'VIEW') continue;

      const tableName = table.TABLE_NAME;
      const quoted = quoteIdentifier(tableName);
      const [createRows] = await connection.query(`SHOW CREATE VIEW ${quoted}`);
      line(`DROP VIEW IF EXISTS ${quoted};`);
      line(`${createRows[0]['Create View']};`);
      line();
    }

    for (const table of tables) {
      if (table.TABLE_TYPE !== 'BASE TABLE') continue;

      const tableName = table.TABLE_NAME;
      const quoted = quoteIdentifier(tableName);
      const [rows] = await connection.query(`SELECT * FROM ${quoted}`);
      if (!rows.length) continue;

      const columns = Object.keys(rows[0]).map(quoteIdentifier).join(', ');
      for (const rowGroup of chunk(rows, insertChunkRows)) {
        const values = rowGroup
          .map((row) => `(${Object.values(row).map((value) => escapeValue(connection, value)).join(', ')})`)
          .join(',\n');
        line(`INSERT INTO ${quoted} (${columns}) VALUES`);
        line(`${values};`);
      }
      line();
    }

    line('SET FOREIGN_KEY_CHECKS=1;');
    await new Promise((resolve, reject) => {
      write.end(resolve);
      write.on('error', reject);
    });

    const stats = fs.statSync(outFile);
    console.log(JSON.stringify({ outFile, bytes: stats.size, tableCount: tables.length }));
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
