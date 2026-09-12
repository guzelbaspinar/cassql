# cassql

A secure, ORM-style query library for Cassandra (CQL). You write queries with familiar
methods (`find`, `insert`, `update`, `delete`, `stream`) and Mongo-style object syntax;
cassql translates them into safe, parameterized CQL.

- **Injection-resistant** — see [Security](#security)
- **CommonJS, ESM, and TypeScript** — works with both `require()` and `import`
- **Broad CQL coverage**: comparison operators, `IN`, `CONTAINS` / `CONTAINS KEY`,
  `ORDER BY`, `LIMIT` / `PER PARTITION LIMIT`, `ALLOW FILTERING`, `DISTINCT`,
  `TOKEN()` pagination, `TTL` / `TIMESTAMP` (`USING`), lightweight transactions
  (`IF EXISTS` / `IF NOT EXISTS` / column-level `IF`), collection (list/set/map)
  updates (`append` / `prepend` / `add` / `remove` / map key set / list index set),
  counter columns, `BATCH` (LOGGED / UNLOGGED / COUNTER), streaming reads with paging,
  and an escape hatch for raw CQL when needed.

## Installation

```bash
npm install @guzelbaspinar/cassql cassandra-driver
```

`cassandra-driver` is a **peer dependency**: you choose the version;
cassql does not pin it to a specific release.

## Quick start

### TypeScript / ESM

```ts
import { CassandraClient, Model } from "@guzelbaspinar/cassql";

const cassClient = new CassandraClient(
  { contactPoints: ["127.0.0.1"], localDataCenter: "datacenter1" },
  console // any object with info / warn / error methods
);

const Stock = new Model("market.stocks", cassClient.client, console);

const rows = await Stock.find({ symbol: "GARAN" }, ["symbol", "price"]);
```

### CommonJS

```js
const { CassandraClient, Model } = require("@guzelbaspinar/cassql");

const cassClient = new CassandraClient({
  contactPoints: ["127.0.0.1"],
  localDataCenter: "datacenter1",
});

const Stock = new Model("market.stocks", cassClient.client, console);
```

> **Important:** Do not create a new `CassandraClient` per request. Use a single
> shared instance for the application; the driver manages its connection pool.
> Calling `connect()` is optional — the driver connects on the first query — but you
> may call it at startup to validate connectivity early.

```ts
await cassClient.connect();    // optional: early connection check
await cassClient.disconnect(); // release the pool on shutdown
```

## Examples

Copy-paste examples (table CQL reference and `Model<StockRow>` typing): **[example/usage.md](example/usage.md)**. For connection setup, see [Quick start](#quick-start).

The `example/` directory is not published to npm; it lives in the source repo for documentation only.

## Security

The design priority is staying injection-resistant:

1. **Values are never embedded in query text.** All `WHERE`, `SET`, `VALUES`, and
   `USING TTL/TIMESTAMP` values use `?` bind markers and are sent to the driver with
   `{ prepare: true }` as prepared statements.
2. **Identifiers (table, column, keyspace names) are strictly validated.** Before
   names appear in query text, they must match `/^[a-zA-Z_][a-zA-Z0-9_]*$/`, stay
   within 128 characters, and not be CQL reserved words (`assertValidIdentifier`).
   This closes an injection vector many ORM-style libraries skip: column names from
   user input (`attributes`, `orderBy.column`, `insert` / `update` field names, etc.)
   never enter the query as raw text.
   - **Quoted / mixed-case identifiers are intentionally unsupported.** Cassandra
     allows quoted identifiers in theory, but escaping them safely adds complexity
     and risk; cassql only permits plain (unquoted) identifiers.
3. **`$or` is not supported** (Cassandra CQL has no OR), and unknown operators (e.g.
   `$foo`) throw instead of being ignored — avoiding silent “typo dropped the filter”
   bugs.
4. **`ALLOW FILTERING` is off by default**; set `options.allowFiltering = true` only
   when you mean it. This is not an injection control, but it blocks accidental
   full-cluster scans that are costly and unpredictable.
5. **Escape hatches `raw()` and `Model.buildBatch` still carry parameters separately.**
   When you run raw CQL, pass values via `params`; avoiding user input in query
   strings remains the caller’s responsibility, as with any parameterized SQL/CQL API.

**Payloads like the following never reach the query as raw text — they throw
`CassqlValidationError`:**

```ts
await Stock.find({}, ["price); DROP TABLE stocks; --"]); // ❌ throws CassqlValidationError
new Model("stocks; DROP TABLE users", client);            // ❌ throws CassqlValidationError
await Stock.find({ "a OR 1=1; --": 1 });                  // ❌ throws CassqlValidationError
```

## Condition (WHERE) syntax

`find`, `count`, `stream`, `update`, and `delete` share the same condition shape:

| Form | Example | Generated CQL |
|---|---|---|
| Equality | `{ symbol: 'GARAN' }` | `symbol = ?` |
| `$eq` | `{ symbol: { $eq: 'GARAN' } }` | `symbol = ?` |
| `$ne` | `{ symbol: { $ne: 'GARAN' } }` | `symbol != ?` |
| `$gt` / `$lt` / `$gte` / `$lte` | `{ price: { $gt: 100 } }` | `price > ?` |
| Multiple operators on one column | `{ price: { $gte: 100, $lte: 200 } }` | `price >= ? AND price <= ?` |
| `$in` | `{ id: { $in: [1, 2, 3] } }` | `id IN (?, ?, ?)` |
| `$contains` (collection) | `{ tags: { $contains: 'x' } }` | `tags CONTAINS ?` |
| `$containsKey` (map) | `{ meta: { $containsKey: 'k' } }` | `meta CONTAINS KEY ?` |
| `$token` (manual paging) | `{ $token: { columns: ['id'], op: '$gt', value: [42] } }` | `TOKEN(id) > TOKEN(?)` |

Multiple column conditions are combined with `AND`. **`$or` is not supported** (not in CQL).

## Methods

### `find(conditions, attributes, options?)`

```ts
const all = await Stock.find({}, []); // all columns, no filter
const bySymbol = await Stock.find({ symbol: "GARAN" }, ["symbol", "price"]);

const byPrice = await Stock.find(
  { symbol: "GARAN", price: { $gte: 1000, $lte: 2000 } },
  ["symbol", "price"],
  {
    orderBy: { column: "trade_date", order: "desc" },
    limit: 100,
    perPartitionLimit: 10,
    distinct: false,
    allowFiltering: false, // default
  }
);
```

`orderBy` accepts three shapes:

```ts
{ orderBy: { column: "date", order: "desc" } }
{ orderBy: { column: ["date", "id"], order: "desc" } } // same direction, multiple columns
{ orderBy: [{ column: "date", order: "desc" }, { column: "id", order: "asc" }] } // per-column direction
```

### `findOne(conditions, attributes, options?)`

Same as `find` with `limit: 1`; returns the first row or `null`.

### `findPage(conditions, attributes, options?)`

Same as `find`, plus the driver paging token (`pageState`) for manual pagination:

```ts
const page1 = await Stock.findPage({}, [], { fetchSize: 50 });
const page2 = await Stock.findPage({}, [], { fetchSize: 50, pageState: page1.pageState });
```

### `count(conditions, options?)`

```ts
const total = await Stock.count({ symbol: "GARAN" });
```

### `stream(conditions, attributes, onRead, onEnd?, options?)`

Process rows one at a time without buffering the full result set:

```ts
await Stock.stream(
  { price: { $gt: 50 } },
  ["symbol", "price"],
  async (row) => console.log(row),
  () => console.log("done"),
  { orderBy: { column: "trade_date", order: "desc" }, limit: 1000 }
);
```

### `insert(data, options?)`

```ts
await Stock.insert({ symbol: "GARAN", price: 1500.0, quantity: 20 });

// Lightweight transaction (IF NOT EXISTS)
const { applied, existing } = await Stock.insert(
  { symbol: "GARAN" },
  { ifNotExists: true }
);

// Throw when applied=false:
await Stock.insertOrThrow({ symbol: "GARAN" }, { ifNotExists: true }); // -> CassqlNotAppliedError

// TTL / TIMESTAMP
await Stock.insert({ symbol: "GARAN" }, { using: { ttl: 3600, timestamp: Date.now() * 1000 } });
```

### `update(updateFields, conditions, options?)`

```ts
await Stock.update({ price: 1200.0, quantity: 15 }, { symbol: "GARAN" });

// Collection updates
await Model2.update({ tags: { $append: "new-tag" } }, { id: 1 });     // list: append
await Model2.update({ tags: { $prepend: "first" } }, { id: 1 });      // list: prepend
await Model2.update({ tagSet: { $add: "x" } }, { id: 1 });            // set: add
await Model2.update({ tagSet: { $remove: "x" } }, { id: 1 });         // set/list: remove
await Model2.update({ attrs: { $mapSet: { key: "color", value: "red" } } }, { id: 1 }); // map[key] = value
await Model2.update({ items: { $listSetIndex: { index: 0, value: "x" } } }, { id: 1 }); // list[0] = x

// Counter column
await Counters.update({ hits: { $inc: 1 } }, { id: 1 });   // +1
await Counters.update({ hits: { $inc: -1 } }, { id: 1 });  // -1

// TTL / IF EXISTS / column-level IF (lightweight transaction)
await Stock.update({ price: 100 }, { id: 1 }, { using: { ttl: 60 } });
await Stock.update({ price: 100 }, { id: 1 }, { ifExists: true });
const { applied } = await Stock.update({ price: 100 }, { id: 1 }, { if: { price: 90 } });
```

### `delete(conditions, options?)`

```ts
await Stock.delete({ symbol: "GARAN" });
await Stock.delete({ id: { $in: [4, 5, 6] } });

// Delete specific columns or collection elements
await Model2.delete({ id: 1 }, { columns: ["price", { column: "attrs", key: "color" }] });

// USING TIMESTAMP / IF EXISTS / IF
await Stock.delete({ id: 1 }, { timestamp: Date.now() * 1000 });
await Stock.delete({ id: 1 }, { ifExists: true });
```

### `BATCH` — atomic and non-atomic multi-statement execution

```ts
import { Model } from "@guzelbaspinar/cassql";

const insertStmt = Stock.buildInsert({ symbol: "GARAN" });
const updateStmt = OtherModel.buildUpdate({ v: 2 }, { id: 1 });

// LOGGED batch (default: cross-partition atomicity, slower)
await Model.batchExecute(cassClient.client, [insertStmt, updateStmt]);

// UNLOGGED batch (no atomicity guarantee; faster — preferred for single partition)
await Model.batchExecute(cassClient.client, [insertStmt, updateStmt], { type: "unlogged" });
```

### Raw CQL (escape hatch)

```ts
const rows = await Stock.raw(
  "SELECT release_version FROM system.local WHERE key = ?",
  ["local"]
);
```

> Even with `raw()`, always pass values via `params`; never concatenate user input
> into the query string.

## Error types

| Class | When it is thrown |
|---|---|
| `CassqlValidationError` | Invalid identifier, empty object, wrong type, caller mistake, etc. |
| `CassqlUnsupportedError` | Unsupported CQL feature requested (`$or`, unknown operator, etc.) |
| `CassqlExecutionError` | Driver-level query failure (`error.query`, `error.params`, `error.cause`) |
| `CassqlNotAppliedError` | LWT not applied (e.g. `insertOrThrow` when `IF ...` fails) |

## Module systems

cassql is published with an `exports` map plus `main` / `module` / `types`, so:

- **ESM:** `import { Model } from "@guzelbaspinar/cassql"` (`dist/index.js` + `dist/index.d.ts`)
- **CommonJS:** `const { Model } = require("@guzelbaspinar/cassql")` (`dist/index.cjs` + `dist/index.d.cts`)
- **TypeScript:** full types in both setups

## Development

```bash
npm install
npm run build         # dist/ (ESM + CJS + .d.ts / .d.cts)
npm test              # vitest unit tests (mock client; no live Cassandra)
npm run test:coverage # tests + coverage; ≥98% thresholds on src (vitest.config.ts)
npm run verify        # build + CJS/ESM shape checks + test:coverage (runs on prepublishOnly)
```

## License

MIT
