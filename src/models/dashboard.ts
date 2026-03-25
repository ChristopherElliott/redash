import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany, JoinColumn,
} from "typeorm";
import { Organization } from "./organization";
import { User } from "./user";

@Entity("dashboards")
export class Dashboard {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: "version", default: 1 })
  version!: number;

  @Column({ name: "org_id" })
  orgId!: number;

  @ManyToOne(() => Organization)
  @JoinColumn({ name: "org_id" })
  org?: Organization;

  @Column({ length: 100 })
  name!: string;

  @Column({ length: 100, unique: true })
  slug!: string;

  @Column({ name: "user_id" })
  userId!: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: "user_id" })
  user?: User;

  @Column({ name: "layout", type: "text", nullable: true })
  layout?: string;

  @Column({ name: "is_archived", default: false })
  isArchived!: boolean;

  @Column({ name: "is_draft", default: true })
  isDraft!: boolean;

  @Column({ type: "jsonb", nullable: true })
  options?: Record<string, unknown>;

  @Column({ type: "text", array: true, nullable: true })
  tags?: string[];

  @Column({ name: "created_at", type: "timestamptz", default: () => "now()" })
  createdAt!: Date;

  @Column({ name: "updated_at", type: "timestamptz", default: () => "now()" })
  updatedAt!: Date;

  widgets?: Widget[];
}

@Entity("widgets")
export class Widget {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: "dashboard_id" })
  dashboardId!: number;

  @ManyToOne(() => Dashboard)
  @JoinColumn({ name: "dashboard_id" })
  dashboard?: Dashboard;

  @Column({ name: "visualization_id", nullable: true })
  visualizationId?: number;

  @Column({ type: "text", nullable: true })
  text?: string;

  @Column({ name: "width", default: 1 })
  width!: number;

  @Column({ type: "jsonb", nullable: true })
  options?: Record<string, unknown>;

  @Column({ name: "created_at", type: "timestamptz", default: () => "now()" })
  createdAt!: Date;

  @Column({ name: "updated_at", type: "timestamptz", default: () => "now()" })
  updatedAt!: Date;
}
