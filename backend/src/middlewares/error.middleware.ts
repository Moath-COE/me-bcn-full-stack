import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";

import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { AppError } from "../utils/app-error.js";

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({
    error: {
      message: `Route ${req.method} ${req.originalUrl} not found`
    }
  });
};

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof ZodError) {
    res.status(400).json({
      error: {
        message: "Invalid request",
        code: "INVALID_REQUEST",
        details: error.flatten()
      }
    });

    return;
  }

  if (error instanceof AppError) {
    res.status(error.statusCode).json({
      error: {
        message: error.message,
        code: error.code
      }
    });

    return;
  }

  logger.error({ error }, "Unhandled application error");

  res.status(500).json({
    error: {
      message: "Internal server error",
      ...(env.NODE_ENV !== "production" && {
        details: error instanceof Error ? error.message : error
      })
    }
  });
};
