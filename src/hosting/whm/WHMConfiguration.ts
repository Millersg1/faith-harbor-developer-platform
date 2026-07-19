/**
 * Connection settings for a WHM (Web Host Manager) server.
 *
 * Faith Harbor OS uses WHM's read-only JSON API to observe hosting
 * accounts and server health. Credentials are supplied through the
 * environment and never stored in the database or returned to clients.
 */
export interface WHMConfiguration {
  /**
   * WHM hostname (for example "server.faithharborwebsolutions.com").
   */
  host: string;

  /**
   * WHM API token. Treated as a secret.
   */
  apiToken: string;

  /**
   * WHM user the token belongs to. Defaults to "root".
   */
  user: string;

  /**
   * WHM API port. Defaults to 2087 (HTTPS).
   */
  port: number;

  /**
   * Whether to connect over HTTPS. Defaults to true.
   */
  useSsl: boolean;
}
