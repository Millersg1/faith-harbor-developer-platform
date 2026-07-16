import {
  existsSync,
  mkdtempSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  afterEach,
  describe,
  expect,
  it,
} from "vitest";

import { SQLiteDatabase } from "./SQLiteDatabase";

describe("SQLiteDatabase", () => {
  const temporaryDirectories: string[] = [];

  afterEach(() => {
    for (const directory of temporaryDirectories) {
      rmSync(directory, {
        recursive: true,
        force: true,
      });
    }

    temporaryDirectories.length = 0;
  });

  function createDatabasePath(): string {
    const directory = mkdtempSync(
      join(tmpdir(), "faith-harbor-"),
    );

    temporaryDirectories.push(directory);

    return join(
      directory,
      "faith-harbor-test.db",
    );
  }

  it("creates a database file", () => {
    const databasePath =
      createDatabasePath();

    const database =
      new SQLiteDatabase(databasePath);

    expect(
      existsSync(databasePath),
    ).toBe(true);

    database.close();
  });

  it("creates the provider metrics table", () => {
    const database =
      new SQLiteDatabase(
        createDatabasePath(),
      );

    const row = database.connection
      .prepare(`
        SELECT name
        FROM sqlite_master
        WHERE type = 'table'
          AND name = 'ai_provider_metrics'
      `)
      .get() as
      | { name: string }
      | undefined;

    expect(row?.name).toBe(
      "ai_provider_metrics",
    );

    database.close();
  });

  it("creates the decisions table", () => {
    const database =
      new SQLiteDatabase(
        createDatabasePath(),
      );

    const row = database.connection
      .prepare(`
        SELECT name
        FROM sqlite_master
        WHERE type = 'table'
          AND name = 'ai_decisions'
      `)
      .get() as
      | { name: string }
      | undefined;

    expect(row?.name).toBe(
      "ai_decisions",
    );

    database.close();
  });

  it("can write and read provider metrics", () => {
    const database =
      new SQLiteDatabase(
        createDatabasePath(),
      );

    database.connection
      .prepare(`
        INSERT INTO ai_provider_metrics (
          provider_id,
          provider_name,
          updated_at
        )
        VALUES (?, ?, ?)
      `)
      .run(
        "ollama",
        "Ollama",
        "2026-07-16T12:00:00.000Z",
      );

    const row = database.connection
      .prepare(`
        SELECT
          provider_id,
          provider_name
        FROM ai_provider_metrics
        WHERE provider_id = ?
      `)
      .get("ollama") as
      | {
          provider_id: string;
          provider_name: string;
        }
      | undefined;

    expect(row).toEqual({
      provider_id: "ollama",
      provider_name: "Ollama",
    });

    database.close();
  });

  it("can write and read decisions", () => {
    const database =
      new SQLiteDatabase(
        createDatabasePath(),
      );

    database.connection
      .prepare(`
        INSERT INTO ai_decisions (
          id,
          timestamp,
          capability,
          provider_id,
          provider_name,
          reason,
          confidence,
          model
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        "decision-1",
        "2026-07-16T12:00:00.000Z",
        "writing",
        "ollama",
        "Ollama",
        "Highest operational score.",
        95,
        "hermes3:latest",
      );

    const row = database.connection
      .prepare(`
        SELECT
          id,
          provider_id,
          model
        FROM ai_decisions
        WHERE id = ?
      `)
      .get("decision-1") as
      | {
          id: string;
          provider_id: string;
          model: string;
        }
      | undefined;

    expect(row).toEqual({
      id: "decision-1",
      provider_id: "ollama",
      model: "hermes3:latest",
    });

    database.close();
  });
});