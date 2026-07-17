import request from "supertest";
import {
  describe,
  expect,
  it,
} from "vitest";

import { createApp } from "../app";

async function createClient(
  app: ReturnType<typeof createApp>,
  companyName =
    "Faith Harbor Test Client",
) {
  const response =
    await request(app)
      .post("/api/v1/clients")
      .send({
        companyName,

        primaryContact:
          "Jordan Smith",
      });

  expect(response.status)
    .toBe(201);

  return response.body;
}

describe("ProjectRouter", () => {
  it("creates a project", async () => {
    const app = createApp();

    const client =
      await createClient(app);

    const response =
      await request(app)
        .post("/api/v1/projects")
        .send({
          clientId: client.id,

          proposalId:
            "proposal-1",

          name:
            "  Website Redesign  ",

          description:
            "Redesign the client website.",

          status:
            "active",

          startDate:
            "2026-07-20",

          dueDate:
            "2026-08-20",

          notes:
            "Begin with discovery.",

          metadata: {
            priority: "high",
          },
        });

    expect(response.status)
      .toBe(201);

    expect(response.body.success)
      .toBe(true);

    expect(response.body.status)
      .toBe("active");

    expect(response.body.project)
      .toMatchObject({
        clientId: client.id,

        proposalId:
          "proposal-1",

        name:
          "Website Redesign",

        description:
          "Redesign the client website.",

        status:
          "active",

        startDate:
          "2026-07-20",

        dueDate:
          "2026-08-20",

        notes:
          "Begin with discovery.",

        metadata: {
          priority: "high",
        },
      });

    expect(
      response.body.project.id,
    ).toBeDefined();

    expect(
      response.body.project
        .createdAt,
    ).toBeDefined();

    expect(
      response.body.project
        .updatedAt,
    ).toBeDefined();
  });

  it("uses planned as the default project status", async () => {
    const app = createApp();

    const client =
      await createClient(app);

    const response =
      await request(app)
        .post("/api/v1/projects")
        .send({
          clientId: client.id,

          name:
            "Planned Project",
        });

    expect(response.status)
      .toBe(201);

    expect(response.body.status)
      .toBe("planned");

    expect(
      response.body.project
        .status,
    ).toBe("planned");
  });

  it("returns all projects", async () => {
    const app = createApp();

    const client =
      await createClient(app);

    const firstResponse =
      await request(app)
        .post("/api/v1/projects")
        .send({
          clientId: client.id,

          name:
            "First Project",
        });

    const secondResponse =
      await request(app)
        .post("/api/v1/projects")
        .send({
          clientId: client.id,

          name:
            "Second Project",
        });

    expect(firstResponse.status)
      .toBe(201);

    expect(secondResponse.status)
      .toBe(201);

    const response =
      await request(app)
        .get("/api/v1/projects");

    expect(response.status)
      .toBe(200);

    expect(response.body.count)
      .toBe(2);

    expect(
      response.body.projects,
    ).toHaveLength(2);

    expect(
      response.body.projects.map(
        (
          project: {
            name: string;
          },
        ) => project.name,
      ),
    ).toEqual([
      "First Project",
      "Second Project",
    ]);
  });

  it("filters projects by client", async () => {
    const app = createApp();

    const firstClient =
      await createClient(
        app,
        "First Client",
      );

    const secondClient =
      await createClient(
        app,
        "Second Client",
      );

    await request(app)
      .post("/api/v1/projects")
      .send({
        clientId:
          firstClient.id,

        name:
          "First Client Project",
      });

    await request(app)
      .post("/api/v1/projects")
      .send({
        clientId:
          secondClient.id,

        name:
          "Second Client Project",
      });

    const response =
      await request(app)
        .get(
          "/api/v1/projects",
        )
        .query({
          clientId:
            firstClient.id,
        });

    expect(response.status)
      .toBe(200);

    expect(response.body.count)
      .toBe(1);

    expect(
      response.body.projects,
    ).toHaveLength(1);

    expect(
      response.body.projects[0],
    ).toMatchObject({
      clientId:
        firstClient.id,

      name:
        "First Client Project",
    });
  });

  it("returns one project", async () => {
    const app = createApp();

    const client =
      await createClient(app);

    const createResponse =
      await request(app)
        .post("/api/v1/projects")
        .send({
          clientId: client.id,

          name:
            "Project Details",
        });

    const project =
      createResponse.body.project;

    const response =
      await request(app)
        .get(
          `/api/v1/projects/${project.id}`,
        );

    expect(response.status)
      .toBe(200);

    expect(response.body)
      .toEqual(project);
  });

  it("returns 404 for a missing project", async () => {
    const app = createApp();

    const response =
      await request(app)
        .get(
          "/api/v1/projects/missing-project",
        );

    expect(response.status)
      .toBe(404);

    expect(response.body)
      .toEqual({
        error: {
          code:
            "PROJECT_NOT_FOUND",

          message:
            'Project "missing-project" was not found.',
        },
      });
  });

  it("updates a project", async () => {
    const app = createApp();

    const client =
      await createClient(app);

    const createResponse =
      await request(app)
        .post("/api/v1/projects")
        .send({
          clientId: client.id,

          name:
            "Original Project",

          status:
            "planned",

          metadata: {
            priority: "normal",
            department:
              "technology",
          },
        });

    const project =
      createResponse.body.project;

    const response =
      await request(app)
        .patch(
          `/api/v1/projects/${project.id}`,
        )
        .send({
          name:
            "Updated Project",

          status:
            "active",

          notes:
            "Development has started.",

          metadata: {
            priority: "high",
          },
        });

    expect(response.status)
      .toBe(200);

    expect(response.body.success)
      .toBe(true);

    expect(response.body.status)
      .toBe("active");

    expect(response.body.project)
      .toMatchObject({
        id: project.id,

        clientId: client.id,

        name:
          "Updated Project",

        status:
          "active",

        notes:
          "Development has started.",

        metadata: {
          priority: "high",
          department:
            "technology",
        },
      });

    const getResponse =
      await request(app)
        .get(
          `/api/v1/projects/${project.id}`,
        );

    expect(getResponse.status)
      .toBe(200);

    expect(getResponse.body)
      .toEqual(
        response.body.project,
      );
  });

  it("returns 404 when updating a missing project", async () => {
    const app = createApp();

    const response =
      await request(app)
        .patch(
          "/api/v1/projects/missing-project",
        )
        .send({
          name:
            "Updated Project",
        });

    expect(response.status)
      .toBe(404);

    expect(response.body)
      .toEqual({
        error: {
          code:
            "PROJECT_NOT_FOUND",

          message:
            'Project "missing-project" was not found.',
        },
      });
  });

  it("deletes a project", async () => {
    const app = createApp();

    const client =
      await createClient(app);

    const createResponse =
      await request(app)
        .post("/api/v1/projects")
        .send({
          clientId: client.id,

          name:
            "Project To Delete",
        });

    const project =
      createResponse.body.project;

    const deleteResponse =
      await request(app)
        .delete(
          `/api/v1/projects/${project.id}`,
        );

    expect(
      deleteResponse.status,
    ).toBe(204);

    expect(deleteResponse.text)
      .toBe("");

    const getResponse =
      await request(app)
        .get(
          `/api/v1/projects/${project.id}`,
        );

    expect(getResponse.status)
      .toBe(404);
  });

  it("returns 404 when deleting a missing project", async () => {
    const app = createApp();

    const response =
      await request(app)
        .delete(
          "/api/v1/projects/missing-project",
        );

    expect(response.status)
      .toBe(404);

    expect(response.body)
      .toEqual({
        error: {
          code:
            "PROJECT_NOT_FOUND",

          message:
            'Project "missing-project" was not found.',
        },
      });
  });

  it("rejects an invalid project request", async () => {
    const app = createApp();

    const response =
      await request(app)
        .post("/api/v1/projects")
        .send({
          clientId: "",

          name: "",

          status:
            "invalid-status",
        });

    expect(response.status)
      .toBe(400);

    expect(
      response.body.error.code,
    ).toBe(
      "INVALID_PROJECT_REQUEST",
    );

    expect(
      response.body.error.message,
    ).toBe(
      "Project request validation failed.",
    );

    expect(
      response.body.error.details,
    ).toBeDefined();
  });

  it("rejects an invalid project update", async () => {
    const app = createApp();

    const client =
      await createClient(app);

    const createResponse =
      await request(app)
        .post("/api/v1/projects")
        .send({
          clientId: client.id,

          name:
            "Valid Project",
        });

    const project =
      createResponse.body.project;

    const response =
      await request(app)
        .patch(
          `/api/v1/projects/${project.id}`,
        )
        .send({
          status:
            "invalid-status",
        });

    expect(response.status)
      .toBe(400);

    expect(
      response.body.error.code,
    ).toBe(
      "INVALID_PROJECT_UPDATE",
    );

    expect(
      response.body.error.message,
    ).toBe(
      "Project update validation failed.",
    );

    expect(
      response.body.error.details,
    ).toBeDefined();
  });

  it("returns an internal error when creating a project for a missing client", async () => {
    const app = createApp();

    const consoleError =
      console.error;

    console.error = () => {
      // The application error handler
      // intentionally logs this error.
    };

    try {
      const response =
        await request(app)
          .post(
            "/api/v1/projects",
          )
          .send({
            clientId:
              "missing-client",

            name:
              "Invalid Project",
          });

      expect(response.status)
        .toBe(500);

      expect(response.body)
        .toEqual({
          error: {
            code:
              "INTERNAL_ERROR",

            message:
              "An unexpected error occurred.",
          },
        });
    } finally {
      console.error =
        consoleError;
    }
  });
});