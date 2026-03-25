import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, OneToMany,
} from "typeorm";
import { Organization } from "./organization";

export const BUILTIN_GROUPS = ["admin", "default"] as const;
export type BuiltinGroup = typeof BUILTIN_GROUPS[number];

@Entity("groups")
export class Group {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: "org_id" })
  orgId!: number;

  @ManyToOne(() => Organization)
  @JoinColumn({ name: "org_id" })
  org?: Organization;

  @Column({ length: 100 })
  name!: string;

  @Column({ length: 15, nullable: true })
  type?: string;

  @Column({ type: "text", array: true, nullable: true })
  permissions?: string[];

  @Column({ name: "created_at", type: "timestamptz", default: () => "now()" })
  createdAt!: Date;

  // Populated via DataSourceGroup
  dataSources?: any[];
}
