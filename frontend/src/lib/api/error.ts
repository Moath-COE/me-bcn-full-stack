import { z } from "zod";

/** The error body every `/api/v1` route answers with. `code` is stable; `message` is for logs. */
export const backendErrorSchema = z.object({
  error: z.object({ message: z.string(), code: z.string().optional() }),
});
