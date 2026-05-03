/**
 * Camada de acesso a dados usando `idb` — wrapper Promise-based
 * sobre a API nativa do IndexedDB (Jake Archibald).
 *
 * Comparado à API crua, o `idb`:
 *  - Devolve Promises em vez de IDBRequest com onsuccess/onerror
 *  - Mantém a transação viva entre awaits via `tx.done`
 *  - Expõe métodos diretos no store (getAll, getAllFromIndex, etc.)
 *
 * Mesmos conceitos do IndexedDB nativo (object stores, índices,
 * transações, versionamento) — só que sem o boilerplate.
 */

import { openDB } from 'https://cdn.jsdelivr.net/npm/idb@8/+esm';

const DB_NAME = 'poc-indexeddb';
const DB_VERSION = 1;
const STORE = 'notes';

let _dbPromise = null;

function getDB() {
  if (_dbPromise) return _dbPromise;

  // logger(`Abrindo banco "${DB_NAME}" v${DB_VERSION}...`, 'info');

  _dbPromise = openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {

      
      // logger(`Migração: versão ${oldVersion} → ${newVersion}`, 'info');

      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, {
          keyPath: 'id',
          autoIncrement: true,
        });
        store.createIndex('by_tag', 'tag', { unique: false });
        store.createIndex('by_createdAt', 'createdAt', { unique: false });
        // logger(`Object store "${STORE}" criado com índices by_tag e by_createdAt`, 'success');
      }
    },
    // blocked() {
    //   logger('Migração bloqueada — feche outras abas com o app aberto.', 'error');
    // },
  });

  _dbPromise.then(() => logger('Banco aberto com sucesso.', 'success'));
  return _dbPromise;
}

export const NotesDB = {
  // init(logger) {
  //   return getDB(logger);
  // },

  async add(note) {
    const db = await getDB();
    return db.add(STORE, { ...note, createdAt: new Date().toISOString() });
  },

  async update(id, note) {
    const db = await getDB();
    const existing = await db.get(STORE, id);
    if (!existing) throw new Error(`Nota ${id} não encontrada`);
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

  /** Busca por tag usando o índice — sem varrer toda a store. */
  async listByTag(tag) {
    const db = await getDB();
    return db.getAllFromIndex(STORE, 'by_tag', tag);
  },

  /**
   * Itera com cursor pelo índice by_createdAt em ordem decrescente.
   * Em datasets pequenos getAll bastaria, mas o cursor mostra como
   * processar lazy ou parar no meio (útil em volumes maiores).
   */
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
