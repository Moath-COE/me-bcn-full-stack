import type { chapter, course } from "../schema/catalog-schema.js";

type SeedCourse = Omit<typeof course.$inferInsert, "sortOrder" | "createdAt"> & {
  chapters: Omit<typeof chapter.$inferInsert, "courseId" | "createdAt">[];
};

// Catalog fixtures. Only becan-test has published content.
export const catalogSeed: SeedCourse[] = [
  {
    id: "becan-test",
    code: "TEST 101",
    nameAr: "مقرر تجريبي — فيزياء عامة",
    nameEn: "Test Course — General Physics",
    institutionId: "ksu",
    icon: "atom",
    tone: "deep",
    chapters: [
      {
        number: 1,
        titleAr: "الوحدات والأبعاد",
        titleEn: "Units and Dimensions",
        minutes: 20,
        lessonCount: 2,
        published: true
      }
    ]
  },
  {
    id: "acct-101",
    code: "ACCT 101",
    nameAr: "مبادئ المحاسبة 1",
    nameEn: "Principles of Accounting 1",
    institutionId: "ksu",
    icon: "coins",
    tone: "deep",
    chapters: [
      {
        number: 1,
        titleAr: "المعادلة المحاسبية",
        titleEn: "The Accounting Equation",
        minutes: 20,
        lessonCount: 9,
        published: false
      },
      {
        number: 2,
        titleAr: "الحسابات والقيود",
        titleEn: "Accounts and Journal Entries",
        minutes: 25,
        lessonCount: 11,
        published: false
      },
      {
        number: 3,
        titleAr: "الأصول والخصوم",
        titleEn: "Assets and Liabilities",
        minutes: 25,
        lessonCount: 12,
        published: false
      },
      {
        number: 4,
        titleAr: "دورة المحاسبة",
        titleEn: "The Accounting Cycle",
        minutes: 30,
        lessonCount: 10,
        published: false
      },
      {
        number: 5,
        titleAr: "التسويات الجردية",
        titleEn: "Adjusting Entries",
        minutes: 28,
        lessonCount: 12,
        published: false
      },
      {
        number: 6,
        titleAr: "القوائم المالية",
        titleEn: "Financial Statements",
        minutes: 30,
        lessonCount: 13,
        published: false
      },
      {
        number: 7,
        titleAr: "النقدية والبنوك",
        titleEn: "Cash and Banks",
        minutes: 22,
        lessonCount: 8,
        published: false
      },
      {
        number: 8,
        titleAr: "المدينون والمخزون",
        titleEn: "Receivables and Inventory",
        minutes: 26,
        lessonCount: 10,
        published: false
      },
      {
        number: 9,
        titleAr: "الأصول الثابتة والإهلاك",
        titleEn: "Fixed Assets and Depreciation",
        minutes: 24,
        lessonCount: 9,
        published: false
      },
      {
        number: 10,
        titleAr: "المحاسبة عن الشركات",
        titleEn: "Accounting for Companies",
        minutes: 28,
        lessonCount: 11,
        published: false
      }
    ]
  },
  {
    id: "econ-101",
    code: "ECON 101",
    nameAr: "مبادئ الاقتصاد الجزئي",
    nameEn: "Principles of Microeconomics",
    institutionId: "ksu",
    icon: "bars",
    tone: "lilac",
    chapters: [
      {
        number: 1,
        titleAr: "مبادئ الاقتصاد",
        titleEn: "Principles of Economics",
        minutes: 18,
        lessonCount: 7,
        published: false
      },
      {
        number: 2,
        titleAr: "العرض والطلب",
        titleEn: "Supply and Demand",
        minutes: 26,
        lessonCount: 12,
        published: false
      },
      {
        number: 3,
        titleAr: "مرونة الطلب",
        titleEn: "Demand Elasticity",
        minutes: 22,
        lessonCount: 9,
        published: false
      },
      {
        number: 4,
        titleAr: "سلوك المستهلك",
        titleEn: "Consumer Behavior",
        minutes: 24,
        lessonCount: 10,
        published: false
      },
      {
        number: 5,
        titleAr: "نظرية الإنتاج",
        titleEn: "Production Theory",
        minutes: 26,
        lessonCount: 11,
        published: false
      },
      {
        number: 6,
        titleAr: "التكاليف",
        titleEn: "Costs",
        minutes: 24,
        lessonCount: 10,
        published: false
      },
      {
        number: 7,
        titleAr: "المنافسة الكاملة",
        titleEn: "Perfect Competition",
        minutes: 28,
        lessonCount: 12,
        published: false
      },
      {
        number: 8,
        titleAr: "الاحتكار",
        titleEn: "Monopoly",
        minutes: 25,
        lessonCount: 9,
        published: false
      }
    ]
  },
  {
    id: "mgt-101",
    code: "MGT 101",
    nameAr: "مبادئ الإدارة",
    nameEn: "Principles of Management",
    institutionId: "ksu",
    icon: "blocks",
    tone: "base",
    chapters: [
      {
        number: 1,
        titleAr: "مدخل إلى الإدارة",
        titleEn: "Introduction to Management",
        minutes: 18,
        lessonCount: 8,
        published: false
      },
      {
        number: 2,
        titleAr: "التخطيط",
        titleEn: "Planning",
        minutes: 22,
        lessonCount: 9,
        published: false
      },
      {
        number: 3,
        titleAr: "التنظيم",
        titleEn: "Organizing",
        minutes: 24,
        lessonCount: 10,
        published: false
      },
      {
        number: 4,
        titleAr: "التوظيف",
        titleEn: "Staffing",
        minutes: 20,
        lessonCount: 8,
        published: false
      },
      {
        number: 5,
        titleAr: "القيادة",
        titleEn: "Leadership",
        minutes: 26,
        lessonCount: 11,
        published: false
      },
      {
        number: 6,
        titleAr: "الرقابة",
        titleEn: "Controlling",
        minutes: 22,
        lessonCount: 9,
        published: false
      },
      {
        number: 7,
        titleAr: "اتخاذ القرار",
        titleEn: "Decision-Making",
        minutes: 24,
        lessonCount: 10,
        published: false
      }
    ]
  },
  {
    id: "math-101",
    code: "MATH 101",
    nameAr: "حساب التفاضل والتكامل 1",
    nameEn: "Calculus 1",
    institutionId: "ksu",
    icon: "torus",
    tone: "lilac",
    chapters: [
      {
        number: 1,
        titleAr: "النهايات والاتصال",
        titleEn: "Limits and Continuity",
        minutes: 28,
        lessonCount: 12,
        published: false
      },
      {
        number: 2,
        titleAr: "المشتقة وقواعدها",
        titleEn: "Derivatives and Differentiation Rules",
        minutes: 30,
        lessonCount: 14,
        published: false
      },
      {
        number: 3,
        titleAr: "قاعدة السلسلة",
        titleEn: "The Chain Rule",
        minutes: 22,
        lessonCount: 8,
        published: false
      },
      {
        number: 4,
        titleAr: "تطبيقات المشتقة",
        titleEn: "Applications of Derivatives",
        minutes: 32,
        lessonCount: 15,
        published: false
      },
      {
        number: 5,
        titleAr: "التكامل غير المحدد",
        titleEn: "Indefinite Integrals",
        minutes: 28,
        lessonCount: 12,
        published: false
      },
      {
        number: 6,
        titleAr: "التكامل المحدد",
        titleEn: "Definite Integrals",
        minutes: 30,
        lessonCount: 13,
        published: false
      },
      {
        number: 7,
        titleAr: "تطبيقات التكامل",
        titleEn: "Applications of Integration",
        minutes: 30,
        lessonCount: 12,
        published: false
      }
    ]
  },
  {
    id: "chem-101",
    code: "CHEM 101",
    nameAr: "الكيمياء العامة 1",
    nameEn: "General Chemistry 1",
    institutionId: "ksu",
    icon: "flask",
    tone: "olive",
    chapters: [
      {
        number: 1,
        titleAr: "بنية الذرة",
        titleEn: "Atomic Structure",
        minutes: 24,
        lessonCount: 10,
        published: false
      },
      {
        number: 2,
        titleAr: "الجدول الدوري",
        titleEn: "The Periodic Table",
        minutes: 22,
        lessonCount: 9,
        published: false
      },
      {
        number: 3,
        titleAr: "الروابط الكيميائية",
        titleEn: "Chemical Bonds",
        minutes: 28,
        lessonCount: 12,
        published: false
      },
      {
        number: 4,
        titleAr: "المعادلات والموازنة",
        titleEn: "Equations and Balancing",
        minutes: 20,
        lessonCount: 8,
        published: false
      },
      {
        number: 5,
        titleAr: "الحسابات الكيميائية",
        titleEn: "Stoichiometry",
        minutes: 30,
        lessonCount: 13,
        published: false
      },
      {
        number: 6,
        titleAr: "الغازات",
        titleEn: "Gases",
        minutes: 26,
        lessonCount: 11,
        published: false
      },
      {
        number: 7,
        titleAr: "المحاليل",
        titleEn: "Solutions",
        minutes: 24,
        lessonCount: 10,
        published: false
      },
      {
        number: 8,
        titleAr: "الحموض والقواعد",
        titleEn: "Acids and Bases",
        minutes: 28,
        lessonCount: 12,
        published: false
      }
    ]
  },
  {
    id: "phys-101",
    code: "PHYS 101",
    nameAr: "فيزياء عامة 1",
    nameEn: "General Physics 1",
    institutionId: "kau",
    icon: "atom",
    tone: "deep",
    chapters: [
      {
        number: 1,
        titleAr: "القياس والوحدات",
        titleEn: "Measurement and Units",
        minutes: 16,
        lessonCount: 6,
        published: false
      },
      {
        number: 2,
        titleAr: "الحركة في بُعد واحد",
        titleEn: "Motion in One Dimension",
        minutes: 26,
        lessonCount: 11,
        published: false
      },
      {
        number: 3,
        titleAr: "الحركة في بُعدين",
        titleEn: "Motion in Two Dimensions",
        minutes: 28,
        lessonCount: 12,
        published: false
      },
      {
        number: 4,
        titleAr: "قوانين نيوتن",
        titleEn: "Newton’s Laws",
        minutes: 30,
        lessonCount: 14,
        published: false
      },
      {
        number: 5,
        titleAr: "الشغل والطاقة",
        titleEn: "Work and Energy",
        minutes: 28,
        lessonCount: 12,
        published: false
      },
      {
        number: 6,
        titleAr: "كمية الحركة",
        titleEn: "Momentum",
        minutes: 24,
        lessonCount: 10,
        published: false
      },
      {
        number: 7,
        titleAr: "الحركة الدورانية",
        titleEn: "Rotational Motion",
        minutes: 30,
        lessonCount: 13,
        published: false
      },
      {
        number: 8,
        titleAr: "الاتزان",
        titleEn: "Equilibrium",
        minutes: 22,
        lessonCount: 9,
        published: false
      },
      {
        number: 9,
        titleAr: "الجاذبية",
        titleEn: "Gravity",
        minutes: 24,
        lessonCount: 10,
        published: false
      },
      {
        number: 10,
        titleAr: "الموائع",
        titleEn: "Fluids",
        minutes: 26,
        lessonCount: 11,
        published: false
      }
    ]
  },
  {
    id: "stat-101",
    code: "STAT 101",
    nameAr: "مبادئ الإحصاء",
    nameEn: "Principles of Statistics",
    institutionId: "kau",
    icon: "donut",
    tone: "walnut",
    chapters: [
      {
        number: 1,
        titleAr: "وصف البيانات",
        titleEn: "Describing Data",
        minutes: 20,
        lessonCount: 8,
        published: false
      },
      {
        number: 2,
        titleAr: "مقاييس النزعة المركزية",
        titleEn: "Measures of Central Tendency",
        minutes: 24,
        lessonCount: 10,
        published: false
      },
      {
        number: 3,
        titleAr: "مقاييس التشتت",
        titleEn: "Measures of Dispersion",
        minutes: 22,
        lessonCount: 9,
        published: false
      },
      {
        number: 4,
        titleAr: "الاحتمالات",
        titleEn: "Probability",
        minutes: 28,
        lessonCount: 12,
        published: false
      },
      {
        number: 5,
        titleAr: "التوزيعات الاحتمالية",
        titleEn: "Probability Distributions",
        minutes: 30,
        lessonCount: 13,
        published: false
      },
      {
        number: 6,
        titleAr: "العيّنات والتقدير",
        titleEn: "Sampling and Estimation",
        minutes: 26,
        lessonCount: 11,
        published: false
      }
    ]
  },
  {
    id: "cs-101",
    code: "CS 101",
    nameAr: "مقدمة في البرمجة",
    nameEn: "Introduction to Programming",
    institutionId: "ksu",
    icon: "cube",
    tone: "amber",
    chapters: [
      {
        number: 1,
        titleAr: "مقدمة في البرمجة",
        titleEn: "Introduction to Programming",
        minutes: 18,
        lessonCount: 7,
        published: false
      },
      {
        number: 2,
        titleAr: "المتغيّرات والأنواع",
        titleEn: "Variables and Types",
        minutes: 22,
        lessonCount: 9,
        published: false
      },
      {
        number: 3,
        titleAr: "العمليات والتعابير",
        titleEn: "Operators and Expressions",
        minutes: 20,
        lessonCount: 8,
        published: false
      },
      {
        number: 4,
        titleAr: "الجمل الشرطية",
        titleEn: "Conditional Statements",
        minutes: 24,
        lessonCount: 10,
        published: false
      },
      {
        number: 5,
        titleAr: "الحلقات التكرارية",
        titleEn: "Loops",
        minutes: 26,
        lessonCount: 11,
        published: false
      },
      {
        number: 6,
        titleAr: "الدوال",
        titleEn: "Functions",
        minutes: 28,
        lessonCount: 12,
        published: false
      },
      {
        number: 7,
        titleAr: "المصفوفات",
        titleEn: "Arrays",
        minutes: 26,
        lessonCount: 11,
        published: false
      },
      {
        number: 8,
        titleAr: "السلاسل النصية",
        titleEn: "Strings",
        minutes: 22,
        lessonCount: 9,
        published: false
      },
      {
        number: 9,
        titleAr: "الملفات",
        titleEn: "Files",
        minutes: 20,
        lessonCount: 8,
        published: false
      },
      {
        number: 10,
        titleAr: "البرمجة الكائنية",
        titleEn: "Object-Oriented Programming",
        minutes: 32,
        lessonCount: 14,
        published: false
      },
      {
        number: 11,
        titleAr: "معالجة الأخطاء",
        titleEn: "Error Handling",
        minutes: 20,
        lessonCount: 8,
        published: false
      }
    ]
  },
  {
    id: "ee-201",
    code: "EE 201",
    nameAr: "الدوائر الكهربائية",
    nameEn: "Electric Circuits",
    institutionId: "kau",
    icon: "bolt",
    tone: "oliveDark",
    chapters: [
      {
        number: 1,
        titleAr: "عناصر الدائرة",
        titleEn: "Circuit Elements",
        minutes: 20,
        lessonCount: 8,
        published: false
      },
      {
        number: 2,
        titleAr: "قانون أوم",
        titleEn: "Ohm’s Law",
        minutes: 22,
        lessonCount: 9,
        published: false
      },
      {
        number: 3,
        titleAr: "قوانين كيرشوف",
        titleEn: "Kirchhoff’s Laws",
        minutes: 28,
        lessonCount: 12,
        published: false
      },
      {
        number: 4,
        titleAr: "التوصيل التوالي والتوازي",
        titleEn: "Series and Parallel Connections",
        minutes: 24,
        lessonCount: 10,
        published: false
      },
      {
        number: 5,
        titleAr: "تحليل العقد",
        titleEn: "Nodal Analysis",
        minutes: 30,
        lessonCount: 13,
        published: false
      },
      {
        number: 6,
        titleAr: "تحليل الحلقات",
        titleEn: "Mesh Analysis",
        minutes: 28,
        lessonCount: 12,
        published: false
      },
      {
        number: 7,
        titleAr: "نظريات الدوائر",
        titleEn: "Circuit Theorems",
        minutes: 30,
        lessonCount: 13,
        published: false
      },
      {
        number: 8,
        titleAr: "المكثّفات والملفّات",
        titleEn: "Capacitors and Inductors",
        minutes: 26,
        lessonCount: 11,
        published: false
      },
      {
        number: 9,
        titleAr: "دوائر التيار المتردد",
        titleEn: "AC Circuits",
        minutes: 32,
        lessonCount: 14,
        published: false
      }
    ]
  }
];
