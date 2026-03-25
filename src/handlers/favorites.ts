import { Router, Request, Response, NextFunction } from "express";
import { Entity, PrimaryGeneratedColumn, Column, Unique } from "typeorm";
import { AppDataSource } from "../models/connection";
import { requireAuth } from "../authentication/middleware";

@Entity("favorites")
@Unique(["userId", "objectType", "objectId"])
class Favorite {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: "user_id" })
  userId!: number;

  @Column({ name: "object_type", length: 50 })
  objectType!: string;

  @Column({ name: "object_id" })
  objectId!: number;

  @Column({ name: "created_at", type: "timestamptz", default: () => "now()" })
  createdAt!: Date;
}

async function toggleFavorite(
  userId: number,
  objectType: string,
  objectId: number,
  add: boolean
): Promise<void> {
  const repo = AppDataSource.getRepository(Favorite);
  if (add) {
    const existing = await repo.findOne({ where: { userId, objectType, objectId } });
    if (!existing) {
      await repo.save(repo.create({ userId, objectType, objectId } as Partial<Favorite>));
    }
  } else {
    await repo.delete({ userId, objectType, objectId });
  }
}

export const favoritesRouter = Router();

// POST /api/queries/:id/favorite
favoritesRouter.post("/queries/:id/favorite", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as any).currentUser;
    await toggleFavorite(user.id, "Query", parseInt(req.params.id), true);
    res.status(204).send();
  } catch (e) { next(e); }
});

// DELETE /api/queries/:id/favorite
favoritesRouter.delete("/queries/:id/favorite", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as any).currentUser;
    await toggleFavorite(user.id, "Query", parseInt(req.params.id), false);
    res.status(204).send();
  } catch (e) { next(e); }
});

// GET /api/queries/favorites
favoritesRouter.get("/queries/favorites", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as any).currentUser;
    const favs = await AppDataSource.getRepository(Favorite).find({
      where: { userId: user.id, objectType: "Query" },
    });
    res.json(favs.map((f) => f.objectId));
  } catch (e) { next(e); }
});

// POST /api/dashboards/:id/favorite
favoritesRouter.post("/dashboards/:id/favorite", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as any).currentUser;
    await toggleFavorite(user.id, "Dashboard", parseInt(req.params.id), true);
    res.status(204).send();
  } catch (e) { next(e); }
});

// DELETE /api/dashboards/:id/favorite
favoritesRouter.delete("/dashboards/:id/favorite", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as any).currentUser;
    await toggleFavorite(user.id, "Dashboard", parseInt(req.params.id), false);
    res.status(204).send();
  } catch (e) { next(e); }
});

// GET /api/dashboards/favorites
favoritesRouter.get("/dashboards/favorites", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as any).currentUser;
    const favs = await AppDataSource.getRepository(Favorite).find({
      where: { userId: user.id, objectType: "Dashboard" },
    });
    res.json(favs.map((f) => f.objectId));
  } catch (e) { next(e); }
});
