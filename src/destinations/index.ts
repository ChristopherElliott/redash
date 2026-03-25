import logger from "../logger";

export interface AlertLike {
  id: number;
  name: string;
  customSubject?: string;
  customBody?: string;
  options?: Record<string, unknown>;
}

export interface QueryLike {
  id: number;
  queryText?: string;
}

export interface UserLike {
  id: number;
  name: string;
  email: string;
}

export type AlertState = "triggered" | "ok" | "unknown";

export interface NotifyOptions {
  alert: AlertLike;
  query: QueryLike;
  user: UserLike;
  newState: AlertState;
  host: string;
  metadata?: Record<string, unknown>;
  options: Record<string, unknown>;
}

export abstract class BaseDestination {
  static deprecated = false;

  constructor(protected configuration: Record<string, unknown>) {}

  static destinationName(): string {
    return this.name;
  }

  static destinationType(): string {
    return this.name.toLowerCase();
  }

  static icon(): string {
    return "fa-bullseye";
  }

  static enabled(): boolean {
    return true;
  }

  static configurationSchema(): Record<string, unknown> {
    return {};
  }

  static toDict(): Record<string, unknown> {
    return {
      name: this.destinationName(),
      type: this.destinationType(),
      icon: this.icon(),
      configuration_schema: this.configurationSchema(),
      ...(this.deprecated ? { deprecated: true } : {}),
    };
  }

  abstract notify(params: NotifyOptions): Promise<void>;
}

type DestinationConstructor = new (
  configuration: Record<string, unknown>
) => BaseDestination;
interface DestinationClass extends DestinationConstructor {
  enabled(): boolean;
  destinationName(): string;
  destinationType(): string;
  configurationSchema(): Record<string, unknown>;
  toDict(): Record<string, unknown>;
}

const destinations = new Map<string, DestinationClass>();

export function register(destinationClass: DestinationClass): void {
  if (destinationClass.enabled()) {
    logger.debug(
      `Registering ${destinationClass.destinationName()} (${destinationClass.destinationType()}) destination.`
    );
    destinations.set(destinationClass.destinationType(), destinationClass);
  } else {
    logger.warn(
      `${destinationClass.destinationName()} destination enabled but not supported, not registering.`
    );
  }
}

export function getDestination(
  destinationType: string,
  configuration: Record<string, unknown>
): BaseDestination | null {
  const cls = destinations.get(destinationType);
  if (!cls) return null;
  return new cls(configuration);
}

export function getConfigurationSchemaForDestinationType(
  destinationType: string
): Record<string, unknown> | null {
  const cls = destinations.get(destinationType);
  if (!cls) return null;
  return cls.configurationSchema();
}

export function getAllDestinations(): Record<string, unknown>[] {
  return Array.from(destinations.values()).map((cls) => cls.toDict());
}

export function importDestinations(): void {
  // Eagerly import all built-in destinations
  require("./slack");
  require("./email");
  require("./webhook");
  require("./pagerduty");
  require("./discord");
  require("./microsoftTeams");
  require("./mattermost");
  require("./asana");
  require("./chatwork");
  require("./datadog");
  require("./hangoutsChat");
  require("./webex");
}
