import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STORAGE_KEYS,
  decodeDb,
  encodeDb,
  exportBackupText,
  importBackupText,
  loadDb,
  loadRecoveryDb,
  preserveRecoveryCandidate,
  saveDb,
  validateDb
} from './storage.js';

class MemoryStorage {
  values = new Map();
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
}

const sampleDb = () => ({
  v: 3,
  active: 'onigiri',
  memoDisplay: true,
  pendingSync: false,
  g: { onigiri: { name: 'おむすび', items: [{ id: 'o1', name: '鮭🍙' }], hist: [] } }
});

test('v3 DBを日本語を含めて往復できる', () => {
  const db = sampleDb();
  assert.deepEqual(decodeDb(encodeDb(db)), db);
});

test('既存キーへ保存し、同じ形式で読み込める', () => {
  const storage = new MemoryStorage();
  const db = sampleDb();
  saveDb(db, storage, 12345);
  const loaded = loadDb(storage);
  assert.equal(loaded.source, 'primary');
  assert.deepEqual(loaded.db, { ...sampleDb(), ts: 12345 });
});

test('2回目の保存前に直前データを退避する', () => {
  const storage = new MemoryStorage();
  const db = sampleDb();
  saveDb(db, storage, 100);
  db.memoDisplay = false;
  saveDb(db, storage, 200);
  assert.equal(decodeDb(storage.getItem(STORAGE_KEYS.dbBackup)).ts, 100);
});

test('主データ破損時は有効な直前バックアップを読む', () => {
  const storage = new MemoryStorage();
  storage.setItem(STORAGE_KEYS.dbBackup, encodeDb(sampleDb()));
  storage.setItem(STORAGE_KEYS.db, 'broken');
  const loaded = loadDb(storage);
  assert.equal(loaded.source, 'backup');
  assert.equal(loaded.db.active, 'onigiri');
  assert.ok(loaded.warning);
});

test('直前バックアップを上書きされない復旧枠へ保全する', () => {
  const storage = new MemoryStorage();
  const db = sampleDb();
  storage.setItem(STORAGE_KEYS.dbBackup, encodeDb(db));
  assert.equal(preserveRecoveryCandidate(storage), true);
  storage.setItem(STORAGE_KEYS.dbBackup, encodeDb({ ...db, ts: 999 }));
  assert.deepEqual(loadRecoveryDb(storage), db);
});

test('#BK3の書き出しと復元に互換性がある', () => {
  const db = sampleDb();
  assert.deepEqual(importBackupText(exportBackupText(db)), db);
});

test('v3でないデータを拒否する', () => {
  assert.equal(validateDb({ v: 2, active: 'onigiri', g: {} }).valid, false);
});
