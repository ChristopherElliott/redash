import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne,
  JoinColumn, Index, BaseEntity,
} from "typeorm";
import bcrypt from "bcryptjs";
import { Organization } from "./organization";
import { generateToken } from "../utils";

@Entity("users")
export class User extends BaseEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: "org_id" })
  orgId!: number;

  @ManyToOne(() => Organization)
  @JoinColumn({ name: "org_id" })
  org?: Organization;

  @Column({ length: 320 })
  name!: string;

  @Column({ unique: true })
  email!: string;

  @Column({ name: "password_hash", length: 128, nullable: true })
  passwordHash?: string;

  @Column({ type: "integer", array: true, nullable: true, name: "groups" })
  groupIds?: number[];

  @Column({ name: "api_key", length: 40, unique: true, default: () => `'${generateToken(40)}'` })
  apiKey!: string;

  @Column({ name: "is_invitation_pending", default: false })
  isInvitationPending!: boolean;

  @Column({ name: "profile_image_url", nullable: true })
  profileImageUrl?: string;

  @Column({ name: "disabled_at", type: "timestamptz", nullable: true })
  disabledAt?: Date;

  @Column({ name: "active_at", type: "timestamptz", nullable: true })
  activeAt?: Date;

  @Column({ type: "jsonb", nullable: true, default: {} })
  details?: Record<string, unknown>;

  @Column({ name: "created_at", type: "timestamptz", default: () => "now()" })
  createdAt!: Date;

  @Column({ name: "updated_at", type: "timestamptz", default: () => "now()" })
  updatedAt!: Date;

  get isDisabled(): boolean {
    return !!this.disabledAt;
  }

  get permissions(): string[] {
    return (this.details?.permissions as string[]) ?? [];
  }

  hasPermission(permission: string): boolean {
    return this.permissions.includes(permission);
  }

  hasPermissions(perms: string[]): boolean {
    return perms.every((p) => this.permissions.includes(p));
  }

  isApiUser(): boolean {
    return false;
  }

  async setPassword(password: string): Promise<void> {
    this.passwordHash = await bcrypt.hash(password, 10);
  }

  async verifyPassword(password: string): Promise<boolean> {
    if (!this.passwordHash) return false;
    return bcrypt.compare(password, this.passwordHash);
  }

  async updateGroupAssignments(groupNames: string[]): Promise<void> {
    const { AppDataSource } = await import("./connection");
    const { Group } = await import("./group");
    const groups = await AppDataSource.getRepository(Group).findBy(
      groupNames.map((name) => ({ name, orgId: this.orgId }))
    );
    this.groupIds = groups.map((g: { id: number }) => g.id);
    await this.save();
  }

  static async getByIdAndOrg(id: number, org: Organization): Promise<User | null> {
    return User.findOne({ where: { id, orgId: org.id } });
  }

  static async getByApiKeyAndOrg(apiKey: string, org: Organization): Promise<User | null> {
    return User.findOne({ where: { apiKey, orgId: org.id } });
  }

  static async getByEmailAndOrg(email: string, org: Organization): Promise<User> {
    const user = await User.findOne({ where: { email, orgId: org.id } });
    if (!user) throw new Error(`User not found: ${email}`);
    return user;
  }
}

/** Lightweight API user object (not a DB entity) */
export class ApiUser {
  id: string;
  org: Organization;
  groupIds: number[];
  permissions: string[];

  constructor(apiKey: string, org: Organization, groups: number[]) {
    this.id = apiKey;
    this.org = org;
    this.groupIds = groups;
    this.permissions = [];
  }

  isApiUser(): boolean {
    return true;
  }

  hasPermission(_: string): boolean {
    return false;
  }

  get isDisabled(): boolean {
    return false;
  }
}

/** Anonymous user */
export class AnonymousUser {
  isAuthenticated = false;
  isAnonymous = true;
  groupIds: number[] = [];
  permissions: string[] = [];

  isApiUser(): boolean {
    return false;
  }

  hasPermission(_: string): boolean {
    return false;
  }

  get isDisabled(): boolean {
    return false;
  }
}
