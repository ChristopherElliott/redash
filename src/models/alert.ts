import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany, JoinColumn,
} from "typeorm";
import { User } from "./user";
import { Query } from "./query";

export const TRIGGERED_STATE = "triggered";
export const OK_STATE = "ok";
export const UNKNOWN_STATE = "unknown";

@Entity("alerts")
export class Alert {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ length: 255 })
  name!: string;

  @Column({ name: "query_id" })
  queryId!: number;

  @ManyToOne(() => Query)
  @JoinColumn({ name: "query_id" })
  query?: Query;

  @Column({ name: "user_id" })
  userId!: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: "user_id" })
  user?: User;

  @Column({ type: "jsonb", default: {} })
  options!: {
    column?: string;
    op?: string;
    value?: number | string;
    custom_body?: string;
    custom_subject?: string;
  };

  @Column({ length: 20, default: UNKNOWN_STATE })
  state!: string;

  @Column({ nullable: true })
  rearm?: number;

  @Column({ name: "last_triggered_at", type: "timestamptz", nullable: true })
  lastTriggeredAt?: Date;

  @Column({ default: false })
  muted!: boolean;

  @Column({ name: "created_at", type: "timestamptz", default: () => "now()" })
  createdAt!: Date;

  @Column({ name: "updated_at", type: "timestamptz", default: () => "now()" })
  updatedAt!: Date;

  subscriptions?: AlertSubscription[];

  evaluate(): string {
    const qr = (this.query as any)?.latestQueryData;
    if (!qr?.data) return UNKNOWN_STATE;

    let data: { rows?: Record<string, unknown>[] };
    try {
      data = JSON.parse(qr.data);
    } catch {
      return UNKNOWN_STATE;
    }

    const rows = data.rows ?? [];
    if (!rows.length) return UNKNOWN_STATE;

    const col = this.options.column;
    const op = this.options.op;
    const threshold = Number(this.options.value);
    const value = Number(rows[0][col ?? ""]);

    if (isNaN(value) || isNaN(threshold)) return UNKNOWN_STATE;

    let triggered = false;
    switch (op) {
      case ">": triggered = value > threshold; break;
      case ">=": triggered = value >= threshold; break;
      case "<": triggered = value < threshold; break;
      case "<=": triggered = value <= threshold; break;
      case "==": triggered = value === threshold; break;
      case "!=": triggered = value !== threshold; break;
    }

    return triggered ? TRIGGERED_STATE : OK_STATE;
  }
}

@Entity("alert_subscriptions")
export class AlertSubscription {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: "alert_id" })
  alertId!: number;

  @ManyToOne(() => Alert)
  @JoinColumn({ name: "alert_id" })
  alert?: Alert;

  @Column({ name: "user_id" })
  userId!: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: "user_id" })
  user?: User;

  @Column({ name: "destination_id", nullable: true })
  destinationId?: number;

  @Column({ name: "created_at", type: "timestamptz", default: () => "now()" })
  createdAt!: Date;

  async notify(
    alert: Alert,
    newState: string,
    host: string,
    metadata: Record<string, unknown>
  ): Promise<void> {
    if (!this.destinationId) return;
    const { AppDataSource } = await import("./connection");
    const dest = await AppDataSource.getRepository("NotificationDestination").findOne({
      where: { id: this.destinationId },
    });
    if (!dest) return;
    const { getDestination } = await import("../destinations");
    const destInstance = getDestination((dest as any).type, (dest as any).options ?? {});
    if (!destInstance) return;
    if (!alert.query || !this.user) return;
    await destInstance.notify({
      alert,
      query: alert.query,
      user: this.user,
      newState: newState as import("../destinations").AlertState,
      host,
      metadata,
      options: (dest as any).options,
    });
  }
}
