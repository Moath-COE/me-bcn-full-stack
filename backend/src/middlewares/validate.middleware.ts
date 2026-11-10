import type { NextFunction, Request, Response } from "express";
import type { ZodType } from "zod";

export function validateBody(schema: ZodType) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    req.body = schema.parse(req.body);

    next();
  };
}

// Express 5's `req.query` is read-only, so the parsed query goes on `res.locals.query`.
export function validateQuery(schema: ZodType) {
  return (req: Request, res: Response, next: NextFunction): void => {
    res.locals.query = schema.parse(req.query);

    next();
  };
}
