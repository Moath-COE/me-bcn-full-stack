import { db } from "./index.js";
import { seedPlans } from "./seed.js";

// Plans only: for production, whose Catalog, Institutions and Majors are managed by hand (ADR 0007).
try {
  await seedPlans();
} finally {
  await db.$client.end();
}
