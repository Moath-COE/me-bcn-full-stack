// Usage: pnpm admin:promote <email>
// Gives an existing Account the Admin Role. It writes to the database named by DATABASE_URL.
import { logger } from "../config/logger.js";
import { db } from "../db/index.js";
import { promoteToAdmin } from "../services/account.service.js";
import { AppError } from "../utils/app-error.js";

const email = process.argv[2]?.trim();

if (!email || process.argv.length > 3) {
  logger.error("Usage: pnpm admin:promote <email>");
  process.exit(1);
}

try {
  const { userId, alreadyAdmin } = await promoteToAdmin(email);

  logger.info(
    { userId },
    alreadyAdmin ? "Account is already an Admin" : "Account promoted to Admin"
  );
} catch (error) {
  if (error instanceof AppError) {
    logger.error({ code: error.code }, error.message);
  } else {
    logger.error({ error }, "Failed to promote Account");
  }
  process.exitCode = 1;
} finally {
  await db.$client.end();
}
