import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn,
} from "typeorm";
import { Query } from "./query";

@Entity("visualizations")
export class Visualization {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: "query_id" })
  queryId!: number;

  @ManyToOne(() => Query, (q) => q.visualizations, { onDelete: "CASCADE" })
  @JoinColumn({ name: "query_id" })
  queryRel?: Query;

  @Column({ length: 255 })
  name!: string;

  @Column({ length: 100 })
  type!: string;

  @Column({ length: 4096, nullable: true })
  description?: string;

  @Column({ type: "jsonb", default: {} })
  options!: Record<string, unknown>;

  @Column({ name: "created_at", type: "timestamptz", default: () => "now()" })
  createdAt!: Date;

  @Column({ name: "updated_at", type: "timestamptz", default: () => "now()" })
  updatedAt!: Date;

  toDict(): Record<string, unknown> {
    return {
      id: this.id,
      type: this.type,
      name: this.name,
      description: this.description,
      options: this.options,
      updated_at: this.updatedAt,
      created_at: this.createdAt,
    };
  }
}
