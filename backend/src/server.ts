import app from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { db } from "./db/index.js";

async function startServer() {
  try {
    await db.execute("SELECT 1");

    const server = app.listen(env.PORT, () => {
      logger.info(`Server listening on port ${env.PORT}`);
    });

    server.on("error", async (error) => {
      logger.fatal({ error }, "HTTP server error");
      await db.$client.end();
      process.exit(1);
    });

    const shutdown = (signal: string) => {
      logger.info({ signal }, "Shutting down server");

      server.close(async (error) => {
        if (error) {
          logger.error({ error }, "Error shutting down server");
          process.exit(1);
        }

        await db.$client.end();
        logger.info("Server shut down successfully");
        process.exit(0);
      });

      setTimeout(() => {
        logger.error("Forced shutdown after timeout");
        process.exit(1);
      }, 10_000).unref();
    };

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
  } catch (error) {
    logger.fatal({ error }, "Failed to start server");
    await db.$client.end();
    process.exit(1);
  }
}

process.on("uncaughtException", (error) => {
  logger.fatal({ error }, "Uncaught exception");
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  logger.fatal({ reason }, "Unhandled rejection");
  process.exit(1);
});

void startServer();
