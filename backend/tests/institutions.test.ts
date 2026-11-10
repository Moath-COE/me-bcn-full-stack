import request from "supertest";
import { describe, expect, it } from "vitest";

import app from "../src/app.js";

describe("GET /api/v1/institutions", () => {
  it("lists institutions in display order with localized names and their majors", async () => {
    const response = await request(app).get("/api/v1/institutions").expect(200);

    expect(response.body.map((institution: { id: string }) => institution.id)).toEqual([
      "ksu",
      "kau",
      "imamu"
    ]);
    expect(response.body[0]).toMatchObject({
      id: "ksu",
      name: { ar: "جامعة الملك سعود", en: "King Saud University" }
    });
    expect(response.body[0].majors[0]).toEqual({
      id: "ksu-cs",
      name: { ar: "علوم الحاسب", en: "Computer Science" }
    });
  });

  it("is publicly cacheable for five minutes", async () => {
    const response = await request(app).get("/api/v1/institutions").expect(200);

    expect(response.headers["cache-control"]).toBe("public, max-age=300");
  });
});
