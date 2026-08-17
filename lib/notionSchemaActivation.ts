export const REQUIRED_PROJECTS_SCHEMA_PROPERTY = {
  name: "Summary IT",
  type: "rich_text",
} as const;

type NotionSchemaResponse = {
  properties?: unknown;
};

export type ProjectsSchemaClient = {
  databases: {
    retrieve: (params: { database_id: string }) => Promise<NotionSchemaResponse>;
  };
};

type RequiredProperty = typeof REQUIRED_PROJECTS_SCHEMA_PROPERTY;

type SchemaPlanBase = {
  databaseId: string | null;
  requiredProperty: RequiredProperty;
  observedProperty: {
    name: RequiredProperty["name"];
    type: string | null;
  };
  applyAllowed: false;
};

export type ProjectsSchemaDryRunPlan = SchemaPlanBase & (
  | {
    state: "ready";
    proposedAction: { kind: "none" };
  }
  | {
    state: "changes-required";
    proposedAction: { kind: "add-property"; property: RequiredProperty };
  }
  | {
    state: "blocked";
    proposedAction: { kind: "none" };
    reason:
      | "missing-notion-token"
      | "missing-projects-database-id"
      | "missing-schema-client"
      | "provider-read-error"
      | "unexpected-schema-response"
      | "required-property-has-wrong-type";
  }
);

export function resolveProjectsDatabaseId(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): string | undefined {
  return environment.NOTION_PROJECTS_DATABASE_ID || environment.NOTION_DATABASE_ID;
}

function planBase(databaseId: string | null, observedType: string | null): SchemaPlanBase {
  return {
    databaseId,
    requiredProperty: REQUIRED_PROJECTS_SCHEMA_PROPERTY,
    observedProperty: {
      name: REQUIRED_PROJECTS_SCHEMA_PROPERTY.name,
      type: observedType,
    },
    applyAllowed: false,
  };
}

function blockedPlan(
  databaseId: string | null,
  reason: Extract<ProjectsSchemaDryRunPlan, { state: "blocked" }>["reason"],
  observedType: string | null = null,
): ProjectsSchemaDryRunPlan {
  return {
    ...planBase(databaseId, observedType),
    state: "blocked",
    proposedAction: { kind: "none" },
    reason,
  };
}

export async function inspectProjectsSchema(params: {
  token?: string;
  databaseId?: string;
  client?: ProjectsSchemaClient;
}): Promise<ProjectsSchemaDryRunPlan> {
  const databaseId = params.databaseId || null;
  if (!params.token) return blockedPlan(databaseId, "missing-notion-token");
  if (!databaseId) return blockedPlan(null, "missing-projects-database-id");
  if (!params.client) return blockedPlan(databaseId, "missing-schema-client");

  let schema: NotionSchemaResponse;
  try {
    schema = await params.client.databases.retrieve({ database_id: databaseId });
  } catch {
    return blockedPlan(databaseId, "provider-read-error");
  }

  if (!schema.properties || typeof schema.properties !== "object" || Array.isArray(schema.properties)) {
    return blockedPlan(databaseId, "unexpected-schema-response");
  }

  const property = (schema.properties as Record<string, unknown>)[REQUIRED_PROJECTS_SCHEMA_PROPERTY.name];
  if (property === undefined) {
    return {
      ...planBase(databaseId, null),
      state: "changes-required",
      proposedAction: { kind: "add-property", property: REQUIRED_PROJECTS_SCHEMA_PROPERTY },
    };
  }

  if (!property || typeof property !== "object" || Array.isArray(property)) {
    return blockedPlan(databaseId, "unexpected-schema-response");
  }

  const type = (property as { type?: unknown }).type;
  if (typeof type !== "string") {
    return blockedPlan(databaseId, "unexpected-schema-response");
  }

  if (type !== REQUIRED_PROJECTS_SCHEMA_PROPERTY.type) {
    return blockedPlan(databaseId, "required-property-has-wrong-type", type);
  }

  return {
    ...planBase(databaseId, type),
    state: "ready",
    proposedAction: { kind: "none" },
  };
}
