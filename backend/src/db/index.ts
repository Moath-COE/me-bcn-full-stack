import { drizzle } from "drizzle-orm/node-postgres";
import { env } from "../config/env.js";
import { authRelations, catalogRelations, institutionRelations } from "./schema/index.js";

export const db = drizzle({
  connection: {
    connectionString: env.DATABASE_URL,
    connectionTimeoutMillis: 5_000
  },
  relations: { ...authRelations, ...institutionRelations, ...catalogRelations }
});

export type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
