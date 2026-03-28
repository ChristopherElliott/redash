import { MongoClient, Document } from "mongodb";
import { BaseQueryRunner, RunQueryResult, register } from "./index";

export class MongoDB extends BaseQueryRunner {
  static noopQuery = null;
  static runnerType(): string { return "mongodb"; }
  static runnerName(): string { return "MongoDB"; }

  static configurationSchema(): Record<string, unknown> {
    return {
      type: "object",
      properties: {
        connectionString: { type: "string", title: "Connection String (URI)" },
        dbName: { type: "string", title: "Database Name" },
        replicaSetName: { type: "string", title: "Replica Set Name" },
      },
      required: ["connectionString", "dbName"],
      secret: ["connectionString"],
    };
  }

  async runQuery(query: string, _user: unknown): Promise<RunQueryResult> {
    let client: MongoClient | undefined;
    try {
      let queryObj: Record<string, unknown>;
      try {
        queryObj = JSON.parse(query);
      } catch {
        return [null, "Query must be valid JSON."];
      }

      client = new MongoClient(this.configuration.connectionString as string);
      await client.connect();

      const db = client.db(this.configuration.dbName as string);
      const collection = queryObj.collection as string;
      if (!collection) return [null, "Query must include a 'collection' field."];

      const coll = db.collection(collection);
      let documents: Document[];

      if (queryObj.aggregate) {
        const pipeline = queryObj.aggregate as Document[];
        documents = await coll.aggregate(pipeline).toArray();
      } else if (queryObj.find !== undefined || queryObj.query !== undefined) {
        const filter = (queryObj.find ?? queryObj.query ?? {}) as Document;
        const options: Record<string, unknown> = {};
        if (queryObj.fields) options.projection = queryObj.fields;
        if (queryObj.sort) options.sort = queryObj.sort as Document;
        if (queryObj.skip) options.skip = queryObj.skip as number;
        if (queryObj.limit) options.limit = queryObj.limit as number;
        documents = await coll.find(filter, options as any).toArray();
      } else if (queryObj.count !== undefined) {
        const count = await coll.countDocuments(queryObj.count as Document);
        return [{ columns: [{ name: "count", friendly_name: "count" }], rows: [{ count }] }, null];
      } else {
        return [null, "Query must specify 'find', 'aggregate', or 'count'."];
      }

      if (documents.length === 0) {
        return [{ columns: [], rows: [] }, null];
      }

      // Collect all keys
      const allKeys = new Set<string>();
      documents.forEach((doc) => { Object.keys(flattenDoc(doc)).forEach((k) => allKeys.add(k)); });

      const columns = this.fetchColumns(Array.from(allKeys).map((k) => [k, null]));
      const rows = documents.map((doc) => {
        const flat = flattenDoc(doc);
        const row: Record<string, unknown> = {};
        columns.forEach((col) => { row[col.name] = flat[col.name]; });
        return row;
      });

      return [{ columns, rows }, null];
    } catch (err: any) {
      return [null, err.message ?? String(err)];
    } finally {
      await client?.close();
    }
  }
}

function flattenDoc(doc: Document, prefix = ""): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(doc)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date)) {
      Object.assign(result, flattenDoc(value as Document, fullKey));
    } else {
      result[fullKey] = value;
    }
  }
  return result;
}

register(MongoDB as any);
