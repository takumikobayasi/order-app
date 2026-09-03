export const STORAGE_KEYS = Object.freeze({
  db: 'hacchu.db.v3',
  dbBackup: 'hacchu.db.v3.backup',
  dbCorrupt: 'hacchu.db.v3.corrupt',
  gasUrl: 'hacchu.gas.url',
  location: 'hacchu.loc',
  weather: 'hacchu.wx.v1'
});

export class StorageError extends Error {
  constructor(code, message, cause) {
    super(message, cause ? { cause } : undefined);
    this.name = 'StorageError';
    this.code = code;
  }
}

export function encodeDb(db) {
  const json = JSON.stringify(db);
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

export function decodeDb(encoded) {
  try {
    const binary = atob(encoded);
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch (error) {
    throw new StorageError('INVALID_DATA', '保存データを読み取れませんでした', error);
  }
}

export function validateDb(db) {
  const errors = [];
  if (!db || typeof db !== 'object' || Array.isArray(db)) {
    return { valid: false, errors: ['DBがオブジェクトではありません'] };
  }
  if (db.v !== 3) errors.push('DBバージョンがv3ではありません');
  if (!db.g || typeof db.g !== 'object' || Array.isArray(db.g)) {
    errors.push('ジャンルデータがありません');
  }
  if (typeof db.active !== 'string' || !db.active) {
    errors.push('選択中ジャンルがありません');
  }
  return { valid: errors.length === 0, errors };
}

function readEncoded(storage, key) {
  try {
    return storage.getItem(key);
  } catch (error) {
    throw new StorageError('READ_FAILED', '端末の保存領域を読み取れませんでした', error);
  }
}

export function loadDb(storage = localStorage) {
  const primary = readEncoded(storage, STORAGE_KEYS.db);
  if (!primary) return { db: null, source: 'empty', warning: null };

  try {
    const db = decodeDb(primary);
    const check = validateDb(db);
    if (!check.valid) throw new StorageError('INVALID_SCHEMA', check.errors.join('、'));
    return { db, source: 'primary', warning: null };
  } catch (primaryError) {
    const backup = readEncoded(storage, STORAGE_KEYS.dbBackup);
    if (!backup) throw primaryError;
    const db = decodeDb(backup);
    const check = validateDb(db);
    if (!check.valid) throw primaryError;
    return {
      db,
      source: 'backup',
      warning: '通常の保存データが壊れていたため、直前のバックアップを読み込みました'
    };
  }
}

export function saveDb(db, storage = localStorage, now = Date.now()) {
  const check = validateDb(db);
  if (!check.valid) {
    throw new StorageError('INVALID_SCHEMA', `保存を中止しました: ${check.errors.join('、')}`);
  }

  const previousTs = db.ts;
  db.ts = now;
  try {
    const current = storage.getItem(STORAGE_KEYS.db);
    if (current) {
      try {
        const currentDb = decodeDb(current);
        if (validateDb(currentDb).valid) storage.setItem(STORAGE_KEYS.dbBackup, current);
        else storage.setItem(STORAGE_KEYS.dbCorrupt, current);
      } catch (_) {
        storage.setItem(STORAGE_KEYS.dbCorrupt, current);
      }
    }
    storage.setItem(STORAGE_KEYS.db, encodeDb(db));
    return now;
  } catch (error) {
    if (previousTs === undefined) delete db.ts;
    else db.ts = previousTs;
    throw new StorageError('WRITE_FAILED', '端末への保存に失敗しました', error);
  }
}

export function importBackupText(text) {
  const match = String(text || '').match(/#BK3:([A-Za-z0-9+/=]+)/);
  if (!match) throw new StorageError('BACKUP_NOT_FOUND', 'バックアップの文字列が見つかりません');
  const db = decodeDb(match[1]);
  const check = validateDb(db);
  if (!check.valid) {
    throw new StorageError('INVALID_SCHEMA', `バックアップ形式が正しくありません: ${check.errors.join('、')}`);
  }
  return db;
}

export function exportBackupText(db) {
  const check = validateDb(db);
  if (!check.valid) {
    throw new StorageError('INVALID_SCHEMA', `書き出しを中止しました: ${check.errors.join('、')}`);
  }
  return `#BK3:${encodeDb(db)}`;
}
