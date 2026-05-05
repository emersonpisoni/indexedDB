# IndexedDB POC

A didactic proof of concept for **IndexedDB**: a native, browser-embedded transactional database API designed to store large volumes of structured data on the client side.

This POC implements a notes app (CRUD + search by tag + sorting) using vanilla JavaScript — no frameworks, no build tools — with the [`idb`](https://github.com/jakearchibald/idb) library (~1 KB) loaded via ESM CDN to make the API Promise-based.

## How to run

No dependencies. Open `index.html` in any modern browser. To avoid `file://` restrictions in some browsers, serve over local HTTP:

```bash
# Python 3
python3 -m http.server 8000
# or Node
npx serve .
```

Then visit `http://localhost:8000`. Inspect the database in **DevTools → Application → IndexedDB → poc-indexeddb**.

## Structure

| File | Role |
|---|---|
| [index.html](index.html) | UI: form, notes list, and operations log |
| [styles.css](styles.css) | Styles |
| [db.js](db.js) | Data access layer using `idb` — where the IndexedDB "didactics" live |
| [app.js](app.js) | App logic (events, render) |

---

## 1. Why IndexedDB exists

IndexedDB was standardized by the W3C as a **response to a concrete problem**: web applications needed local storage that was, at the same time:

1. **High-capacity** — `localStorage` has a practical limit of ~5 MB and only stores strings.
2. **Structured** — searching JSON serialized inside `localStorage` is O(n) and blocking.
3. **Asynchronous** — synchronous operations freeze the UI thread; a rich offline app can't pay that cost.
4. **Transactional** — read/write operations need to stay consistent even if the tab closes mid-operation.
5. **Indexable** — search by arbitrary fields without scanning the whole collection.

Before IndexedDB there was **Web SQL Database** (SQLite in the browser), but the W3C **deprecated** the standard in 2010 because it depended on a specific implementation (SQLite) — there was no independent specification multiple vendors could implement equivalently. IndexedDB became the alternative: an **object store** API (NoSQL key-value with indexes), abstract enough to be implemented by any engine.

---

## 2. API fundamentals

### Core concepts

| Concept | What it is |
|---|---|
| **Database** | Named, versioned container. An origin can have several. |
| **Object store** | Equivalent to a "table" or "collection". Stores structured objects (not just strings). |
| **Key path** | Object field used as primary key (e.g. `id`). Can be auto-incremented. |
| **Index** | Auxiliary structure that lets you search by another field of the object without scanning everything. |
| **Transaction** | Every operation runs inside a transaction (`readonly` or `readwrite`). Atomicity guaranteed by the browser. |
| **Request** | Each operation returns an `IDBRequest` with `onsuccess` / `onerror`. The async foundation of the API. |
| **Cursor** | Iterator to walk records lazily — useful for large datasets. |
| **Versioning** | Schema changes (creating/altering object stores or indexes) can only happen in `onupgradeneeded`, fired when the database version increases. |

### The typical flow

```
indexedDB.open(name, version)
        ↓
   onupgradeneeded   ← create/alter object stores and indexes (only here!)
        ↓
   onsuccess         ← database ready
        ↓
   db.transaction(store, mode)
        ↓
   tx.objectStore(store).add/get/put/delete/...
        ↓
   request.onsuccess / onerror
        ↓
   tx.oncomplete     ← transaction committed
```

See [db.js](db.js) for a commented implementation of each step.

### Non-obvious points

- **Transactions expire between microtasks:** if you `await` something other than an `IDBRequest` inside a transaction, it gets committed and subsequent operations fail. This is why wrappers like `idb` or `Dexie` exist.
- **Versioning is the only door for schema changes:** forgot an index? Bump the version and add it in `onupgradeneeded`.
- **Same-origin policy:** the database is isolated by origin (protocol + domain + port).
- **Not eviction-free:** the browser may discard data if disk fills up and the site hasn't requested `navigator.storage.persist()`.

---

## 3. Comparison with similar tools

| | **IndexedDB** | **localStorage** | **sessionStorage** | **Cookies** | **Cache API** | **WebSQL** *(deprecated)* |
|---|---|---|---|---|---|---|
| **Type** | Transactional NoSQL with indexes | Key-value | Key-value | Key-value (HTTP) | Request/Response cache | Relational SQL |
| **Capacity** | Hundreds of MB to GB | ~5 MB | ~5 MB | ~4 KB per cookie | Hundreds of MB | ~50 MB |
| **Data types** | Any serializable structure (objects, Blob, ArrayBuffer, File) | Strings only | Strings only | Strings only | Request/Response | SQL types only |
| **API** | Async (events / Promise via wrapper) | **Sync** (blocks UI) | **Sync** | Mediated via `document.cookie` or `Set-Cookie` | Promise-based | Async (callbacks) |
| **Transactions** | Yes (partial ACID) | No | No | No | No | Yes |
| **Indexes / queries** | Yes | No | No | No | URL match | Full SQL |
| **Persistence** | Until user clears / eviction | Until user clears | Until tab closes | Configurable (expires) | Until user clears | Until user clears |
| **Sent to server** | No | No | No | **Yes, on every request** | No | No |
| **Current standard** | W3C, supported in all browsers | Web Storage API | Web Storage API | RFC 6265 | Service Workers spec | **Removed — do not use** |

### When to use each one

- **`localStorage` / `sessionStorage`** — simple flags, UI preferences, ephemeral UI tokens. Small and synchronous is an advantage here.
- **Cookies** — when the server needs the data on every request (auth, session).
- **Cache API** — cache HTTP responses (offline-first strategies in Service Workers). Not a database — it's a network cache.
- **IndexedDB** — structured data, considerable volume, search by fields, real offline mode (PWAs), binary data (images, audio).
- **WebSQL** — **never**. The spec was removed; it still works in some browsers for compatibility but will be removed.

### IndexedDB wrappers

The native API is verbose and full of gotchas (`onsuccess`/`onerror`, transactions expiring between microtasks, etc.). In production almost no one uses it raw:

- **[idb](https://github.com/jakearchibald/idb)** (Jake Archibald) — paper-thin Promise-based wrapper, ~1 KB. Keeps the shape of the original API. **Used in this POC.**
- **[Dexie.js](https://dexie.org/)** — higher-level abstraction with chained queries, declarative schemas, and migrations. ~25 KB.
- **[RxDB](https://rxdb.info/)**, **[PouchDB](https://pouchdb.com/)** — when you need replication/sync with a backend.

`idb` keeps the native API vocabulary (`objectStore`, `transaction`, `index`, `cursor`), but returns Promises and keeps transactions alive across `await`s. See [db.js](db.js) for how each concept maps.

---

## 4. What this POC demonstrates

Watch DevTools → Application → IndexedDB while using the app:

- [x] **Open and versioning** — `openDB()` with `upgrade(db, oldVersion, newVersion)` callback
- [x] **Object store with auto-incremented `keyPath`** — `createObjectStore('notes', { keyPath: 'id', autoIncrement: true })`
- [x] **Indexes** — `by_tag` (filtered search) and `by_createdAt` (sorting)
- [x] **`readonly` and `readwrite` transactions** — `db.transaction(store, mode)` + `tx.done`
- [x] **Full CRUD** — `db.add`, `db.get`, `db.put`, `db.delete`, `db.clear`
- [x] **Index-based search** — `listByTag()` uses `db.getAllFromIndex(...)` instead of scanning
- [x] **Cursor** — `listSortedByDateDesc()` iterates with `for await (const cursor of index.iterate(null, 'prev'))`
- [x] **Blocked handling** — `blocked()` callback in `openDB`

The **Operations log** panel in the UI shows each event in real time.

---

## 5. Known limitations

- **Quota** — there's no guarantee of how much the browser will allow. Use `navigator.storage.estimate()` to inspect and `navigator.storage.persist()` to request persistence.
- **Private mode** — in private/incognito windows, the database exists but is discarded on close. Some browsers throttle quota aggressively.
- **Migrations** — only run when the version bumps; there's no arbitrary "ALTER TABLE". Complex changes require reading old data, creating a new store, copying, and dropping the old one.
- **No complex queries** — no native joins or aggregations. Either you model well with indexes, or you process in memory.
