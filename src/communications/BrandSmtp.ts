import type { EmailTransport } from "./EmailTransport";
import {
  SmtpEmailTransport,
  type SmtpConfig,
} from "./SmtpEmailTransport";

/**
 * One brand mailbox: the SMTP account a brand's automated email is
 * sent through. Matched to a brand by the domain of its from-address,
 * so each business speaks from its own authenticated mailbox.
 */
export interface BrandSmtpAccount {
  /**
   * The from-address domain this mailbox serves, e.g. "saassurface.com".
   */
  domain: string;

  host: string;
  port?: number;
  user: string;

  /**
   * The mailbox password. Optional: when omitted, the shared default
   * password (SMTP_PASSWORD) is used, which is the common case when
   * every mailbox uses the same password.
   */
  password?: string;

  secure?: boolean;
  rejectUnauthorized?: boolean;
}

/**
 * Parses the BRAND_SMTP environment value: a JSON array of brand
 * mailboxes. Returns an empty list for missing/blank input, and skips
 * any entry that lacks the required fields rather than throwing, so a
 * single malformed mailbox never stops the app from starting.
 */
export function parseBrandSmtp(
  json: string | undefined,
): BrandSmtpAccount[] {
  if (!json || !json.trim()) {
    return [];
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(json);
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) {
    return [];
  }

  const accounts: BrandSmtpAccount[] = [];

  for (const entry of parsed) {
    if (
      typeof entry !== "object" ||
      entry === null
    ) {
      continue;
    }

    const record = entry as Record<
      string,
      unknown
    >;

    const domain = str(record.domain);
    const host = str(record.host);
    const user = str(record.user);
    const password = str(record.password);

    // A mailbox needs a domain to match on, a host to reach, and a
    // user to authenticate as. The password may be omitted to fall
    // back to the shared default (SMTP_PASSWORD).
    if (!domain || !host || !user) {
      continue;
    }

    const account: BrandSmtpAccount = {
      domain: domain.toLowerCase(),
      host,
      user,
    };

    if (password) {
      account.password = password;
    }

    if (typeof record.port === "number") {
      account.port = record.port;
    }

    if (
      typeof record.secure === "boolean"
    ) {
      account.secure = record.secure;
    }

    if (
      typeof record.rejectUnauthorized ===
      "boolean"
    ) {
      account.rejectUnauthorized =
        record.rejectUnauthorized;
    }

    accounts.push(account);
  }

  return accounts;
}

/**
 * Builds a map of from-domain → transport from brand mailboxes. The
 * transport factory is injectable so tests can avoid real SMTP.
 */
export function buildBrandTransports(
  accounts: readonly BrandSmtpAccount[],
  makeTransport: (
    config: SmtpConfig,
  ) => EmailTransport = (config) =>
    new SmtpEmailTransport(config),

  /**
   * Password used for any mailbox that omits its own. Lets every brand
   * share one password (SMTP_PASSWORD) without repeating the secret.
   */
  defaultPassword?: string,
): Map<string, EmailTransport> {
  const map = new Map<
    string,
    EmailTransport
  >();

  for (const account of accounts) {
    const password =
      account.password ?? defaultPassword;

    // Without a password (own or shared) the mailbox cannot
    // authenticate, so it is skipped.
    if (!password) {
      continue;
    }

    const config: SmtpConfig = {
      host: account.host,
      port: account.port ?? 465,
      user: account.user,
      password,
    };

    if (account.secure !== undefined) {
      config.secure = account.secure;
    }

    if (
      account.rejectUnauthorized !==
      undefined
    ) {
      config.rejectUnauthorized =
        account.rejectUnauthorized;
    }

    map.set(
      account.domain,
      makeTransport(config),
    );
  }

  return map;
}

function str(
  value: unknown,
): string | undefined {
  return typeof value === "string" &&
    value.trim()
    ? value.trim()
    : undefined;
}
