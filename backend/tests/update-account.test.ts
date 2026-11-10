import { beforeEach, describe, expect, it } from "vitest";

import { resetAccounts, signedInStudent, webOrigin } from "./support/accounts.js";

type Agent = Awaited<ReturnType<typeof signedInStudent>>["agent"];

function updateUser(agent: Agent, fields: Record<string, unknown>) {
  return agent.post("/api/auth/update-user").set("Origin", webOrigin).send(fields);
}

async function currentAccount(agent: Agent) {
  const response = await agent
    .get("/api/auth/get-session?disableCookieCache=true")
    .set("Origin", webOrigin)
    .expect(200);

  return response.body.user;
}

describe("POST /api/auth/update-user", () => {
  beforeEach(resetAccounts);

  it("changes the major within the current institution", async () => {
    const { agent } = await signedInStudent({ institutionId: "ksu", majorId: "ksu-cs" });

    await updateUser(agent, { majorId: "ksu-is" }).expect(200);

    expect(await currentAccount(agent)).toMatchObject({
      institutionId: "ksu",
      majorId: "ksu-is"
    });
  });

  it("rejects a major from another institution as INVALID_MAJOR", async () => {
    const { agent } = await signedInStudent({ institutionId: "ksu", majorId: "ksu-cs" });

    const response = await updateUser(agent, { majorId: "kau-cs" }).expect(400);

    expect(response.body.code).toBe("INVALID_MAJOR");
  });

  it("rejects a new institution without a major of that institution as INVALID_MAJOR", async () => {
    const { agent } = await signedInStudent({ institutionId: "ksu", majorId: "ksu-cs" });

    const response = await updateUser(agent, { institutionId: "kau" }).expect(400);

    expect(response.body.code).toBe("INVALID_MAJOR");
  });

  it("moves to another institution together with one of its majors", async () => {
    const { agent } = await signedInStudent({ institutionId: "ksu", majorId: "ksu-cs" });

    await updateUser(agent, { institutionId: "kau", majorId: "kau-cs" }).expect(200);

    expect(await currentAccount(agent)).toMatchObject({
      institutionId: "kau",
      majorId: "kau-cs"
    });
  });

  it("rejects an unknown institution as INVALID_INSTITUTION", async () => {
    const { agent } = await signedInStudent();

    const response = await updateUser(agent, {
      institutionId: "nope",
      majorId: "ksu-cs"
    }).expect(400);

    expect(response.body.code).toBe("INVALID_INSTITUTION");
  });

  it("rejects a malformed phone number as INVALID_PHONE_NUMBER", async () => {
    const { agent } = await signedInStudent();

    const response = await updateUser(agent, { phoneNumber: "0512345678" }).expect(400);

    expect(response.body.code).toBe("INVALID_PHONE_NUMBER");
  });

  it("rejects another Account's phone number as PHONE_NUMBER_TAKEN", async () => {
    await signedInStudent({ phoneNumber: "+966511111111" });
    const { agent } = await signedInStudent({ phoneNumber: "+966522222222" });

    const response = await updateUser(agent, { phoneNumber: "+966511111111" }).expect(
      400
    );

    expect(response.body.code).toBe("PHONE_NUMBER_TAKEN");
  });

  it("accepts the Account's own phone number unchanged", async () => {
    const { agent } = await signedInStudent({ phoneNumber: "+966511111111" });

    await updateUser(agent, { phoneNumber: "+966511111111", name: "Sara A." }).expect(
      200
    );

    expect(await currentAccount(agent)).toMatchObject({
      name: "Sara A.",
      phoneNumber: "+966511111111"
    });
  });
});
