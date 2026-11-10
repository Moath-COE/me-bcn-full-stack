import { findInstitutionsWithMajors } from "../repositories/institution.repository.js";

// Matches the web's `Localized` type so it renders without mapping.
export type Localized = { ar: string; en: string };

export type InstitutionDto = {
  id: string;
  name: Localized;
  majors: { id: string; name: Localized }[];
};

export async function listInstitutions(): Promise<InstitutionDto[]> {
  const institutions = await findInstitutionsWithMajors();

  return institutions.map((institution) => ({
    id: institution.id,
    name: { ar: institution.nameAr, en: institution.nameEn },
    majors: institution.majors.map((major) => ({
      id: major.id,
      name: { ar: major.nameAr, en: major.nameEn }
    }))
  }));
}
