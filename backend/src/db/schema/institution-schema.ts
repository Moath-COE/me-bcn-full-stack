import { defineRelationsPart } from "drizzle-orm";
import { pgTable, text, integer, timestamp, index } from "drizzle-orm/pg-core";

export const institution = pgTable("institution", {
  id: text("id").primaryKey(), // stable slug, e.g. "ksu"
  nameAr: text("name_ar").notNull(),
  nameEn: text("name_en").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull()
});

export const major = pgTable(
  "major",
  {
    id: text("id").primaryKey(), // stable slug, unique across institutions, e.g. "ksu-cs"
    institutionId: text("institution_id")
      .notNull()
      .references(() => institution.id, { onDelete: "restrict" }),
    nameAr: text("name_ar").notNull(),
    nameEn: text("name_en").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull()
  },
  (table) => [index("major_institution_id_idx").on(table.institutionId)]
);

export const institutionRelations = defineRelationsPart({ institution, major }, (r) => ({
  institution: {
    majors: r.many.major({
      from: r.institution.id,
      to: r.major.institutionId
    })
  },
  major: {
    institution: r.one.institution({
      from: r.major.institutionId,
      to: r.institution.id
    })
  }
}));
