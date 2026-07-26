import {
  mkdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import {
  dirname,
  resolve,
  sep,
} from "node:path";

/**
 * Abstracts where file bytes live, so the local-disk implementation used
 * today can later be replaced with S3-compatible storage without touching
 * the repository, service, or API. Keys are opaque, tenant-prefixed strings
 * the caller controls; a provider must never interpret them as paths that
 * could escape its root.
 */
export interface StorageProvider {
  put(
    key: string,
    data: Buffer,
  ): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

/**
 * Stores bytes on the local filesystem under a single base directory.
 *
 * Every key is resolved against the base and then verified to still live
 * inside it, so a crafted key (e.g. containing "..") can never write or read
 * outside the storage root — defence in depth on top of the service already
 * generating safe UUID keys.
 */
export class LocalStorageProvider
  implements StorageProvider
{
  private readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
  }

  private safePath(
    key: string,
  ): string {
    const full = resolve(
      this.root,
      key,
    );

    if (
      full !== this.root &&
      !full.startsWith(
        this.root + sep,
      )
    ) {
      throw new Error(
        "Refusing to access a path outside the storage root.",
      );
    }

    return full;
  }

  async put(
    key: string,
    data: Buffer,
  ): Promise<void> {
    const full = this.safePath(key);
    await mkdir(dirname(full), {
      recursive: true,
    });
    await writeFile(full, data);
  }

  async get(
    key: string,
  ): Promise<Buffer> {
    return readFile(
      this.safePath(key),
    );
  }

  async delete(
    key: string,
  ): Promise<void> {
    await rm(this.safePath(key), {
      force: true,
    });
  }
}

/**
 * An in-memory provider for tests — same contract, no disk.
 */
export class MemoryStorageProvider
  implements StorageProvider
{
  private readonly store = new Map<
    string,
    Buffer
  >();

  async put(
    key: string,
    data: Buffer,
  ): Promise<void> {
    this.store.set(
      key,
      Buffer.from(data),
    );
  }

  async get(
    key: string,
  ): Promise<Buffer> {
    const data =
      this.store.get(key);

    if (!data) {
      throw new Error(
        "File not found in storage.",
      );
    }

    return data;
  }

  async delete(
    key: string,
  ): Promise<void> {
    this.store.delete(key);
  }
}
