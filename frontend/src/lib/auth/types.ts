import type { authClient } from "./client";

export type AccountSession = typeof authClient.$Infer.Session;
export type Account = AccountSession["user"];
