import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";

describe("Faith Harbor OS API", () => {
  const app = createApp();

  it("returns system information", async () => {
    const response = await request(app).get("/");
    expect(response.status).toBe(200);
    expect(response.body.name).toBe("Faith Harbor OS");
    expect(response.body.version).toBe("4.0.0");
  });

  it("returns a healthy status", async () => {
    const response = await request(app).get("/health");
    expect(response.status).toBe(200);
    expect(response.body.status).toBe("ok");
  });

  it("returns approved departments", async () => {
    const response = await request(app).get("/api/v1/departments");
    expect(response.body.departments).toContain("Engineering");
    expect(response.body.departments).toContain("Ministry");
  });

  it("registers OpenClaw as orchestration", async () => {
    const response = await request(app).get("/api/v1/ai");
    expect(response.body.orchestration).toContain("OpenClaw");
    expect(response.body.providers).toContain("ChatGPT");
  });
});
