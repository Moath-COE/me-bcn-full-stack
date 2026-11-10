import { and, asc, eq, isNull } from "drizzle-orm";

import { db, type DbTransaction } from "../db/index.js";
import { plan, planAssignment, user } from "../db/schema/index.js";

export async function insertDefaultPlanAssignment(
  userId: string,
  startsAt: Date
): Promise<void> {
  await db
    .insert(planAssignment)
    .values({ userId, planId: "free", startsAt, source: "default" });
}

function currentPlanAssignmentQuery(
  connection: Pick<typeof db, "select">,
  userId: string
) {
  return connection
    .select({
      id: plan.id,
      nameAr: plan.nameAr,
      nameEn: plan.nameEn,
      sessionsPerPeriod: plan.sessionsPerPeriod,
      secondsPerPeriod: plan.secondsPerPeriod,
      maxActiveEnrollments: plan.maxActiveEnrollments,
      maxSessionSeconds: plan.maxSessionSeconds,
      minStartSeconds: plan.minStartSeconds,
      startsAt: planAssignment.startsAt
    })
    .from(planAssignment)
    .innerJoin(plan, eq(planAssignment.planId, plan.id))
    .where(and(eq(planAssignment.userId, userId), isNull(planAssignment.endsAt)));
}

export async function findCurrentPlanAssignment(userId: string) {
  const [assignment] = await currentPlanAssignmentQuery(db, userId);

  return assignment;
}

export async function lockCurrentPlanAssignment(tx: DbTransaction, userId: string) {
  const [assignment] = await currentPlanAssignmentQuery(tx, userId).for("update", {
    of: planAssignment
  });

  return assignment;
}

export async function findAllPlans() {
  return db.select().from(plan).orderBy(plan.id);
}

// Plans shown on the pricing pages, in display order.
export async function findListedPlans() {
  return db
    .select()
    .from(plan)
    .where(eq(plan.isListed, true))
    .orderBy(asc(plan.sortOrder), asc(plan.id));
}

// The current Plan assignment of every Student (Admin Accounts excluded), in one query.
export async function findStudentPlanAssignments() {
  return db
    .select({
      userId: planAssignment.userId,
      planId: planAssignment.planId,
      startsAt: planAssignment.startsAt,
      sessionsPerPeriod: plan.sessionsPerPeriod,
      secondsPerPeriod: plan.secondsPerPeriod
    })
    .from(planAssignment)
    .innerJoin(plan, eq(planAssignment.planId, plan.id))
    .innerJoin(user, eq(planAssignment.userId, user.id))
    .where(and(isNull(planAssignment.endsAt), eq(user.role, "user")));
}
