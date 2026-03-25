import { DataSource as OrmDataSource } from "typeorm";
import { DATABASE_URL } from "../settings";

import { Organization } from "./organization";
import { User } from "./user";
import { Group } from "./group";
import { Query, QueryResult } from "./query";
import { Alert, AlertSubscription } from "./alert";
import { Event } from "./event";
import { Dashboard, Widget } from "./dashboard";
import { Visualization } from "./visualization";
import { NotificationDestination } from "./notificationDestination";
import { DataSource } from "./dataSource";

export const AppDataSource = new OrmDataSource({
  type: "postgres",
  url: DATABASE_URL,
  entities: [
    Organization,
    User,
    Group,
    Query,
    QueryResult,
    Alert,
    AlertSubscription,
    Event,
    Dashboard,
    Widget,
    Visualization,
    NotificationDestination,
    DataSource,
  ],
  synchronize: false,
  logging: process.env.NODE_ENV === "development",
});
