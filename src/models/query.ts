import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany,
  JoinColumn, Index,
} from "typeorm";
import { Organization } from "./organization";
import { User } from "./user";
import { DataSource } from "./dataSource";

// ─── QueryResult ─────────────────────────────────────────────────────────────

@Entity("query_results")
export class QueryResult {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: "org_id" })
  orgId!: number;

  @Column({ name: "data_source_id" })
  dataSourceId!: number;

  @Column({ name: "query_hash", length: 32 })
  queryHash!: string;

  @Column({ name: "query", type: "text" })
  query!: string;

  @Column({ type: "text", nullable: true })
  data?: string;

  @Column({ type: "double precision" })
  runtime!: number;

  @Column({ name: "retrieved_at", type: "timestamptz" })
  retrievedAt!: Date;

  toDict(): Record<string, unknown> {
    return {
      id: this.id,
      query_hash: this.queryHash,
      query: this.query,
      data: this.data ? JSON.parse(this.data) : null,
      data_source_id: this.dataSourceId,
      runtime: this.runtime,
      retrieved_at: this.retrievedAt,
    };
  }
}

// ─── Query ────────────────────────────────────────────────────────────────────

@Entity("queries")
export class Query {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ default: 1 })
  version!: number;

  @Column({ name: "org_id" })
  orgId!: number;

  @ManyToOne(() => Organization)
  @JoinColumn({ name: "org_id" })
  org?: Organization;

  @Column({ name: "data_source_id", nullable: true })
  dataSourceId?: number;

  @ManyToOne(() => DataSource)
  @JoinColumn({ name: "data_source_id" })
  dataSource?: DataSource;

  @Column({ name: "latest_query_data_id", nullable: true })
  latestQueryDataId?: number;

  @ManyToOne(() => QueryResult)
  @JoinColumn({ name: "latest_query_data_id" })
  latestQueryData?: QueryResult;

  @Column({ length: 255 })
  name!: string;

  @Column({ length: 4096, nullable: true })
  description?: string;

  @Column({ name: "query", type: "text" })
  queryText!: string;

  @Column({ name: "query_hash", length: 32 })
  queryHash!: string;

  @Column({ name: "api_key", length: 40 })
  apiKey!: string;

  @Column({ name: "user_id" })
  userId!: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: "user_id" })
  user?: User;

  @Column({ name: "last_modified_by_id", nullable: true })
  lastModifiedById?: number;

  @Column({ name: "is_archived", default: false })
  isArchived!: boolean;

  @Column({ name: "is_draft", default: true })
  isDraft!: boolean;

  @Column({ type: "jsonb", nullable: true })
  schedule?: Record<string, unknown> | null;

  @Column({ name: "schedule_failures", default: 0 })
  scheduleFailures!: number;

  @Column({ type: "jsonb", default: {} })
  options!: Record<string, unknown>;

  @Column({ type: "text", array: true, nullable: true })
  tags?: string[];

  @Column({ name: "created_at", type: "timestamptz", default: () => "now()" })
  createdAt!: Date;

  @Column({ name: "updated_at", type: "timestamptz", default: () => "now()" })
  updatedAt!: Date;

  // Relations populated by TypeORM
  visualizations?: any[];
  alerts?: any[];

  get parameters(): Array<{ name: string; value?: unknown }> {
    return (this.options?.parameters as any[]) ?? [];
  }

  toDict(): Record<string, unknown> {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      query: this.queryText,
      query_hash: this.queryHash,
      is_archived: this.isArchived,
      is_draft: this.isDraft,
      tags: this.tags,
      schedule: this.schedule,
      data_source_id: this.dataSourceId,
      latest_query_data_id: this.latestQueryDataId,
    };
  }
}
