import { randomBytes } from "node:crypto";

import type { BrandService } from "../../brands/BrandService";
import type { ClientService } from "../../clients/ClientService";
import type { EmailService } from "../../communications/EmailService";
import type { HostingAccountRecord } from "../HostingAccountRecord";
import type { HostingAccountService } from "../HostingAccountService";
import type { HostingPlanService } from "../plans/HostingPlanService";
import type { WHMClient } from "../whm/WHMClient";

export interface ProvisionRequest {
  planId?: string;
  planSlug?: string;
  domain: string;
  clientId?: string;
  brandId?: string;

  /**
   * Where to send the welcome email and set as the cPanel contact.
   * Falls back to the client's email when a clientId is given.
   */
  contactEmail?: string;
}

export interface ProvisionResult {
  account: HostingAccountRecord;
  username: string;

  /**
   * The generated cPanel password. Returned once to the caller (also
   * emailed to the customer); never stored in plain text.
   */
  temporaryPassword: string;
}

export interface ProvisioningOptions {
  brands?: BrandService;
  clients?: ClientService;

  /**
   * The WHM server label / hostname, used for the cPanel login URL and
   * stored on the account.
   */
  serverLabel?: string;

  generateUsername?: (
    domain: string,
  ) => string;

  generatePassword?: () => string;
}

/**
 * Provisions hosting: turns a paid plan + domain into a real cPanel
 * account, a local record, and a welcome email with login details.
 *
 * This is gated by its callers (a paid order, or an explicit admin
 * action) — it does not decide on its own to create accounts.
 */
export class ProvisioningService {
  private readonly brands?: BrandService;

  private readonly clients?: ClientService;

  private readonly serverLabel?: string;

  private readonly makeUsername: (
    domain: string,
  ) => string;

  private readonly makePassword: () => string;

  constructor(
    private readonly plans: HostingPlanService,
    private readonly hostingAccounts: HostingAccountService,
    private readonly whm: WHMClient | undefined,
    private readonly emails: EmailService,
    options: ProvisioningOptions = {},
  ) {
    this.brands = options.brands;
    this.clients = options.clients;
    this.serverLabel =
      options.serverLabel;
    this.makeUsername =
      options.generateUsername ??
      ((domain) =>
        defaultUsername(domain));
    this.makePassword =
      options.generatePassword ??
      defaultPassword;
  }

  /**
   * Whether live provisioning is available (WHM configured).
   */
  isAvailable(): boolean {
    return Boolean(this.whm);
  }

  async provision(
    request: ProvisionRequest,
  ): Promise<ProvisionResult> {
    const domain = request.domain
      .trim()
      .toLowerCase();

    if (!domain) {
      throw new Error(
        "Provisioning requires a domain.",
      );
    }

    const plan = request.planId
      ? this.plans.get(request.planId)
      : request.planSlug
        ? this.plans.getBySlug(
            request.planSlug,
          )
        : undefined;

    if (!plan) {
      throw new Error(
        "The hosting plan was not found.",
      );
    }

    if (!this.whm) {
      throw new Error(
        "Provisioning is unavailable: WHM is not configured.",
      );
    }

    const contactEmail =
      this.resolveContactEmail(
        request,
      );

    if (!contactEmail) {
      throw new Error(
        "A contact email is required to provision hosting.",
      );
    }

    const brand = request.brandId
      ? this.brands?.get(
          request.brandId,
        )
      : undefined;

    const username = this.makeUsername(
      domain,
    );

    const password = this.makePassword();

    const created =
      await this.whm.createAccount({
        username,
        domain,
        password,
        plan:
          plan.whmPackage ?? plan.name,
        contactEmail,
      });

    const account =
      this.hostingAccounts.create({
        clientId: request.clientId,
        brand: brand?.name,
        domain,
        username,
        plan: plan.name,
        status: "active",
        server: this.serverLabel,
        ipAddress: created.ipAddress,
      });

    await this.sendWelcome(
      contactEmail,
      brand,
      domain,
      username,
      password,
      request.clientId,
    );

    return {
      account,
      username,
      temporaryPassword: password,
    };
  }

  private resolveContactEmail(
    request: ProvisionRequest,
  ): string | undefined {
    if (request.contactEmail?.trim()) {
      return request.contactEmail.trim();
    }

    if (
      request.clientId &&
      this.clients
    ) {
      try {
        return this.clients.get(
          request.clientId,
        ).email;
      } catch {
        return undefined;
      }
    }

    return undefined;
  }

  private async sendWelcome(
    to: string,
    brand:
      | ReturnType<BrandService["get"]>
      | undefined,
    domain: string,
    username: string,
    password: string,
    clientId: string | undefined,
  ): Promise<void> {
    const brandName =
      brand?.name ?? "your hosting";

    const cpanelUrl = this.serverLabel
      ? `https://${this.serverLabel}:2083`
      : `https://${domain}:2083`;

    const body = [
      `Your ${brandName} account is ready.`,
      "",
      `Domain: ${domain}`,
      `cPanel login: ${cpanelUrl}`,
      `Username: ${username}`,
      `Password: ${password}`,
      "",
      "Please sign in and change your password. If your domain is",
      "new, point its nameservers to our servers and it will go live",
      "once DNS propagates.",
    ].join("\n");

    await this.emails.send({
      to,
      subject: `Your ${brandName} account is ready`,
      body,
      from: brand?.fromEmail,
      clientId,
    });
  }
}

/**
 * Derives a valid cPanel username from a domain: lowercase, starts with
 * a letter, alphanumeric, <= 16 chars, with a short random suffix for
 * uniqueness.
 */
export function defaultUsername(
  domain: string,
): string {
  const sld = domain
    .toLowerCase()
    .split(".")[0]
    .replace(/[^a-z0-9]/g, "");

  const base = /^[a-z]/.test(sld)
    ? sld
    : `u${sld}`;

  const suffix = randomBytes(3)
    .toString("hex")
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 4);

  return `${base.slice(0, 11)}${suffix}`.slice(
    0,
    16,
  );
}

/**
 * Generates a strong cPanel password with mixed classes.
 */
export function defaultPassword(): string {
  const upper =
    "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower =
    "abcdefghijkmnpqrstuvwxyz";
  const digits = "23456789";
  const symbols = "!@#$%^&*-_=+";
  const all =
    upper + lower + digits + symbols;

  const pick = (set: string): string => {
    const byte = randomBytes(1)[0];
    return set[byte % set.length];
  };

  // Guarantee at least one of each class, then fill to length 18.
  const chars = [
    pick(upper),
    pick(lower),
    pick(digits),
    pick(symbols),
  ];

  while (chars.length < 18) {
    chars.push(pick(all));
  }

  // Shuffle so the guaranteed characters are not always first.
  for (
    let i = chars.length - 1;
    i > 0;
    i--
  ) {
    const j =
      randomBytes(1)[0] % (i + 1);
    [chars[i], chars[j]] = [
      chars[j],
      chars[i],
    ];
  }

  return chars.join("");
}
