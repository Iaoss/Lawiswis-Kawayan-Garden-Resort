#!/usr/bin/env node
// Restores the daily backup (lawiswis-backup-YYYY-MM-DD.json.gz) into Firestore.
//
//   node scripts/restore-backup.mjs <backup file>               check only, changes nothing
//   node scripts/restore-backup.mjs <backup file> --write       add records that are missing
//   node scripts/restore-backup.mjs <backup file> --write --overwrite
//                                                               also replace records that exist
//   --only=reservations,payments                                limit to some collections
//
// Uses the same FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL and
// FIREBASE_PRIVATE_KEY as the server (from the environment, or .env.local).
// Records are never deleted.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp, GeoPoint } from 'firebase-admin/firestore';

const args = process.argv.slice(2);
const file = args.find(arg => !arg.startsWith('--'));
const write = args.includes('--write');
const overwrite = args.includes('--overwrite');
const only = (args.find(arg => arg.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);

if (!file) {
  console.log('Usage: node scripts/restore-backup.mjs <lawiswis-backup-YYYY-MM-DD.json.gz> [--write] [--overwrite] [--only=a,b]');
  process.exit(1);
}

// ---- Read the backup ---------------------------------------------------------
const raw = fs.readFileSync(file);
const sha256 = crypto.createHash('sha256').update(raw).digest('hex');
const json = file.endsWith('.gz') ? zlib.gunzipSync(raw) : raw;
const backup = JSON.parse(json.toString('utf8'));
if (!backup.data || typeof backup.data !== 'object') throw new Error('This file is not a Lawiswis backup (no "data" section).');

console.log(`Backup file : ${path.basename(file)}`);
console.log(`SHA-256     : ${sha256}  (compare with the backup email / PDF)`);
console.log(`Made        : ${backup.exportedAt || 'unknown'}  format ${backup.format || 'lawiswis-backup/1 (dates saved as text)'}`);
if (Array.isArray(backup.failed) && backup.failed.length) console.log(`Warning     : this backup was incomplete (${backup.failed.map(item => item.name).join(', ')}).`);
console.log(write ? (overwrite ? 'Mode        : WRITE, replacing existing records' : 'Mode        : WRITE, adding missing records only') : 'Mode        : CHECK ONLY (add --write to restore)');
console.log('');

// ---- Connect -----------------------------------------------------------------
const envFile = path.resolve('.env.local');
if (!process.env.FIREBASE_PRIVATE_KEY && fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^"(.*)"$/s, '$1');
  }
}
const { FIREBASE_PROJECT_ID: projectId, FIREBASE_CLIENT_EMAIL: clientEmail } = process.env;
const privateKey = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
if (!projectId || !clientEmail || !privateKey) throw new Error('Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY first.');
if (backup.projectId && backup.projectId !== projectId) {
  console.log(`Note: the backup came from project "${backup.projectId}" and you are restoring into "${projectId}".\n`);
}
initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
const db = getFirestore();

// Turns saved values back into Firestore types.
const decode = value => {
  if (Array.isArray(value)) return value.map(decode);
  if (value && typeof value === 'object') {
    if (typeof value.__timestamp === 'string' && Object.keys(value).length === 1) return Timestamp.fromDate(new Date(value.__timestamp));
    if (typeof value.__ref === 'string' && Object.keys(value).length === 1) return db.doc(value.__ref);
    if (Array.isArray(value.__geo) && Object.keys(value).length === 1) return new GeoPoint(value.__geo[0], value.__geo[1]);
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, decode(item)]));
  }
  return value;
};

// Where each record goes. Chat messages live under their conversation.
const target = (collection, record) => {
  if (collection === 'conversationMessages') {
    const { id, conversationId, ...rest } = record;
    return { ref: db.collection('conversations').doc(conversationId).collection('messages').doc(id), body: rest };
  }
  const { id, ...rest } = record;
  return { ref: db.collection(collection).doc(id), body: rest };
};

let added = 0;
let replaced = 0;
let skipped = 0;
for (const [collection, records] of Object.entries(backup.data)) {
  if (only.length && !only.includes(collection)) continue;
  if (!Array.isArray(records) || !records.length) { console.log(`${collection.padEnd(24)} 0 records`); continue; }
  const items = records.filter(record => record?.id && (collection !== 'conversationMessages' || record.conversationId)).map(record => target(collection, record));
  const existing = new Set();
  for (let i = 0; i < items.length; i += 300) {
    const snaps = await db.getAll(...items.slice(i, i + 300).map(item => item.ref));
    snaps.forEach(snap => { if (snap.exists) existing.add(snap.ref.path); });
  }
  const missing = items.filter(item => !existing.has(item.ref.path));
  const toWrite = overwrite ? items : missing;
  console.log(`${collection.padEnd(24)} ${String(items.length).padStart(6)} in backup  ${String(missing.length).padStart(6)} missing  ${String(existing.size).padStart(6)} still exist`);
  if (!write) continue;
  for (let i = 0; i < toWrite.length; i += 400) {
    const batch = db.batch();
    toWrite.slice(i, i + 400).forEach(item => batch.set(item.ref, decode(item.body)));
    await batch.commit();
  }
  added += missing.length;
  if (overwrite) replaced += existing.size; else skipped += existing.size;
}

console.log('');
console.log(write
  ? `Done. Added ${added}, replaced ${replaced}, left ${skipped} existing records alone.`
  : 'Nothing was changed. Run again with --write to restore the missing records.');
process.exit(0);
