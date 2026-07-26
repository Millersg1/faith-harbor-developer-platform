import { randomUUID } from "node:crypto";

import {
  NotificationRepository,
  type ListNotificationsOptions,
} from "./NotificationRepository";
import type {
  CreateNotificationInput,
  NotificationRecord,
} from "./Notification";

/**
 * Creates and reads in-app notifications for the acting tenant's team
 * members. Every read/write is scoped to the tenant and to a specific user,
 * so no one ever sees another member's notifications.
 */
export class NotificationService {
  constructor(
    private readonly repository =
      new NotificationRepository(),
    private readonly now: () => number = () =>
      Date.now(),
  ) {}

  async create(
    input: CreateNotificationInput,
  ): Promise<NotificationRecord> {
    return this.repository.create({
      id: randomUUID(),
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body,
      link: input.link,
      createdAt: new Date(
        this.now(),
      ).toISOString(),
    });
  }

  async listForUser(
    userId: string,
    options: ListNotificationsOptions = {},
  ): Promise<
    readonly NotificationRecord[]
  > {
    return this.repository.listForUser(
      userId,
      options,
    );
  }

  async unreadCount(
    userId: string,
  ): Promise<number> {
    return this.repository.unreadCount(
      userId,
    );
  }

  async markRead(
    userId: string,
    id: string,
  ): Promise<void> {
    await this.repository.markRead(
      userId,
      id,
      new Date(
        this.now(),
      ).toISOString(),
    );
  }

  async markAllRead(
    userId: string,
  ): Promise<void> {
    await this.repository.markAllRead(
      userId,
      new Date(
        this.now(),
      ).toISOString(),
    );
  }
}
