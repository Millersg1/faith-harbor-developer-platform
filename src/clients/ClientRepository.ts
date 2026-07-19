import type { ClientRecord } from "./ClientRecord";

export class ClientRepository {
  private readonly clients =
    new Map<string, ClientRecord>();

  create(
    client: ClientRecord,
  ): ClientRecord {
    this.clients.set(
      client.id,
      client,
    );

    return client;
  }

  get(
    id: string,
  ): ClientRecord {
    const client =
      this.clients.get(id);

    if (!client) {
      throw new Error(
        `Client "${id}" was not found.`,
      );
    }

    return client;
  }

  list(): ClientRecord[] {
    return Array.from(
      this.clients.values(),
    );
  }

  update(
    client: ClientRecord,
  ): ClientRecord {
    this.clients.set(
      client.id,
      client,
    );

    return client;
  }

  delete(
    id: string,
  ): boolean {
    return this.clients.delete(id);
  }
}