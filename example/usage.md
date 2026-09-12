# cassql usage examples

Reference copy-paste snippets. You do not need to run this file. For connection setup, see [README — Quick start](../README.md#quick-start).

`cassClient.client` is the underlying `CassandraClient` instance (share one per application).

## Setup

```ts
import { CassandraClient, Model } from "cassql";

const cassClient = new CassandraClient(
  { contactPoints: ["127.0.0.1"], localDataCenter: "datacenter1" },
  console
);

const Stock = new Model("market.stocks", cassClient.client, console);
const Items = new Model("market.items", cassClient.client);
const Counters = new Model("market.counters", cassClient.client);
```

## Table schema and TypeScript types

cassql does **not** create tables in Cassandra or validate schema at runtime; the
`keyspace.table` must already exist. Define row shapes in TypeScript with the
`Model<T>` generic.

Example table (CQL — apply via `cqlsh` or your migration tool):

```sql
CREATE KEYSPACE IF NOT EXISTS market
  WITH replication = { 'class': 'SimpleStrategy', 'replication_factor': 1 };

CREATE TABLE IF NOT EXISTS market.stocks (
  symbol text,
  trade_date date,
  price double,
  quantity int,
  PRIMARY KEY (symbol, trade_date)
);
```

Typed model and queries:

```ts
import type { FindResult } from "cassql";
import { CassandraClient, Model } from "cassql";

interface StockRow {
  symbol: string;
  trade_date?: Date;
  price?: number;
  quantity?: number;
}

const cassClient = new CassandraClient(
  { contactPoints: ["127.0.0.1"], localDataCenter: "datacenter1" },
  console
);

const Stock = new Model<StockRow>("market.stocks", cassClient.client, console);

const rows: StockRow[] = await Stock.find({ symbol: "GARAN" }, ["symbol", "price", "trade_date"]);
const one: StockRow | null = await Stock.findOne({ symbol: "GARAN" });
const page: FindResult<StockRow> = await Stock.findPage({}, ["symbol"], { fetchSize: 50 });
```

To run DDL from code **once**, use static CQL only (never embed user input in query text):

```ts
await Stock.raw(
  `CREATE TABLE IF NOT EXISTS market.stocks (
    symbol text,
    trade_date date,
    price double,
    quantity int,
    PRIMARY KEY (symbol, trade_date)
  )`,
  []
);
```

## Conditions

`find`, `count`, `stream`, `update`, and `delete` share the same format:

```ts
{ symbol: "GARAN" }
{ symbol: { $eq: "GARAN" }, price: { $gte: 100, $lte: 200 } }
{ id: { $in: [1, 2, 3] } }
{ tags: { $contains: "x" } }              // list/set
{ meta: { $containsKey: "k" } }           // map
{ $token: { columns: ["id"], op: "$gt", value: [42] } }
```

## SELECT — find / findOne / findPage / count / stream

```ts
const all = await Stock.find({}, []);
const rows = await Stock.find({ symbol: "GARAN" }, ["symbol", "price"]);

const filtered = await Stock.find(
  { symbol: "GARAN", price: { $gte: 1000, $lte: 2000 } },
  ["symbol", "price"],
  {
    orderBy: { column: "trade_date", order: "desc" },
    // orderBy: { column: ["trade_date", "id"], order: "desc" },
    // orderBy: [{ column: "trade_date", order: "desc" }, { column: "id", order: "asc" }],
    limit: 100,
    perPartitionLimit: 10,
    distinct: false,
    allowFiltering: false,
    fetchSize: 50,
    readTimeout: 5000,
  }
);

const one = await Stock.findOne({ symbol: "GARAN" }, ["symbol", "price"]);

const page1 = await Stock.findPage({}, [], { fetchSize: 50 });
const page2 = await Stock.findPage({}, [], { fetchSize: 50, pageState: page1.pageState });

const total = await Stock.count({ symbol: "GARAN" });

await Stock.stream(
  { price: { $gt: 50 } },
  ["symbol", "price"],
  async (row) => {
    /* handle row */
  },
  () => {
    /* done */
  },
  { orderBy: { column: "trade_date", order: "desc" }, limit: 1000 }
);
```

## INSERT

```ts
await Stock.insert({ symbol: "GARAN", price: 1500.0, quantity: 20 });

const { applied, existing } = await Stock.insert({ symbol: "GARAN" }, { ifNotExists: true });

await Stock.insertOrThrow({ symbol: "GARAN" }, { ifNotExists: true });

await Stock.insert({ symbol: "GARAN" }, { using: { ttl: 3600, timestamp: Date.now() * 1000 } });
```

## UPDATE

```ts
await Stock.update({ price: 1200.0, quantity: 15 }, { symbol: "GARAN" });

await Items.update({ tags: { $append: "new-tag" } }, { id: 1 });
await Items.update({ tags: { $prepend: "first" } }, { id: 1 });
await Items.update({ tag_set: { $add: "x" } }, { id: 1 });
await Items.update({ tag_set: { $remove: "x" } }, { id: 1 });
await Items.update({ attrs: { $mapSet: { key: "color", value: "red" } } }, { id: 1 });
await Items.update({ items: { $listSetIndex: { index: 0, value: "x" } } }, { id: 1 });

await Counters.update({ hits: { $inc: 1 } }, { id: 1 });
await Counters.update({ hits: { $inc: -1 } }, { id: 1 });

await Stock.update({ price: 100 }, { id: 1 }, { using: { ttl: 60 } });
await Stock.update({ price: 100 }, { id: 1 }, { ifExists: true });
const { applied } = await Stock.update({ price: 100 }, { id: 1 }, { if: { price: 90 } });
```

## DELETE

```ts
await Stock.delete({ symbol: "GARAN" });
await Stock.delete({ id: { $in: [4, 5, 6] } });

await Items.delete({ id: 1 }, {
  columns: ["price", { column: "attrs", key: "color" }],
});

await Stock.delete({ id: 1 }, { timestamp: Date.now() * 1000 });
await Stock.delete({ id: 1 }, { ifExists: true });
```

## BATCH

```ts
import { Model } from "cassql";

const insertStmt = Stock.buildInsert({ symbol: "GARAN" });
const updateStmt = Items.buildUpdate({ v: 2 }, { id: 1 });

await Model.batchExecute(cassClient.client, [insertStmt, updateStmt]);
await Model.batchExecute(cassClient.client, [insertStmt, updateStmt], { type: "unlogged" });
```

## Raw CQL

Always pass values via `params`; never put user input in the query string.

```ts
const rows = await Stock.raw("SELECT release_version FROM system.local WHERE key = ?", ["local"]);
```

## Low-level `build*` (CQL generation)

For tests, batch preparation, or inspecting generated CQL without a connection:

```ts
import {
  buildSelectQuery,
  buildCountQuery,
  buildInsertQuery,
  buildUpdateQuery,
  buildDeleteQuery,
  buildBatchQuery,
} from "cassql";

const { query, params } = buildSelectQuery("market.stocks", { symbol: "GARAN" }, ["symbol"]);
const countQ = buildCountQuery("market.stocks", { symbol: "GARAN" });
const insertQ = buildInsertQuery("market.stocks", { symbol: "GARAN", price: 1 });
const batchQ = buildBatchQuery([insertQ, insertQ], { type: "unlogged" });
```
