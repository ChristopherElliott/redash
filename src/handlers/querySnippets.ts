import { Router, Request, Response, NextFunction } from "express";
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from "typeorm";
import { AppDataSource } from "../models/connection";
import { Organization } from "../models/organization";
import { User } from "../models/user";
import { requireAuth } from "../authentication/middleware";
import { getObjectOr404, requireFields } from "./base";

// ─── QuerySnippet entity (defined here since it wasn't in models/index) ──────

@Entity("query_snippets")
class QuerySnippet {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: "org_id" })
  orgId!: number;

  @Column({ name: "user_id" })
  userId!: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: "user_id" })
  user?: User;

  @Column({ length: 255 })
  trigger!: string;

  @Column({ type: "text", nullable: true })
  description?: string;

  @Column({ type: "text" })
  snippet!: string;

  @Column({ name: "created_at", type: "timestamptz", default: () => "now()" })
  createdAt!: Date;

  @Column({ name: "updated_at", type: "timestamptz", default: () => "now()" })
  updatedAt!: Date;

  toDict(): Record<string, unknown> {
    return {
      id: this.id,
      trigger: this.trigger,
      description: this.description,
      snippet: this.snippet,
      user_id: this.userId,
      created_at: this.createdAt,
      updated_at: this.updatedAt,
    };
  }
}

export const querySnippetsRouter = Router();

// GET /api/query_snippets
querySnippetsRouter.get("/", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const org = (req as any).currentOrg;
    const snippets = await AppDataSource.getRepository(QuerySnippet).find({ where: { orgId: org.id } });
    res.json(snippets.map((s) => s.toDict()));
  } catch (e) { next(e); }
});

// POST /api/query_snippets
querySnippetsRouter.post("/", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const org = (req as any).currentOrg;
    const user = (req as any).currentUser;
    requireFields(req.body, ["trigger", "snippet"]);
    const repo = AppDataSource.getRepository(QuerySnippet);
    const s = repo.create({
      trigger: req.body.trigger,
      description: req.body.description,
      snippet: req.body.snippet,
      orgId: org.id,
      userId: user.id,
    } as Partial<QuerySnippet>);
    await repo.save(s);
    res.status(201).json(s.toDict());
  } catch (e) { next(e); }
});

// GET /api/query_snippets/:id
querySnippetsRouter.get("/:id", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const s = await getObjectOr404(() =>
      AppDataSource.getRepository(QuerySnippet).findOne({ where: { id: parseInt(req.params.id) } })
    );
    res.json(s.toDict());
  } catch (e) { next(e); }
});

// POST /api/query_snippets/:id (update)
querySnippetsRouter.post("/:id", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const repo = AppDataSource.getRepository(QuerySnippet);
    const s = await getObjectOr404(() => repo.findOne({ where: { id: parseInt(req.params.id) } }));
    if (req.body.trigger) s.trigger = req.body.trigger;
    if (req.body.description !== undefined) s.description = req.body.description;
    if (req.body.snippet) s.snippet = req.body.snippet;
    await repo.save(s);
    res.json(s.toDict());
  } catch (e) { next(e); }
});

// DELETE /api/query_snippets/:id
querySnippetsRouter.delete("/:id", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const repo = AppDataSource.getRepository(QuerySnippet);
    const s = await getObjectOr404(() => repo.findOne({ where: { id: parseInt(req.params.id) } }));
    await repo.remove(s);
    res.status(204).send();
  } catch (e) { next(e); }
});
