import axios from "axios";
import * as XLSX from "xlsx";
import { BaseQueryRunner, RunQueryResult, TYPE_INTEGER, TYPE_FLOAT, TYPE_BOOLEAN, TYPE_DATETIME, TYPE_STRING, register } from "./index";

export class Excel extends BaseQueryRunner {
  static shouldAnnotateQuery = false;
  syntax = "yaml";

  static runnerType(): string { return "excel"; }
  static runnerName(): string { return "Excel"; }

  static configurationSchema(): Record<string, unknown> {
    return { type: "object", properties: {} };
  }

  async runQuery(query: string, _user: unknown): Promise<RunQueryResult> {
    let url = "";
    let sheetName: string | undefined;
    let headerRow = 0;

    try {
      const yaml = await import("js-yaml");
      const args = yaml.load(query) as Record<string, unknown>;
      url = args.url as string;
      sheetName = args.sheet as string | undefined;
      if (args.header_row !== undefined) headerRow = args.header_row as number;
    } catch {
      return [null, "Query must be valid YAML with at least a `url` field."];
    }

    try {
      const resp = await axios.get(url, { responseType: "arraybuffer" });
      const workbook = XLSX.read(resp.data, { type: "buffer", cellDates: true });
      const sheet = sheetName
        ? workbook.Sheets[sheetName]
        : workbook.Sheets[workbook.SheetNames[0]];
      if (!sheet) return [null, `Sheet not found: ${sheetName}`];

      const rawRows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });
      if (rawRows.length <= headerRow) return [{ columns: [], rows: [] }, null];

      const headers = rawRows[headerRow] as string[];
      const dataRows = rawRows.slice(headerRow + 1);

      const columns = this.fetchColumns(
        headers.map((h) => {
          const sampleVal = dataRows[0]?.[headers.indexOf(h)];
          return [String(h), this.guessTypeFromValue(sampleVal)];
        })
      );

      const rows = dataRows.map((row: unknown[]) => {
        const r: Record<string, unknown> = {};
        headers.forEach((h, i) => { r[String(h)] = row[i] ?? null; });
        return r;
      });

      return [{ columns, rows }, null];
    } catch (err: any) {
      return [null, `Error reading ${url}: ${err.message}`];
    }
  }

  private guessTypeFromValue(v: unknown): any {
    if (v instanceof Date) return TYPE_DATETIME;
    if (typeof v === "boolean") return TYPE_BOOLEAN;
    if (typeof v === "number") return Number.isInteger(v) ? TYPE_INTEGER : TYPE_FLOAT;
    return TYPE_STRING;
  }

  fetchColumns(fields: [string, any][]): any[] {
    return fields.map(([name, type]) => ({ name, friendly_name: name, type: type ?? undefined }));
  }

  async getSchema(): Promise<never> {
    throw new Error("Schema not supported for Excel runner.");
  }
}

register(Excel as any);
