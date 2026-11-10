import { toNodeHandler } from "better-auth/node";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { pinoHttp } from "pino-http";

import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { postLivekitWebhook } from "./controllers/livekit-webhook.controller.js";
import { auth } from "./lib/auth.js";
import { errorHandler, notFoundHandler } from "./middlewares/error.middleware.js";
import { apiRateLimiter } from "./middlewares/rate-limit.middleware.js";
import routes from "./routes/index.js";

const app = express();

app.disable("x-powered-by");

// The web proxies requests here; trust its x-forwarded-for so req.ip is the student's IP.
app.set("trust proxy", env.TRUST_PROXY_HOPS);

app.use(helmet());

app.use(
  cors({
    // Exactly the web and admin origins, never "*": credentials are on.
    origin: [new URL(env.CORS_ORIGIN).origin, env.ADMIN_ORIGIN],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"], // Specify allowed HTTP methods
    credentials: true
  })
);

app.use(apiRateLimiter);

app.use(
  pinoHttp({
    logger,
    customSuccessMessage: (req, res, responseTime) =>
      `${req.method} ${req.url} → ${res.statusCode} (${responseTime} ms)`,
    customErrorMessage: (req, res) => `${req.method} ${req.url} → ${res.statusCode}`
  })
);

// Must stay before express.json(): Better Auth reads the raw body itself.
app.all("/api/auth/*splat", toNodeHandler(auth));

// Signature verification hashes the exact body bytes, before JSON parsing.
app.post(
  "/api/v1/livekit/webhook",
  express.raw({ type: ["application/webhook+json", "application/json"], limit: "1mb" }),
  postLivekitWebhook
);

app.use(
  express.json({
    limit: "1mb"
  })
);

app.use(
  express.urlencoded({
    extended: true,
    limit: "1mb"
  })
);

app.use("/api/v1", routes);

app.use(notFoundHandler);

app.use(errorHandler);

export default app;
