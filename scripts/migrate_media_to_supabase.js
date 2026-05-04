#!/usr/bin/env node
/**
 * Migrate local media into Supabase Storage.
 *
 * Buckets:
 *   lesson-media       <-  ./lesson images webp/   and  ./backend/uploads/lessons/
 *   simulation-assets  <-  ./Simulations/          and  ./backend/sim-assets/
 *   avatars            <-  ./backend/uploads/profiles/   (admin one-shot upload)
 *
 * Usage:
 *   SUPABASE_URL=...                  \
 *   SUPABASE_SERVICE_ROLE_KEY=...     \
 *   node scripts/migrate_media_to_supabase.js [--dry-run] [--bucket=lesson-media]
 *
 * Service-role key is required (bypasses RLS for the upload). Never check it in
 * and never expose it to the browser.
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const BUCKET_FILTER = args.find((a) => a.startsWith('--bucket='))?.split('=')[1];

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// bucket -> [{ localDir, prefix }]
const PLAN = {
  'lesson-media': [
    { localDir: path.join(ROOT, 'lesson images webp'),       prefix: '' },
    { localDir: path.join(ROOT, 'backend', 'uploads', 'lessons'), prefix: 'uploads/' },
  ],
  'simulation-assets': [
    { localDir: path.join(ROOT, 'Simulations'),              prefix: '' },
    { localDir: path.join(ROOT, 'backend', 'sim-assets'),    prefix: '' },
    { localDir: path.join(ROOT, 'backend', 'uploads', 'simulations'), prefix: 'uploads/' },
  ],
  avatars: [
    { localDir: path.join(ROOT, 'backend', 'uploads', 'profiles'), prefix: 'legacy/' },
  ],
};

const MIME_BY_EXT = {
  '.webp': 'image/webp',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.svg':  'image/svg+xml',
  '.json': 'application/json',
  '.mp4':  'video/mp4',
  '.webm': 'video/webm',
  '.pdf':  'application/pdf',
};

function* walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
    } else if (entry.isFile()) {
      yield full;
    }
  }
}

const toPosix = (p) => p.split(path.sep).join('/');

async function uploadOne(bucket, localPath, storageKey) {
  const ext = path.extname(localPath).toLowerCase();
  const contentType = MIME_BY_EXT[ext] || 'application/octet-stream';
  const body = fs.readFileSync(localPath);
  const { error } = await supabase.storage.from(bucket).upload(storageKey, body, {
    contentType,
    upsert: true,
  });
  if (error) throw error;
}

(async () => {
  const buckets = Object.keys(PLAN).filter((b) => !BUCKET_FILTER || b === BUCKET_FILTER);
  let totalUploaded = 0;
  let totalSkipped = 0;

  for (const bucket of buckets) {
    console.log(`\n=== ${bucket} ===`);
    for (const { localDir, prefix } of PLAN[bucket]) {
      if (!fs.existsSync(localDir)) {
        console.log(`  (skip) missing: ${localDir}`);
        continue;
      }
      console.log(`  source: ${localDir}  ->  ${bucket}/${prefix}`);
      let count = 0;
      for (const localPath of walk(localDir)) {
        const rel = toPosix(path.relative(localDir, localPath));
        const storageKey = `${prefix}${rel}`;
        if (DRY_RUN) {
          console.log(`    [dry] ${storageKey}`);
          totalSkipped++;
          continue;
        }
        try {
          await uploadOne(bucket, localPath, storageKey);
          count++;
          totalUploaded++;
          if (count % 25 === 0) console.log(`    ...${count} uploaded`);
        } catch (err) {
          console.error(`    FAIL ${storageKey}: ${err.message}`);
        }
      }
      console.log(`  done: ${count} files`);
    }
  }

  console.log(
    `\nFinished. uploaded=${totalUploaded} ${DRY_RUN ? `dry=${totalSkipped}` : ''}`
  );
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
