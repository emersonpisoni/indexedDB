# POC IndexedDB

Prova de conceito didática sobre **IndexedDB**: API nativa de banco de dados transacional, embutida no navegador, projetada para armazenar grandes volumes de dados estruturados do lado cliente.

A POC implementa um app de notas (CRUD + busca por tag + ordenação) usando JavaScript puro — sem frameworks, sem build tools — com a biblioteca [`idb`](https://github.com/jakearchibald/idb) (~1 KB) carregada via ESM CDN para deixar a API Promise-based.

## Como rodar

Não há dependências. Abra `index.html` em qualquer navegador moderno. Para evitar restrições de `file://` em alguns navegadores, sirva por HTTP local:

```bash
# Python 3
python3 -m http.server 8000
# ou Node
npx serve .
```

Depois acesse `http://localhost:8000`. Inspecione o banco em **DevTools → Application → IndexedDB → poc-indexeddb**.

## Estrutura

| Arquivo | Papel |
|---|---|
| [index.html](index.html) | UI: formulário, lista de notas e log de operações |
| [styles.css](styles.css) | Estilos |
| [db.js](db.js) | Camada de acesso usando `idb` — onde mora a "didática" do IndexedDB |
| [app.js](app.js) | Lógica do app (eventos, render) |

---

## 1. Por que o IndexedDB existe

O IndexedDB foi padronizado pela W3C como **resposta a um problema concreto**: aplicações web precisavam de armazenamento local que fosse, ao mesmo tempo:

1. **Volumoso** — `localStorage` tem limite prático de ~5 MB e armazena só strings.
2. **Estruturado** — buscar dados em JSON serializado dentro de `localStorage` é O(n) e bloqueante.
3. **Assíncrono** — operações síncronas travam a UI thread; um app offline rico não pode pagar esse custo.
4. **Transacional** — operações de leitura/escrita precisam ser consistentes mesmo com a aba sendo fechada no meio.
5. **Indexável** — buscar por campos arbitrários sem varrer toda a coleção.

Antes do IndexedDB existiu o **Web SQL Database** (SQLite no browser), mas a W3C **descontinuou** o padrão em 2010 porque dependia de uma implementação específica (SQLite) — não havia uma especificação independente que múltiplos fornecedores pudessem implementar de forma equivalente. O IndexedDB foi a alternativa: uma API de **object store** (NoSQL key-value com índices), suficientemente abstrata para ser implementada por qualquer engine.

---

## 2. Fundamentos da API

### Conceitos centrais

| Conceito | O que é |
|---|---|
| **Database** | Container nomeado e versionado. Um origin pode ter vários. |
| **Object store** | Equivalente a uma "tabela" ou "coleção". Armazena objetos estruturados (não só strings). |
| **Key path** | Campo do objeto usado como chave primária (ex: `id`). Pode ser auto-incrementado. |
| **Index** | Estrutura auxiliar que permite buscar por outro campo do objeto sem varrer tudo. |
| **Transaction** | Toda operação roda dentro de uma transação (`readonly` ou `readwrite`). Atomicidade garantida pelo navegador. |
| **Request** | Cada operação retorna um `IDBRequest` com `onsuccess` / `onerror`. É a base assíncrona da API. |
| **Cursor** | Iterador para percorrer registros lazy, útil para datasets grandes. |
| **Versioning** | Mudanças de schema (criar/alterar object stores ou índices) só podem acontecer em `onupgradeneeded`, disparado quando a versão do banco aumenta. |

### O fluxo típico

```
indexedDB.open(name, version)
        ↓
   onupgradeneeded   ← cria/altera object stores e índices (só aqui!)
        ↓
   onsuccess         ← banco pronto
        ↓
   db.transaction(store, mode)
        ↓
   tx.objectStore(store).add/get/put/delete/...
        ↓
   request.onsuccess / onerror
        ↓
   tx.oncomplete     ← transação commitada
```

Veja [db.js](db.js) para implementação comentada de cada etapa.

### Pontos não óbvios

- **Transações expiram entre microtasks:** se você fizer `await` de algo que não seja um `IDBRequest` dentro de uma transação, ela é commitada e operações subsequentes falham. Por isso wrappers como `idb` ou `Dexie` existem.
- **Versionamento é a única porta para alterar schema:** esqueceu um índice? Suba a versão e adicione em `onupgradeneeded`.
- **Same-origin policy:** o banco é isolado por origem (protocolo + domínio + porta).
- **Não é eviction-free:** o navegador pode descartar dados se o disco encher e o site não tiver pedido `navigator.storage.persist()`.

---

## 3. Comparação com ferramentas similares

| | **IndexedDB** | **localStorage** | **sessionStorage** | **Cookies** | **Cache API** | **WebSQL** *(deprecated)* |
|---|---|---|---|---|---|---|
| **Tipo** | NoSQL transacional com índices | Key-value | Key-value | Key-value (HTTP) | Cache de Request/Response | SQL relacional |
| **Capacidade** | Centenas de MB a GB | ~5 MB | ~5 MB | ~4 KB por cookie | Centenas de MB | ~50 MB |
| **Tipos de dados** | Qualquer estrutura serializável (objetos, Blob, ArrayBuffer, File) | Apenas strings | Apenas strings | Apenas strings | Request/Response | Apenas tipos SQL |
| **API** | Assíncrona (eventos / Promise via wrapper) | **Síncrona** (bloqueia UI) | **Síncrona** | Mediada via `document.cookie` ou `Set-Cookie` | Promise-based | Assíncrona (callbacks) |
| **Transações** | Sim (ACID parcial) | Não | Não | Não | Não | Sim |
| **Índices / queries** | Sim | Não | Não | Não | Match por URL | SQL completo |
| **Persistência** | Até o usuário limpar / eviction | Até o usuário limpar | Até a aba fechar | Configurável (expires) | Até o usuário limpar | Até o usuário limpar |
| **Enviado ao servidor** | Não | Não | Não | **Sim, em cada request** | Não | Não |
| **Padrão atual** | W3C, suportado em todos os navegadores | Web Storage API | Web Storage API | RFC 6265 | Service Workers spec | **Removido — não usar** |

### Quando usar cada um

- **`localStorage` / `sessionStorage`** — flags simples, preferências de UI, tokens de UI ephemeral. Pequeno e síncrono é uma vantagem aqui.
- **Cookies** — quando o servidor precisa do dado em cada request (autenticação, sessão).
- **Cache API** — cachear respostas HTTP (estratégias offline-first em Service Workers). Não é um banco — é cache de rede.
- **IndexedDB** — dados estruturados, volume considerável, busca por campos, modo offline real (PWAs), dados binários (imagens, áudio).
- **WebSQL** — **nunca**. A spec foi removida; ainda funciona em alguns navegadores por compatibilidade, mas será removido.

### Wrappers para IndexedDB

A API nativa é verbosa e cheia de pegadinhas (`onsuccess`/`onerror`, transações que expiram entre microtasks, etc.). Em produção quase ninguém usa cru:

- **[idb](https://github.com/jakearchibald/idb)** (Jake Archibald) — wrapper Promise-based finíssimo, ~1 KB. Mantém a forma da API original. **Usado nesta POC.**
- **[Dexie.js](https://dexie.org/)** — abstração de mais alto nível, com queries encadeadas, schemas declarativos e migrations. ~25 KB.
- **[RxDB](https://rxdb.info/)**, **[PouchDB](https://pouchdb.com/)** — quando você precisa de replicação/sync com backend.

O `idb` mantém o vocabulário da API nativa (`objectStore`, `transaction`, `index`, `cursor`), mas devolve Promises e mantém transações vivas entre `await`s. Veja [db.js](db.js) para ver como cada conceito mapeia.

---

## 4. O que esta POC demonstra

Marque na DevTools → Application → IndexedDB enquanto usa o app:

- [x] **Abertura e versionamento** — `openDB()` com callback `upgrade(db, oldVersion, newVersion)`
- [x] **Object store com `keyPath` auto-incrementado** — `createObjectStore('notes', { keyPath: 'id', autoIncrement: true })`
- [x] **Índices** — `by_tag` (busca filtrada) e `by_createdAt` (ordenação)
- [x] **Transações `readonly` e `readwrite`** — `db.transaction(store, mode)` + `tx.done`
- [x] **CRUD completo** — `db.add`, `db.get`, `db.put`, `db.delete`, `db.clear`
- [x] **Busca por índice** — `listByTag()` usa `db.getAllFromIndex(...)` em vez de varrer
- [x] **Cursor** — `listSortedByDateDesc()` itera com `for await (const cursor of index.iterate(null, 'prev'))`
- [x] **Tratamento de bloqueio** — callback `blocked()` em `openDB`

O painel **Log de operações** na UI mostra cada evento em tempo real.

---

## 5. Limitações conhecidas

- **Quota** — não há garantia de quanto o navegador permitirá. Use `navigator.storage.estimate()` para inspecionar e `navigator.storage.persist()` para pedir persistência.
- **Modo privado** — em janelas privadas/anônimas, o banco existe mas é descartado ao fechar. Alguns navegadores limitam quota agressivamente.
- **Migrations** — só rodam ao subir versão; não há "ALTER TABLE" arbitrário. Mudanças complexas exigem ler dados antigos, criar store nova, copiar e descartar a antiga.
- **Sem queries complexas** — não há joins ou agregações nativas. Ou você modela bem com índices, ou processa em memória.
