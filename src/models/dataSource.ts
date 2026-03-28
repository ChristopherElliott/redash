import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne,
  JoinColumn, Index,
} from "typeorm";
import { Organization } from "./organization";

// ─── DataSource entity ───────────────────────────────────────────────────────

@Entity("data_sources")
@Index(["orgId", "name"])
export class DataSource {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: "org_id" })
  orgId!: number;

  @ManyToOne(() => Organization, (o) => o.dataSources)
  @JoinColumn({ name: "org_id" })
  org?: Organization;

  @Column({ length: 255 })
  name!: string;

  @Column({ length: 255 })
  type!: string;

  /** Encrypted JSON configuration */
  @Column({ name: "encrypted_options", type: "text", nullable: true })
  encryptedOptions?: string;

  /** Decrypted config (populated at runtime) */
  options?: Record<string, unknown>;

  @Column({ name: "queue_name", length: 255, default: "queries" })
  queueName!: string;

  @Column({ name: "scheduled_queue_name", length: 255, default: "scheduled_queries" })
  scheduledQueueName!: string;

  @Column({ name: "created_at", type: "timestamptz", default: () => "now()" })
  createdAt!: Date;

  /** Paused flag is stored in Redis; populated at runtime */
  paused?: boolean;
  pauseReason?: string;
}
