import { openDB } from 'https://cdn.jsdelivr.net/npm/idb@8/+esm';

const DB_NAME = 'poc-indexeddb';
const DB_VERSION = 1;
const STORE = 'notes';

let _dbPromise = null;

function getDB() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {

      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, {
          keyPath: 'id',
          autoIncrement: true,
        });
        store.createIndex('by_tag', 'tag', { unique: false });
        store.createIndex('by_createdAt', 'createdAt', { unique: false });
      }
    },
  });

  _dbPromise.then(() => logger('Database opened successfully.', 'success'));
  return _dbPromise;
}

export const NotesDB = {
  async add(note) {
    const db = await getDB();
    return db.add(STORE, { ...note, createdAt: new Date().toISOString() });
  },

  async update(id, note) {
    const db = await getDB();
    const existing = await db.get(STORE, id);
    if (!existing) throw new Error(`Note ${id} not found`);
    return db.put(STORE, {
      ...existing,
      ...note,
      id,
      updatedAt: new Date().toISOString(),
    });
  },

  async get(id) {
    const db = await getDB();
    return db.get(STORE, id);
  },

  async remove(id) {
    const db = await getDB();
    return db.delete(STORE, id);
  },

  async clear() {
    const db = await getDB();
    return db.clear(STORE);
  },

  async listAll() {
    const db = await getDB();
    return db.getAll(STORE);
  },

  async listByTag(tag) {
    const db = await getDB();
    return db.getAllFromIndex(STORE, 'by_tag', tag);
  },

  async listSortedByDateDesc() {
    const db = await getDB();
    const tx = db.transaction(STORE, 'readonly');
    const index = tx.store.index('by_createdAt');
    const results = [];
    for await (const cursor of index.iterate(null, 'prev')) {
      results.push(cursor.value);
    }
    await tx.done;
    return results;
  },
};
