import { db } from "../db/index.js";

export type InstitutionWithMajors = {
  id: string;
  nameAr: string;
  nameEn: string;
  majors: { id: string; nameAr: string; nameEn: string }[];
};

export async function findInstitutionsWithMajors(): Promise<InstitutionWithMajors[]> {
  return db.query.institution.findMany({
    columns: { id: true, nameAr: true, nameEn: true },
    orderBy: { sortOrder: "asc", nameAr: "asc" },
    with: {
      majors: {
        columns: { id: true, nameAr: true, nameEn: true },
        orderBy: { sortOrder: "asc", nameAr: "asc" }
      }
    }
  });
}

export async function institutionExists(id: string): Promise<boolean> {
  const row = await db.query.institution.findFirst({
    columns: { id: true },
    where: { id }
  });

  return row !== undefined;
}

export async function findMajorInstitutionId(
  majorId: string
): Promise<string | undefined> {
  const row = await db.query.major.findFirst({
    columns: { institutionId: true },
    where: { id: majorId }
  });

  return row?.institutionId;
}
