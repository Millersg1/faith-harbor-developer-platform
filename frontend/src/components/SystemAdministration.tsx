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

interface BackupEntry {
  name: string;
  createdAt: string;
  sizeBytes: number;
}

interface StatusMessage {
  message: string;
  type:
    | "working"
    | "success"
    | "error";
}

function formatBytes(
  bytes: number,
): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(0)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function SystemAdministration() {
  const [state, setState] =
    useState<AdminState | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [backups, setBackups] =
    useState<BackupEntry[]>([]);

  const [
    backupsAvailable,
    setBackupsAvailable,
  ] = useState(false);

  const [backingUp, setBackingUp] =
    useState(false);

  const loadBackups =
    async (): Promise<void> => {
      const data = await getJson<{
        available?: boolean;
        backups?: BackupEntry[];
      }>(
        "/api/v1/system/backups",
      );

      setBackupsAvailable(
        Boolean(data?.available),
      );
      setBackups(
        data?.backups ?? [],
      );
    };

  useEffect(() => {
    void loadBackups();
  }, []);

  async function runBackup(): Promise<void> {
    setBackingUp(true);

    try {
      await fetch(
        "/api/v1/system/backups",
        { method: "POST" },
      );

      await loadBackups();
    } catch {
      // Ignored; the list simply won't update.
    } finally {
      setBackingUp(false);
    }
  }

  // ---- Brands ----
  interface Brand {
    id: string;
    name: string;
    domain?: string;
    fromEmail?: string;
    emailSignature?: string;
  }

  const [brands, setBrands] =
    useState<Brand[]>([]);
  const [newBrand, setNewBrand] =
    useState({
      name: "",
      domain: "",
      fromEmail: "",
      emailSignature: "",
    });

  const loadBrands =
    async (): Promise<void> => {
      const data = await getJson<{
        brands?: Brand[];
      }>("/api/v1/brands");
      setBrands(
        data?.brands ?? [],
      );
    };

  useEffect(() => {
    void loadBrands();
  }, []);

  async function addBrand(): Promise<void> {
    if (!newBrand.name.trim()) {
      return;
    }

    await fetch("/api/v1/brands", {
      method: "POST",
      headers: {
        "Content-Type":
          "application/json",
      },
      body: JSON.stringify(newBrand),
    });

    setNewBrand({
      name: "",
      domain: "",
      fromEmail: "",
      emailSignature: "",
    });

    await loadBrands();
  }

  // ---- SaaS Surface API keys ----
  interface ApiKeySummary {
    id: string;
    name: string;
    brandId?: string;
    prefix: string;
    createdAt: string;
    lastUsedAt?: string;
  }

  const [apiKeys, setApiKeys] =
    useState<ApiKeySummary[]>([]);
  const [newKeyName, setNewKeyName] =
    useState("");
  const [newKeyBrand, setNewKeyBrand] =
    useState("");
  const [createdKey, setCreatedKey] =
    useState<string | null>(null);

  const loadApiKeys =
    async (): Promise<void> => {
      const data = await getJson<{
        apiKeys?: ApiKeySummary[];
      }>("/api/v1/api-keys");
      setApiKeys(
        data?.apiKeys ?? [],
      );
    };

  useEffect(() => {
    void loadApiKeys();
  }, []);

  async function createApiKey(): Promise<void> {
    if (!newKeyName.trim()) {
      return;
    }

    const r = await fetch(
      "/api/v1/api-keys",
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",
        },
        body: JSON.stringify({
          name: newKeyName,
          brandId:
            newKeyBrand || undefined,
        }),
      },
    );

    if (r.ok) {
      const data =
        (await r.json()) as {
          key: string;
        };
      // Shown once; it cannot be recovered later.
      setCreatedKey(data.key);
      setNewKeyName("");
      setNewKeyBrand("");
      await loadApiKeys();
    }
  }

  async function revokeApiKey(
    id: string,
  ): Promise<void> {
    await fetch(
      `/api/v1/api-keys/${id}`,
      { method: "DELETE" },
    );
    await loadApiKeys();
  }

  // ---- Security: password change + 2FA ----
  const [authConfigured, setAuthConfigured] =
    useState(false);
  const [twoFa, setTwoFa] =
    useState(false);
  const [currentPw, setCurrentPw] =
    useState("");
  const [newPw, setNewPw] =
    useState("");
  const [secMsg, setSecMsg] =
    useState<StatusMessage | null>(
      null,
    );
  const [
    totpSetup,
    setTotpSetup,
  ] = useState<{
    secret: string;
    otpauthUrl: string;
  } | null>(null);
  const [enableCode, setEnableCode] =
    useState("");

  useEffect(() => {
    fetch("/api/v1/auth/me")
      .then((r) =>
        r.ok ? r.json() : null,
      )
      .then(
        (data: {
          authenticated?: boolean;
          twoFactorEnabled?: boolean;
        } | null) => {
          if (
            data?.authenticated
          ) {
            setAuthConfigured(true);
            setTwoFa(
              Boolean(
                data.twoFactorEnabled,
              ),
            );
          }
        },
      )
      .catch(() => {});
  }, []);

  async function changePassword(): Promise<void> {
    setSecMsg(null);

    try {
      const r = await fetch(
        "/api/v1/auth/change-password",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            currentPassword:
              currentPw,
            newPassword: newPw,
          }),
        },
      );

      const data =
        (await r.json()) as {
          error?: {
            message?: string;
          };
        };

      if (!r.ok) {
        throw new Error(
          data.error?.message ??
            "Could not change password.",
        );
      }

      setCurrentPw("");
      setNewPw("");
      setSecMsg({
        message:
          "Password changed.",
        type: "success",
      });
    } catch (error) {
      setSecMsg({
        message:
          error instanceof Error
            ? error.message
            : "Could not change password.",
        type: "error",
      });
    }
  }

  async function start2fa(): Promise<void> {
    setSecMsg(null);

    const r = await fetch(
      "/api/v1/auth/2fa/setup",
      { method: "POST" },
    );

    if (r.ok) {
      setTotpSetup(
        (await r.json()) as {
          secret: string;
          otpauthUrl: string;
        },
      );
    }
  }

  async function confirm2fa(): Promise<void> {
    setSecMsg(null);

    try {
      const r = await fetch(
        "/api/v1/auth/2fa/enable",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            code: enableCode,
          }),
        },
      );

      const data =
        (await r.json()) as {
          error?: {
            message?: string;
          };
        };

      if (!r.ok) {
        throw new Error(
          data.error?.message ??
            "Could not enable 2FA.",
        );
      }

      setTwoFa(true);
      setTotpSetup(null);
      setEnableCode("");
      setSecMsg({
        message:
          "Two-factor authentication enabled.",
        type: "success",
      });
    } catch (error) {
      setSecMsg({
        message:
          error instanceof Error
            ? error.message
            : "Could not enable 2FA.",
        type: "error",
      });
    }
  }

  async function disable2fa(): Promise<void> {
    await fetch(
      "/api/v1/auth/2fa/disable",
      { method: "POST" },
    );
    setTwoFa(false);
    setSecMsg({
      message:
        "Two-factor authentication disabled.",
      type: "success",
    });
  }

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

      <div className="card">
        <div className="card-heading">
          <div>
            <p className="eyebrow">
              Data Protection
            </p>

            <h3>Backups</h3>
          </div>

          {backupsAvailable && (
            <button
              type="button"
              className="secondary-button"
              disabled={backingUp}
              onClick={() =>
                void runBackup()
              }
            >
              {backingUp
                ? "Backing up..."
                : "Back Up Now"}
            </button>
          )}
        </div>

        {!backupsAvailable ? (
          <p className="help-text">
            Backups run against the
            database. They are active
            on the server.
          </p>
        ) : backups.length === 0 ? (
          <p className="help-text">
            No backups yet. One is taken
            automatically at startup and
            daily.
          </p>
        ) : (
          <>
            <div className="client-overview">
              <div className="client-overview-item">
                <span>
                  Latest backup
                </span>

                <strong>
                  {new Date(
                    backups[0].createdAt,
                  ).toLocaleString()}
                </strong>
              </div>

              <div className="client-overview-item">
                <span>Kept</span>

                <strong>
                  {backups.length}{" "}
                  snapshot
                  {backups.length ===
                  1
                    ? ""
                    : "s"}
                </strong>
              </div>
            </div>

            <div className="record-list">
              {backups
                .slice(0, 5)
                .map((backup) => (
                  <div
                    className="line-item-summary"
                    key={backup.name}
                  >
                    <span>
                      {new Date(
                        backup.createdAt,
                      ).toLocaleString()}
                    </span>

                    <span>
                      {formatBytes(
                        backup.sizeBytes,
                      )}
                    </span>
                  </div>
                ))}
            </div>
          </>
        )}

        <p className="help-text">
          Each backup is a complete,
          consistent copy of the
          database. Automatic daily;
          the most recent are kept.
        </p>
      </div>

      <div className="card">
        <div className="card-heading">
          <div>
            <p className="eyebrow">
              Organization
            </p>

            <h3>Brands</h3>
          </div>
        </div>

        <p className="help-text">
          The businesses you run under
          one company (e.g. Faith Harbor
          Web Hosting, All Elite
          Hosting). Tag clients with a
          brand; each brand can send
          email in its own voice.
        </p>

        {brands.length > 0 && (
          <div className="record-list">
            {brands.map((brand) => (
              <div
                className="line-item-summary"
                key={brand.id}
              >
                <span>
                  {brand.name}
                </span>
                <span>
                  {brand.fromEmail ??
                    brand.domain ??
                    ""}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="form-group">
          <label htmlFor="brand-name">
            Brand name
          </label>
          <input
            id="brand-name"
            type="text"
            value={newBrand.name}
            onChange={(e) =>
              setNewBrand({
                ...newBrand,
                name: e.target.value,
              })
            }
          />
        </div>

        <div className="form-group">
          <label htmlFor="brand-domain">
            Domain
          </label>
          <input
            id="brand-domain"
            type="text"
            placeholder="allelitehosting.com"
            value={newBrand.domain}
            onChange={(e) =>
              setNewBrand({
                ...newBrand,
                domain:
                  e.target.value,
              })
            }
          />
        </div>

        <div className="form-group">
          <label htmlFor="brand-from">
            From email
          </label>
          <input
            id="brand-from"
            type="email"
            placeholder="hello@allelitehosting.com"
            value={newBrand.fromEmail}
            onChange={(e) =>
              setNewBrand({
                ...newBrand,
                fromEmail:
                  e.target.value,
              })
            }
          />
        </div>

        <div className="form-group">
          <label htmlFor="brand-sig">
            Email signature (this
            brand's voice)
          </label>
          <textarea
            id="brand-sig"
            rows={3}
            placeholder={
              "The All Elite Hosting Team"
            }
            value={
              newBrand.emailSignature
            }
            onChange={(e) =>
              setNewBrand({
                ...newBrand,
                emailSignature:
                  e.target.value,
              })
            }
          />
        </div>

        <button
          type="button"
          className="secondary-button"
          onClick={() =>
            void addBrand()
          }
        >
          Add Brand
        </button>
      </div>

      <div className="card">
        <div className="card-heading">
          <div>
            <p className="eyebrow">
              SaaS Surface Engine
            </p>

            <h3>API Keys</h3>
          </div>
        </div>

        <p className="help-text">
          Faith Harbor OS is the engine
          behind SaaS Surface. Create a
          key, then point saassurface.com
          (and your product Stripe
          webhooks) at{" "}
          <code>
            {`${window.location.origin}/api/zapier`}
          </code>{" "}
          with the header{" "}
          <code>X-API-Key</code>. AI run
          through this engine is tracked
          in AI Spend above.
        </p>

        {createdKey && (
          <div className="status-message success">
            Copy this key now — it is
            shown only once:
            <br />
            <code>{createdKey}</code>
          </div>
        )}

        {apiKeys.length > 0 && (
          <div className="record-list">
            {apiKeys.map((key) => (
              <div
                className="line-item-summary"
                key={key.id}
              >
                <span>
                  {key.name}{" "}
                  <code>
                    {key.prefix}…
                  </code>
                </span>

                <span>
                  {key.lastUsedAt
                    ? `Used ${new Date(
                        key.lastUsedAt,
                      ).toLocaleDateString()}`
                    : "Never used"}{" "}
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() =>
                      void revokeApiKey(
                        key.id,
                      )
                    }
                  >
                    Revoke
                  </button>
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="form-group">
          <label htmlFor="key-name">
            Key name
          </label>
          <input
            id="key-name"
            type="text"
            placeholder="SaaS Surface — product launches"
            value={newKeyName}
            onChange={(e) =>
              setNewKeyName(
                e.target.value,
              )
            }
          />
        </div>

        <div className="form-group">
          <label htmlFor="key-brand">
            Brand (optional — sets the
            voice for onboarding email)
          </label>
          <select
            id="key-brand"
            value={newKeyBrand}
            onChange={(e) =>
              setNewKeyBrand(
                e.target.value,
              )
            }
          >
            <option value="">
              No specific brand
            </option>
            {brands.map((brand) => (
              <option
                key={brand.id}
                value={brand.id}
              >
                {brand.name}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          className="secondary-button"
          onClick={() =>
            void createApiKey()
          }
        >
          Create API Key
        </button>
      </div>

      {authConfigured && (
        <div className="card">
          <div className="card-heading">
            <div>
              <p className="eyebrow">
                Administration
              </p>

              <h3>Security</h3>
            </div>
          </div>

          {secMsg && (
            <div
              className={`status-message ${secMsg.type}`}
            >
              {secMsg.message}
            </div>
          )}

          <h4>Change Password</h4>

          <div className="form-group">
            <label htmlFor="cur-pw">
              Current password
            </label>
            <input
              id="cur-pw"
              type="password"
              value={currentPw}
              onChange={(e) =>
                setCurrentPw(
                  e.target.value,
                )
              }
            />
          </div>

          <div className="form-group">
            <label htmlFor="new-pw">
              New password (8+
              characters)
            </label>
            <input
              id="new-pw"
              type="password"
              value={newPw}
              onChange={(e) =>
                setNewPw(
                  e.target.value,
                )
              }
            />
          </div>

          <button
            type="button"
            className="secondary-button"
            onClick={() =>
              void changePassword()
            }
          >
            Change Password
          </button>

          <div className="section-divider" />

          <h4>
            Two-Factor Authentication
          </h4>

          {twoFa ? (
            <>
              <p className="help-text">
                2FA is <strong>on</strong>.
                Sign-in requires a code
                from your authenticator
                app.
              </p>
              <button
                type="button"
                className="secondary-button"
                onClick={() =>
                  void disable2fa()
                }
              >
                Disable 2FA
              </button>
            </>
          ) : totpSetup ? (
            <>
              <p className="help-text">
                Add this key to your
                authenticator app
                (Google Authenticator,
                Authy, 1Password), then
                enter the 6-digit code
                to confirm.
              </p>
              <p className="help-text">
                <strong>
                  Setup key:
                </strong>{" "}
                <code>
                  {totpSetup.secret}
                </code>
              </p>
              <div className="form-group">
                <label htmlFor="enable-code">
                  6-digit code
                </label>
                <input
                  id="enable-code"
                  type="text"
                  inputMode="numeric"
                  placeholder="123456"
                  value={enableCode}
                  onChange={(e) =>
                    setEnableCode(
                      e.target.value,
                    )
                  }
                />
              </div>
              <button
                type="button"
                className="primary-button"
                onClick={() =>
                  void confirm2fa()
                }
              >
                Confirm & Enable
              </button>
            </>
          ) : (
            <>
              <p className="help-text">
                Add a second layer to
                your login with an
                authenticator app.
              </p>
              <button
                type="button"
                className="secondary-button"
                onClick={() =>
                  void start2fa()
                }
              >
                Enable 2FA
              </button>
            </>
          )}
        </div>
      )}
    </>
  );
}
