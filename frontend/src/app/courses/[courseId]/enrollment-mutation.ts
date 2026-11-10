import { backendErrorSchema } from "@/lib/api/error";
import { enrollmentSchema } from "@/lib/courses/schema";

export async function mutateEnrollment(courseId: string, method: "PUT" | "DELETE", refresh: () => void) {
  const response = await fetch(`/api/v1/me/enrollments/${encodeURIComponent(courseId)}`, {
    method,
    cache: "no-store",
  });
  if (!response.ok) {
    const parsed = backendErrorSchema.safeParse(await response.json());
    const code = parsed.success ? parsed.data.error.code : undefined;
    /* The last course slot can be taken after the page was read; refreshing re-reads the limits and
       the enrollments, and the page then shows the slots-full block. */
    if (method === "PUT" && response.status === 409 && code === "ENROLLMENT_LIMIT_REACHED") {
      refresh();
      return;
    }
    console.error("Enrollment request failed", { status: response.status, code });
    throw new Error("Enrollment request failed");
  }
  if (method === "PUT") {
    if (response.status !== 200 && response.status !== 201) throw new Error("Invalid enroll response");
    const enrollment = enrollmentSchema.parse(await response.json());
    if (enrollment.course.id !== courseId) throw new Error("Invalid enrollment course");
  } else if (response.status !== 204) {
    throw new Error("Invalid un-enroll response");
  }
  refresh();
}
