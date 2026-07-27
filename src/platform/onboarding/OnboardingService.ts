/**
 * The Success Center: a first-run onboarding checklist for a tenant. Every
 * step's "done" state is a REAL, measured signal from the tenant's own data —
 * nothing is faked or optimistically checked off. A step is only shown when the
 * platform can actually measure it (its signal is wired), so the checklist
 * never claims progress it can't verify.
 */
export interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  /** Where in the dashboard the tenant goes to complete this step. */
  href: string;
  done: boolean;
}

export interface OnboardingChecklist {
  steps: OnboardingStep[];
  completed: number;
  total: number;
  /** 0–100, rounded. 0 when there are no measurable steps. */
  percent: number;
  allDone: boolean;
}

interface StepDefinition {
  id: string;
  title: string;
  description: string;
  href: string;
}

/**
 * The closed, code-defined catalogue of onboarding steps, in the order a new
 * tenant should tackle them. A signal function (see {@link OnboardingSignals})
 * decides whether each is done.
 */
const STEPS: readonly StepDefinition[] = [
  {
    id: "brand",
    title: "Add your brand",
    description:
      "Upload a logo and set your colors so everything is yours, not ours.",
    href: "#branding",
  },
  {
    id: "client",
    title: "Add your first client",
    description:
      "Bring a customer into your CRM to start tracking work and revenue.",
    href: "#clients",
  },
  {
    id: "website",
    title: "Launch your website",
    description:
      "Generate a site with the AI builder and publish it to your domain.",
    href: "#websites",
  },
  {
    id: "ai-employee",
    title: "Hire an AI Employee",
    description:
      "Create a role-scoped AI assistant to help run your business.",
    href: "#ai-employees",
  },
  {
    id: "campaign",
    title: "Create a marketing campaign",
    description:
      "Set up an email campaign or drip to reach your audience.",
    href: "#marketing",
  },
  {
    id: "team",
    title: "Invite a teammate",
    description:
      "Add a colleague so you are not running everything alone.",
    href: "#team",
  },
] as const;

/**
 * A map from step id to a check that resolves true when the step is done.
 * Only the steps present here are shown — a step we cannot measure is omitted
 * rather than reported as incomplete, so the checklist is always truthful.
 */
export type OnboardingSignals = Record<
  string,
  () => Promise<boolean>
>;

export class OnboardingService {
  constructor(
    private readonly signals: OnboardingSignals,
  ) {}

  async checklist(): Promise<OnboardingChecklist> {
    const measurable = STEPS.filter(
      (step) => this.signals[step.id],
    );

    const steps: OnboardingStep[] =
      await Promise.all(
        measurable.map(
          async (step) => ({
            id: step.id,
            title: step.title,
            description:
              step.description,
            href: step.href,
            // A signal that throws counts as "not done" — never a crash.
            done: await this.signals[
              step.id
            ]().catch(() => false),
          }),
        ),
      );

    const total = steps.length;
    const completed = steps.filter(
      (s) => s.done,
    ).length;

    return {
      steps,
      completed,
      total,
      percent:
        total === 0
          ? 0
          : Math.round(
              (completed / total) *
                100,
            ),
      allDone:
        total > 0 &&
        completed === total,
    };
  }
}
