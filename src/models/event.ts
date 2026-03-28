import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from "typeorm";
import { Organization } from "./organization";

@Entity("events")
export class Event {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: "org_id", nullable: true })
  orgId?: number;

  @ManyToOne(() => Organization)
  @JoinColumn({ name: "org_id" })
  org?: Organization;

  @Column({ name: "user_id", nullable: true })
  userId?: number;

  @Column({ name: "user_name", length: 320, nullable: true })
  userName?: string;

  @Column({ length: 255 })
  action!: string;

  @Column({ name: "object_type", length: 255, nullable: true })
  objectType?: string;

  @Column({ name: "object_id", nullable: true })
  objectId?: number;

  @Column({ type: "jsonb", nullable: true })
  additional?: Record<string, unknown>;

  @Column({ name: "created_at", type: "timestamptz", default: () => "now()" })
  createdAt!: Date;

  toDict(): Record<string, unknown> {
    return {
      id: this.id,
      org_id: this.orgId,
      user_id: this.userId,
      user_name: this.userName,
      action: this.action,
      object_type: this.objectType,
      object_id: this.objectId,
      additional: this.additional,
      created_at: this.createdAt,
    };
  }
}
