import "server-only";

import { headers } from "next/headers";
import { readBackend } from "@/lib/api/backend";
import { studentHeaders } from "@/lib/api/forwarded-headers";
import { courseSchema, coursesSchema, enrollmentsSchema } from "./schema";

/** The public catalog, cached for five minutes. */
export function getCourses() {
  return readBackend("/courses", coursesSchema, { next: { revalidate: 300 } });
}

export function getCourse(id: string) {
  return readBackend(`/courses/${encodeURIComponent(id)}`, courseSchema, { next: { revalidate: 300 } });
}

/** The signed-in student's active enrollments. */
export async function getEnrollments() {
  // Read the request outside readBackend's try/catch so Next.js still sees the dynamic-rendering signal.
  const forwarded = studentHeaders(await headers());
  return readBackend("/me/enrollments", enrollmentsSchema, { headers: forwarded, cache: "no-store" });
}
