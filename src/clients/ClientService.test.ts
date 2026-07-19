import {
  describe,
  expect,
  it,
} from "vitest";

import { ClientService } from "./ClientService";

describe(
  "ClientService",
  () => {
    it(
      "creates a client",
      () => {
        const service =
          new ClientService();

        const client =
          service.create({
            companyName:
              "Acme Manufacturing",

            primaryContact:
              "John Smith",
          });

        expect(
          client.companyName,
        ).toBe(
          "Acme Manufacturing",
        );

        expect(
          service.list(),
        ).toHaveLength(1);

        expect(
          service.get(client.id),
        ).toEqual(client);
      },
    );
  },
);