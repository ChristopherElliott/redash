import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn,
} from "typeorm";
import { Organization } from "./organization";
import { User } from "./user";

@Entity("notification_destinations")
export class NotificationDestination {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: "org_id" })
  orgId!: number;

  @ManyToOne(() => Organization)
  @JoinColumn({ name: "org_id" })
  org?: Organization;

  @Column({ name: "user_id" })
  userId!: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: "user_id" })
  user?: User;

  @Column({ length: 255 })
  name!: string;

  @Column({ length: 255 })
  type!: string;

  @Column({ type: "text", nullable: true })
  icon?: string;

  /** Encrypted options stored as JSON text */
  @Column({ name: "encrypted_options", type: "text", nullable: true })
  encryptedOptions?: string;

  options?: Record<string, unknown>;

  @Column({ name: "created_at", type: "timestamptz", default: () => "now()" })
  createdAt!: Date;

  @Column({ name: "updated_at", type: "timestamptz", default: () => "now()" })
  updatedAt!: Date;

  toDict(all = false): Record<string, unknown> {
    const d: Record<string, unknown> = {
      id: this.id,
      name: this.name,
      type: this.type,
      icon: this.icon,
    };
    if (all) d.options = this.options ?? {};
    return d;
  }
}
