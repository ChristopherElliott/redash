import {
  Entity, PrimaryGeneratedColumn, Column, OneToMany,
} from "typeorm";
import type { Group } from "./group";

@Entity("organizations")
export class Organization {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ length: 255, unique: true })
  name!: string;

  @Column({ length: 255, unique: true })
  slug!: string;

  @Column({ type: "jsonb", default: {} })
  settings!: Record<string, unknown>;

  @Column({ name: "created_at", type: "timestamptz", default: () => "now()" })
  createdAt!: Date;

  @Column({ name: "is_disabled", default: false })
  isDisabled!: boolean;

  // populated by TypeORM or external queries
  dataSources?: any[];
  users?: any[];
  defaultGroup?: Group;

  get isPublic(): boolean {
    return !!this.settings?.is_public;
  }

  get googleAppsDomains(): string[] {
    return (this.settings?.google_apps_domains as string[]) ?? [];
  }

  hasUser(_email: string): number {
    // Requires pre-loaded users; returns count of matching users
    if (!this.users) return 0;
    return this.users.filter((u: any) => u.email === _email).length;
  }

  getSetting(key: string): unknown {
    return this.settings?.[key];
  }

  static async getBySlug(slug: string): Promise<Organization | null> {
    const { AppDataSource } = await import("./connection");
    return AppDataSource.getRepository(Organization).findOne({ where: { slug } });
  }
}
