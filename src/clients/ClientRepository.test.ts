import {
  describe,
  expect,
  it,
} from "vitest";

import { ClientRepository } from "./ClientRepository";

describe(
  "ClientRepository",
  () => {
    it(
      "stores and retrieves clients",
      () => {
        const repository =
          new ClientRepository();

        repository.create({
          id: "acme",
          companyName:
            "Acme Manufacturing",
          primaryContact:
            "John Smith",
          createdAt:
            new Date().toISOString(),
          updatedAt:
            new Date().toISOString(),
        });

        expect(
          repository.list(),
        ).toHaveLength(1);

        expect(
          repository.get("acme")
            .companyName,
        ).toBe(
          "Acme Manufacturing",
        );
      },
    );
  },
);