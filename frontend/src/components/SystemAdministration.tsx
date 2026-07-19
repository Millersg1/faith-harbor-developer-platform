import {
  useEffect,
  useState,
} from "react";

interface HealthResponse {
  version?: string;
  environment?: string;
  databaseConfigured?: boolean;
  aiConfigured?: boolean;
  whmConfigured?: boolean;
}

interface RegisteredProvider {
  id: string;
  name: string;
  models?: string[];
}

interface AIResponse {
  registeredProviders?: RegisteredProvider[];
  orchestration?: string[];
  finalAuthority?: string;
}

interface WhmResponse {
  configured?: boolean;
}

interface ProviderScorecard {
  providerId: string;
  providerName: string;
  statistics: {
    requests: number;
    averageTokens: number;
    estimatedCost: number;
  };
}

interface MetricsResponse {
  scorecards?: ProviderScorecard[];
  summary?: {
    totalEstimatedCost: number;
    totalRequests: number;
    totalTokens: number;
    currency: string;
  };
}

interface AdminState {
  health: HealthResponse;
  ai: AIResponse;
  metrics: MetricsResponse;
  whmConfigured: boolean;
}

async function getJson<T>(
  url: string,
): Promise<T | null> {
  try {
    const response =
      await fetch(url);

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function formatUsd(
  value: number,
): string {
  // Show more precision for small amounts so fractions of a cent
  // (typical for a single AI call) are not rounded away to $0.00.
  const fractionDigits =
    value > 0 && value < 1 ? 4 : 2;

  return new Intl.NumberFormat(
    "en-US",
    {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits:
        fractionDigits,
    },
  ).format(value);
}

function formatNumber(
  value: number,
): string {
  return new Intl.NumberFormat(
    "en-US",
  ).format(value);
}

function yesNo(
  value: boolean | undefined,
): string {
  return value
    ? "Connected"
    : "Not configured";
}

export default function SystemAdministration() {
  const [state, setState] =
    useState<AdminState | null>(null);

  const [loading, setLoading] =
    useState(true);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      getJson<HealthResponse>(
        "/health",
      ),
      getJson<AIResponse>(
        "/api/v1/ai",
      ),
      getJson<MetricsResponse>(
        "/api/v1/ai/metrics",
      ),
      getJson<WhmResponse>(
        "/api/v1/hosting/whm",
      ),
    ])
      .then(
        ([
          health,
          ai,
          metrics,
          whm,
        ]) => {
          if (cancelled) {
            return;
          }

          setState({
            health: health ?? {},
            ai: ai ?? {},
            metrics: metrics ?? {},
            whmConfigured: Boolean(
              whm?.configured,
            ),
          });
        },
      )
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading || !state) {
    return (
      <div className="card">
        <p className="help-text">
          Loading system
          administration...
        </p>
      </div>
    );
  }

  const {
    health,
    ai,
    metrics,
    whmConfigured,
  } = state;

  const providers =
    ai.registeredProviders ?? [];

  const scorecards =
    metrics.scorecards ?? [];

  const spend = metrics.summary;

  const orchestration =
    ai.orchestration ?? [];

  return (
    <>
      <div className="card">
        <div className="card-heading">
          <div>
            <p className="eyebrow">
              Administration
            </p>

            <h3>System Overview</h3>
          </div>
        </div>

        <div className="client-overview">
          <div className="client-overview-item">
            <span>Version</span>

            <strong>
              {health.version ??
                "Unknown"}
            </strong>
          </div>

          <div className="client-overview-item">
            <span>Environment</span>

            <strong>
              {health.environment ??
                "Unknown"}
            </strong>
          </div>

          <div className="client-overview-item">
            <span>
              Persistent Storage
            </span>

            <strong>
              {health.databaseConfigured
                ? "SQLite connected"
                : "In-memory"}
            </strong>
          </div>

          <div className="client-overview-item">
            <span>AI Runtime</span>

            <strong>
              {yesNo(
                health.aiConfigured,
              )}
            </strong>
          </div>

          <div className="client-overview-item">
            <span>
              WHM (Hosting)
            </span>

            <strong>
              {whmConfigured
                ? "Connected"
                : "Not configured"}
            </strong>
          </div>

          <div className="client-overview-item">
            <span>
              Human Authority
            </span>

            <strong>
              {ai.finalAuthority ??
                "Required"}
            </strong>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-heading">
          <div>
            <p className="eyebrow">
              Artificial Intelligence
            </p>

            <h3>AI Providers</h3>
          </div>
        </div>

        {providers.length === 0 ? (
          <p className="help-text">
            No AI providers are
            registered. Configure
            provider keys on the server
            to enable AI features.
          </p>
        ) : (
          <div className="record-list">
            {providers.map(
              (provider) => (
                <div
                  className="line-item-summary"
                  key={provider.id}
                >
                  <span>
                    {provider.name}
                  </span>

                  <span>
                    {provider.models &&
                    provider.models
                      .length > 0
                      ? provider.models.join(
                          ", ",
                        )
                      : provider.id}
                  </span>
                </div>
              ),
            )}
          </div>
        )}

        {orchestration.length > 0 && (
          <p className="help-text">
            Orchestration:{" "}
            {orchestration.join(", ")}
          </p>
        )}

        <p className="help-text">
          Provider credentials and the
          administrator login are
          managed through the server
          environment. See the cPanel
          deployment guide.
        </p>
      </div>

      <div className="card">
        <div className="card-heading">
          <div>
            <p className="eyebrow">
              Artificial Intelligence
            </p>

            <h3>AI Spend</h3>
          </div>
        </div>

        <div className="metrics-grid">
          <article className="metric-card">
            <span className="metric-label">
              Estimated Cost
            </span>

            <strong className="metric-value metric-word">
              {formatUsd(
                spend?.totalEstimatedCost ??
                  0,
              )}
            </strong>

            <span className="metric-detail">
              Since first use
            </span>
          </article>

          <article className="metric-card">
            <span className="metric-label">
              AI Requests
            </span>

            <strong className="metric-value">
              {formatNumber(
                spend?.totalRequests ??
                  0,
              )}
            </strong>

            <span className="metric-detail">
              Total calls
            </span>
          </article>

          <article className="metric-card">
            <span className="metric-label">
              Tokens
            </span>

            <strong className="metric-value">
              {formatNumber(
                spend?.totalTokens ??
                  0,
              )}
            </strong>

            <span className="metric-detail">
              Input + output
            </span>
          </article>
        </div>

        {scorecards.length > 0 && (
          <div className="record-list">
            {scorecards.map(
              (card) => (
                <div
                  className="line-item-summary"
                  key={card.providerId}
                >
                  <span>
                    {card.providerName}
                  </span>

                  <span>
                    {formatUsd(
                      card.statistics
                        .estimatedCost,
                    )}{" "}
                    ·{" "}
                    {formatNumber(
                      card.statistics
                        .requests,
                    )}{" "}
                    calls
                  </span>
                </div>
              ),
            )}
          </div>
        )}

        <p className="help-text">
          Costs are estimates from an
          editable per-model price list
          (src/ai/metrics/AiPricing.ts).
          Local models are free. Adjust
          the rates to match your
          provider plan.
        </p>
      </div>
    </>
  );
}
