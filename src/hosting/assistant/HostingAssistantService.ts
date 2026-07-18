import type { AIService } from "../../ai/AIService";
import type { TicketService } from "../../support/TicketService";
import type { HostingAccountRecord } from "../HostingAccountRecord";
import { HostingAccountService } from "../HostingAccountService";

import {
  runAccountChecks,
  runDnsChecks,
  type DiagnosticFinding,
  type DnsResolver,
} from "./HostingDiagnostics";

export interface HostingAssessmentTicket {
  id: string;
  number: string;
  subject: string;
}

export interface HostingAssessment {
  account: HostingAccountRecord;
  ticket?: HostingAssessmentTicket;
  findings: DiagnosticFinding[];
  summary: string;
  recommendation: string;
  aiGenerated: boolean;
}

export interface HostingAssistantOptions {
  aiService?: AIService;
  ticketService?: TicketService;
  dnsResolver?: DnsResolver;
}

const recommendationByCode:
  Record<string, string> = {
    ACCOUNT_SUSPENDED:
      "Review the suspension reason in WHM and, once approved, unsuspend the account.",
    ACCOUNT_PENDING:
      "Finish provisioning the account so it becomes active.",
    DISK_CRITICAL:
      "Free up disk space or upgrade the plan; the account is nearly full.",
    DISK_WARNING:
      "Plan a cleanup or plan upgrade before the account fills up.",
    DNS_NO_A_RECORD:
      "Point the domain's A record at the hosting server IP.",
    DNS_A_LOOKUP_FAILED:
      "Confirm the domain is registered and its A record targets the server IP.",
    DNS_NO_MX_RECORD:
      "Add MX records so the domain can receive email.",
    DNS_MX_LOOKUP_FAILED:
      "Verify the domain's MX records point at the mail server.",
  };

/**
 * Diagnoses hosting and server issues for a client account and
 * drafts a recommended resolution for human review.
 *
 * The assistant only observes and advises. It never changes the
 * live server; applying any fix remains a human decision.
 */
export class HostingAssistantService {
  private readonly aiService?: AIService;
  private readonly ticketService?: TicketService;
  private readonly dnsResolver?: DnsResolver;

  constructor(
    private readonly hosting: HostingAccountService,
    options: HostingAssistantOptions = {},
  ) {
    this.aiService =
      options.aiService;
    this.ticketService =
      options.ticketService;
    this.dnsResolver =
      options.dnsResolver;
  }

  /**
   * Produces an assessment for one hosting account, optionally in
   * the context of a support ticket.
   */
  async assess(
    accountId: string,
    ticketId?: string,
  ): Promise<HostingAssessment> {
    const account =
      this.hosting.get(accountId);

    const findings: DiagnosticFinding[] =
      [
        ...runAccountChecks(account),
      ];

    if (this.dnsResolver) {
      findings.push(
        ...(await runDnsChecks(
          account.domain,
          this.dnsResolver,
        )),
      );
    }

    let ticket:
      HostingAssessmentTicket | undefined;

    if (
      ticketId &&
      this.ticketService
    ) {
      const record =
        this.ticketService.get(
          ticketId,
        );

      ticket = {
        id: record.id,
        number: record.number,
        subject: record.subject,
      };
    }

    const summary =
      this.buildSummary(findings);

    let recommendation =
      this.deterministicRecommendation(
        findings,
      );

    let aiGenerated = false;

    const aiText =
      await this.generateDraft(
        account,
        findings,
        ticket,
      );

    if (aiText) {
      recommendation = aiText;
      aiGenerated = true;
    }

    return {
      account,
      ticket,
      findings,
      summary,
      recommendation,
      aiGenerated,
    };
  }

  /**
   * Requests an AI-drafted resolution, bounded by a timeout so a
   * slow or unreachable provider degrades to the deterministic
   * recommendation instead of hanging the request. Returns null
   * when AI is unavailable, times out, or produces nothing.
   */
  private async generateDraft(
    account: HostingAccountRecord,
    findings: readonly DiagnosticFinding[],
    ticket?: HostingAssessmentTicket,
  ): Promise<string | null> {
    if (!this.aiService) {
      return null;
    }

    const AI_TIMEOUT_MS = 25000;

    try {
      const response =
        await Promise.race([
          this.aiService.generate({
            capability: "writing",
            prompt:
              this.buildPrompt(
                account,
                findings,
                ticket,
              ),
          }),

          new Promise<never>(
            (_resolve, reject) => {
              const timer =
                setTimeout(() => {
                  reject(
                    new Error(
                      "AI draft timed out.",
                    ),
                  );
                }, AI_TIMEOUT_MS);

              if (
                typeof timer.unref ===
                "function"
              ) {
                timer.unref();
              }
            },
          ),
        ]);

      const content =
        response.content.trim();

      return content.length > 0
        ? content
        : null;
    } catch {
      return null;
    }
  }

  private buildSummary(
    findings: readonly DiagnosticFinding[],
  ): string {
    if (findings.length === 0) {
      return "No issues were detected from the available account and DNS data.";
    }

    const critical =
      findings.filter(
        (finding) =>
          finding.severity ===
          "critical",
      ).length;

    const warnings =
      findings.filter(
        (finding) =>
          finding.severity ===
          "warning",
      ).length;

    return `${findings.length} issue(s) detected: ${critical} critical, ${warnings} warning.`;
  }

  private deterministicRecommendation(
    findings: readonly DiagnosticFinding[],
  ): string {
    if (findings.length === 0) {
      return "No automated issues found. Ask the client for the exact error message, affected URL, and time it occurred.";
    }

    const steps =
      findings.map((finding) => {
        const action =
          recommendationByCode[
            finding.code
          ] ??
          finding.message;

        return `- ${action}`;
      });

    return [
      "Recommended actions (human approval required):",
      ...steps,
    ].join("\n");
  }

  private buildPrompt(
    account: HostingAccountRecord,
    findings: readonly DiagnosticFinding[],
    ticket?: HostingAssessmentTicket,
  ): string {
    const findingLines =
      findings.length > 0
        ? findings
            .map(
              (finding) =>
                `- [${finding.severity}] ${finding.message}`,
            )
            .join("\n")
        : "- None detected from account and DNS data.";

    return [
      "You are the Faith Harbor OS hosting support assistant.",
      "Diagnose the client's hosting issue and propose a concise, professional resolution.",
      "Only use the information provided. Do not invent account details.",
      "State clearly that a human must approve and apply any change.",
      "",
      `Domain: ${account.domain}`,
      `Account status: ${account.status}`,
      account.brand
        ? `Brand: ${account.brand}`
        : "",
      ticket
        ? `Support ticket ${ticket.number}: ${ticket.subject}`
        : "No linked support ticket.",
      "",
      "Automated findings:",
      findingLines,
      "",
      "Respond with a short diagnosis followed by numbered resolution steps.",
    ]
      .filter(
        (line) => line !== "",
      )
      .join("\n");
  }
}
