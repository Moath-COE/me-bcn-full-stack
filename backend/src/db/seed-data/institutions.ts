// Institutions and Majors offered at sign-up. Ids are stable slugs that Accounts reference, so
// never rename one; add a new row instead. Each Major id is prefixed with its Institution id.

type SeedMajor = { id: string; nameAr: string; nameEn: string };

type SeedInstitution = {
  id: string;
  nameAr: string;
  nameEn: string;
  majors: SeedMajor[];
};

export const institutionSeed: SeedInstitution[] = [
  {
    id: "ksu",
    nameAr: "جامعة الملك سعود",
    nameEn: "King Saud University",
    majors: [
      { id: "ksu-cs", nameAr: "علوم الحاسب", nameEn: "Computer Science" },
      { id: "ksu-is", nameAr: "نظم المعلومات", nameEn: "Information Systems" },
      { id: "ksu-se", nameAr: "هندسة البرمجيات", nameEn: "Software Engineering" },
      { id: "ksu-med", nameAr: "الطب", nameEn: "Medicine" },
      { id: "ksu-ba", nameAr: "إدارة الأعمال", nameEn: "Business Administration" }
    ]
  },
  {
    id: "kau",
    nameAr: "جامعة الملك عبدالعزيز",
    nameEn: "King Abdulaziz University",
    majors: [
      { id: "kau-cs", nameAr: "علوم الحاسبات", nameEn: "Computer Science" },
      { id: "kau-it", nameAr: "تقنية المعلومات", nameEn: "Information Technology" },
      { id: "kau-ee", nameAr: "الهندسة الكهربائية", nameEn: "Electrical Engineering" },
      { id: "kau-med", nameAr: "الطب", nameEn: "Medicine" },
      { id: "kau-acc", nameAr: "المحاسبة", nameEn: "Accounting" }
    ]
  },
  {
    id: "imamu",
    nameAr: "جامعة الإمام محمد بن سعود الإسلامية",
    nameEn: "Imam Mohammad Ibn Saud Islamic University",
    majors: [
      { id: "imamu-cs", nameAr: "علوم الحاسب", nameEn: "Computer Science" },
      { id: "imamu-is", nameAr: "نظم المعلومات", nameEn: "Information Systems" },
      { id: "imamu-sharia", nameAr: "الشريعة", nameEn: "Sharia" },
      { id: "imamu-law", nameAr: "القانون", nameEn: "Law" },
      { id: "imamu-arabic", nameAr: "اللغة العربية", nameEn: "Arabic Language" }
    ]
  }
];
