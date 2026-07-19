import {
  useEffect,
  useMemo,
  useState,
} from "react";
import type {
  SyntheticEvent,
} from "react";

import ConfirmDeleteButton from "../components/ConfirmDeleteButton";

type CampaignStatus =
  | "planned"
  | "active"
  | "paused"
  | "completed";

const campaignStatuses: readonly CampaignStatus[] =
  [
    "planned",
    "active",
    "paused",
    "completed",
  ];

// Common channels, including social media, offered as suggestions.
const channelSuggestions: readonly string[] =
  [
    "Facebook",
    "Instagram",
    "LinkedIn",
    "YouTube",
    "TikTok",
    "X (Twitter)",
    "Email",
    "Google Ads",
    "SEO",
    "Blog",
    "Podcast",
  ];

interface Client {
  id: string;
  companyName: string;
}

interface ClientsResponse {
  count: number;
  clients: Client[];
}

interface Campaign {
  id: string;
  clientId?: string;
  name: string;
  channel?: string;
  status: CampaignStatus;
  audience?: string;
  budget?: number;
  spend?: number;
  leads?: number;
  startDate?: string;
  endDate?: string;
  owner?: string;
  notes?: string;
  metadata: Record<
    string,
    unknown
  >;
  createdAt: string;
  updatedAt: string;
}

interface CampaignsResponse {
  count: number;
  campaigns: Campaign[];
}

interface CampaignMutationResponse {
  success: boolean;
  status: CampaignStatus;
  campaign: Campaign;
}

interface CampaignFormData {
  name: string;
  channel: string;
  status: CampaignStatus;
  audience: string;
  budget: string;
  owner: string;
}

interface StatusMessage {
  message: string;
  type:
    | "working"
    | "success"
    | "error";
}

const emptyForm:
  CampaignFormData = {
    name: "",
    channel: "",
    status: "planned",
    audience: "",
    budget: "",
    owner: "",
  };

function getErrorMessage(
  error: unknown,
  fallback: string,
): string {
  return error instanceof Error
    ? error.message
    : fallback;
}

async function getResponseData<T>(
  response: Response,
  fallbackMessage: string,
): Promise<T> {
  const responseText =
    await response.text();

  if (!responseText.trim()) {
    if (response.ok) {
      return undefined as T;
    }

    throw new Error(fallbackMessage);
  }

  let result: unknown;

  try {
    result = JSON.parse(responseText);
  } catch {
    throw new Error(
      response.ok
        ? "The server returned an invalid response."
        : fallbackMessage,
    );
  }

  if (!response.ok) {
    if (
      typeof result === "object" &&
      result !== null
    ) {
      const errorResult =
        result as {
          error?: {
            message?: string;
          };
        };

      throw new Error(
        errorResult.error
          ?.message ??
          fallbackMessage,
      );
    }

    throw new Error(fallbackMessage);
  }

  return result as T;
}

function formatLabel(
  value: string,
): string {
  return (
    value.charAt(0).toUpperCase() +
    value.slice(1)
  );
}

function formatMoney(
  value?: number,
): string {
  if (
    value === undefined ||
    Number.isNaN(value)
  ) {
    return "$0";
  }

  return new Intl.NumberFormat(
    "en-US",
    {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    },
  ).format(value);
}

async function requestCampaigns():
Promise<CampaignsResponse> {
  const response = await fetch(
    "/api/v1/campaigns",
  );

  return getResponseData<CampaignsResponse>(
    response,
    "Campaigns could not be loaded.",
  );
}

export default function MarketingPage() {
  const [clients, setClients] =
    useState<Client[]>([]);

  const [campaigns, setCampaigns] =
    useState<Campaign[]>([]);

  const [
    selectedCampaign,
    setSelectedCampaign,
  ] = useState<Campaign | null>(null);

  const [formData, setFormData] =
    useState<CampaignFormData>(
      emptyForm,
    );

  const [status, setStatus] =
    useState<StatusMessage | null>(
      null,
    );

  const [loading, setLoading] =
    useState(true);

  const [creating, setCreating] =
    useState(false);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      fetch("/api/v1/clients").then(
        (response) =>
          getResponseData<ClientsResponse>(
            response,
            "Clients could not be loaded.",
          ),
      ),
      requestCampaigns(),
    ])
      .then(
        ([
          clientsResult,
          campaignsResult,
        ]) => {
          if (cancelled) {
            return;
          }

          setClients(
            clientsResult.clients,
          );

          setCampaigns(
            campaignsResult.campaigns,
          );
        },
      )
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }

        setStatus({
          message:
            getErrorMessage(
              error,
              "Marketing information could not be loaded.",
            ),
          type: "error",
        });
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const clientNames = useMemo(() => {
    const names =
      new Map<string, string>();

    for (const client of clients) {
      names.set(
        client.id,
        client.companyName,
      );
    }

    return names;
  }, [clients]);

  const metrics = useMemo(() => {
    let active = 0;
    let budget = 0;
    let leads = 0;

    for (const campaign of campaigns) {
      if (
        campaign.status === "active"
      ) {
        active += 1;
      }

      budget +=
        campaign.budget ?? 0;

      leads +=
        campaign.leads ?? 0;
    }

    return {
      total: campaigns.length,
      active,
      budget,
      leads,
    };
  }, [campaigns]);

  async function reloadCampaigns():
  Promise<void> {
    const result =
      await requestCampaigns();

    setCampaigns(result.campaigns);
  }

  async function handleCreate(
    event: SyntheticEvent,
  ): Promise<void> {
    event.preventDefault();

    if (!formData.name.trim()) {
      setStatus({
        message:
          "A campaign name is required.",
        type: "error",
      });

      return;
    }

    const budget =
      formData.budget.trim()
        ? Number(formData.budget)
        : undefined;

    if (
      budget !== undefined &&
      (Number.isNaN(budget) ||
        budget < 0)
    ) {
      setStatus({
        message:
          "Budget must be a non-negative number.",
        type: "error",
      });

      return;
    }

    setCreating(true);

    setStatus({
      message: "Adding campaign...",
      type: "working",
    });

    try {
      const response = await fetch(
        "/api/v1/campaigns",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            name:
              formData.name.trim(),
            channel:
              formData.channel
                .trim() ||
              undefined,
            status:
              formData.status,
            audience:
              formData.audience
                .trim() ||
              undefined,
            budget,
            owner:
              formData.owner
                .trim() ||
              undefined,
          }),
        },
      );

      const result =
        await getResponseData<CampaignMutationResponse>(
          response,
          "The campaign could not be added.",
        );

      await reloadCampaigns();

      setSelectedCampaign(
        result.campaign,
      );

      setFormData(emptyForm);

      setStatus({
        message: `Added "${result.campaign.name}".`,
        type: "success",
      });
    } catch (error) {
      setStatus({
        message:
          getErrorMessage(
            error,
            "The campaign could not be added.",
          ),
        type: "error",
      });
    } finally {
      setCreating(false);
    }
  }

  async function handleStatusChange(
    campaign: Campaign,
    nextStatus: CampaignStatus,
  ): Promise<void> {
    setStatus({
      message: "Updating campaign...",
      type: "working",
    });

    try {
      const response = await fetch(
        `/api/v1/campaigns/${campaign.id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            status: nextStatus,
          }),
        },
      );

      const result =
        await getResponseData<CampaignMutationResponse>(
          response,
          "The campaign could not be updated.",
        );

      await reloadCampaigns();

      setSelectedCampaign(
        result.campaign,
      );

      setStatus({
        message: `"${result.campaign.name}" is now ${formatLabel(
          nextStatus,
        )}.`,
        type: "success",
      });
    } catch (error) {
      setStatus({
        message:
          getErrorMessage(
            error,
            "The campaign could not be updated.",
          ),
        type: "error",
      });
    }
  }

  async function handleDelete(
    campaign: Campaign,
  ): Promise<void> {
    const response = await fetch(
      `/api/v1/campaigns/${campaign.id}`,
      {
        method: "DELETE",
      },
    );

    if (
      !response.ok &&
      response.status !== 204
    ) {
      await getResponseData<unknown>(
        response,
        "The campaign could not be deleted.",
      );
    }

    await reloadCampaigns();

    setSelectedCampaign((current) =>
      current?.id === campaign.id
        ? null
        : current,
    );

    setStatus({
      message: `Removed "${campaign.name}".`,
      type: "success",
    });
  }

  return (
    <section className="workspace active">
      <div className="workspace-heading">
        <div>
          <p className="eyebrow">
            Marketing
          </p>

          <h3>
            Campaigns & Social
          </h3>

          <p className="help-text">
            Plan and track marketing
            campaigns across every
            channel &mdash; social
            media, email, ads, SEO,
            blog, and podcast. Leads
            generated flow into Sales.
          </p>
        </div>
      </div>

      {status && (
        <div
          className={`status-message ${status.type}`}
        >
          {status.message}
        </div>
      )}

      <div
        className="metrics-grid"
        aria-label="Marketing summary"
      >
        <article className="metric-card">
          <span className="metric-label">
            Campaigns
          </span>

          <strong className="metric-value">
            {loading
              ? "..."
              : metrics.total}
          </strong>

          <span className="metric-detail">
            All campaigns
          </span>
        </article>

        <article className="metric-card">
          <span className="metric-label">
            Active
          </span>

          <strong className="metric-value">
            {loading
              ? "..."
              : metrics.active}
          </strong>

          <span className="metric-detail">
            Currently running
          </span>
        </article>

        <article className="metric-card">
          <span className="metric-label">
            Budget
          </span>

          <strong className="metric-value metric-word">
            {loading
              ? "..."
              : formatMoney(
                  metrics.budget,
                )}
          </strong>

          <span className="metric-detail">
            Planned across campaigns
          </span>
        </article>

        <article className="metric-card">
          <span className="metric-label">
            Leads
          </span>

          <strong className="metric-value">
            {loading
              ? "..."
              : metrics.leads}
          </strong>

          <span className="metric-detail">
            Generated to date
          </span>
        </article>
      </div>

      <div className="workspace-grid">
        <section className="card">
          <div className="card-heading">
            <div>
              <p className="eyebrow">
                New Campaign
              </p>

              <h3>Add Campaign</h3>
            </div>
          </div>

          <form
            onSubmit={(event) =>
              void handleCreate(
                event,
              )
            }
          >
            <div className="form-group">
              <label htmlFor="campaign-name">
                Name
              </label>

              <input
                id="campaign-name"
                type="text"
                value={
                  formData.name
                }
                onChange={(event) =>
                  setFormData(
                    (current) => ({
                      ...current,
                      name:
                        event.target
                          .value,
                    }),
                  )
                }
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="campaign-channel">
                Channel
              </label>

              <input
                id="campaign-channel"
                type="text"
                list="campaign-channel-options"
                placeholder="Facebook / Instagram / Email / SEO"
                value={
                  formData.channel
                }
                onChange={(event) =>
                  setFormData(
                    (current) => ({
                      ...current,
                      channel:
                        event.target
                          .value,
                    }),
                  )
                }
              />

              <datalist id="campaign-channel-options">
                {channelSuggestions.map(
                  (channel) => (
                    <option
                      key={channel}
                      value={channel}
                    />
                  ),
                )}
              </datalist>
            </div>

            <div className="form-group">
              <label htmlFor="campaign-audience">
                Audience
              </label>

              <input
                id="campaign-audience"
                type="text"
                value={
                  formData.audience
                }
                onChange={(event) =>
                  setFormData(
                    (current) => ({
                      ...current,
                      audience:
                        event.target
                          .value,
                    }),
                  )
                }
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="campaign-budget">
                  Budget
                </label>

                <input
                  id="campaign-budget"
                  type="number"
                  min="0"
                  step="1"
                  value={
                    formData.budget
                  }
                  onChange={(event) =>
                    setFormData(
                      (current) => ({
                        ...current,
                        budget:
                          event
                            .target
                            .value,
                      }),
                    )
                  }
                />
              </div>

              <div className="form-group">
                <label htmlFor="campaign-status">
                  Status
                </label>

                <select
                  id="campaign-status"
                  value={
                    formData.status
                  }
                  onChange={(event) =>
                    setFormData(
                      (current) => ({
                        ...current,
                        status:
                          event
                            .target
                            .value as CampaignStatus,
                      }),
                    )
                  }
                >
                  {campaignStatuses.map(
                    (value) => (
                      <option
                        key={value}
                        value={value}
                      >
                        {formatLabel(
                          value,
                        )}
                      </option>
                    ),
                  )}
                </select>
              </div>
            </div>

            <button
              type="submit"
              className="primary-button"
              disabled={creating}
            >
              {creating
                ? "Saving..."
                : "Add Campaign"}
            </button>
          </form>
        </section>

        <section className="card">
          <div className="card-heading">
            <div>
              <p className="eyebrow">
                Campaigns
              </p>

              <h3>All Campaigns</h3>
            </div>
          </div>

          {loading ? (
            <p className="help-text">
              Loading campaigns...
            </p>
          ) : campaigns.length ===
            0 ? (
            <p className="help-text">
              No campaigns yet. Add the
              first one to start
              tracking marketing.
            </p>
          ) : (
            <div className="record-list">
              {campaigns.map(
                (campaign) => (
                  <button
                    type="button"
                    className="record-button"
                    key={campaign.id}
                    onClick={() =>
                      setSelectedCampaign(
                        campaign,
                      )
                    }
                  >
                    <span className="record-title">
                      {campaign.name}
                    </span>

                    <span className="record-detail">
                      <span
                        className={`campaign-status campaign-status-${campaign.status}`}
                      >
                        {formatLabel(
                          campaign.status,
                        )}
                      </span>{" "}
                      {campaign.channel ||
                        "No channel"}
                    </span>
                  </button>
                ),
              )}
            </div>
          )}
        </section>
      </div>

      {selectedCampaign && (
        <section className="card">
          <div className="card-heading">
            <div>
              <p className="eyebrow">
                {selectedCampaign.channel ||
                  "Campaign"}
              </p>

              <h3>
                {selectedCampaign.name}
              </h3>
            </div>

            <button
              type="button"
              className="secondary-button"
              onClick={() =>
                setSelectedCampaign(
                  null,
                )
              }
            >
              Close
            </button>
          </div>

          <div className="client-overview">
            <div className="client-overview-item">
              <span>Status</span>

              <strong>
                {formatLabel(
                  selectedCampaign.status,
                )}
              </strong>
            </div>

            <div className="client-overview-item">
              <span>Channel</span>

              <strong>
                {selectedCampaign.channel ||
                  "Not set"}
              </strong>
            </div>

            <div className="client-overview-item">
              <span>Audience</span>

              <strong>
                {selectedCampaign.audience ||
                  "Not set"}
              </strong>
            </div>

            <div className="client-overview-item">
              <span>Budget</span>

              <strong>
                {formatMoney(
                  selectedCampaign.budget,
                )}
              </strong>
            </div>

            <div className="client-overview-item">
              <span>Spend</span>

              <strong>
                {formatMoney(
                  selectedCampaign.spend,
                )}
              </strong>
            </div>

            <div className="client-overview-item">
              <span>Client</span>

              <strong>
                {selectedCampaign.clientId
                  ? clientNames.get(
                      selectedCampaign.clientId,
                    ) ?? "Client"
                  : "Faith Harbor"}
              </strong>
            </div>
          </div>

          {selectedCampaign.notes && (
            <p className="client-notes">
              {selectedCampaign.notes}
            </p>
          )}

          <div className="section-divider" />

          <div className="form-group">
            <label htmlFor="campaign-status-update">
              Update status
            </label>

            <select
              id="campaign-status-update"
              value={
                selectedCampaign.status
              }
              onChange={(event) =>
                void handleStatusChange(
                  selectedCampaign,
                  event.target
                    .value as CampaignStatus,
                )
              }
            >
              {campaignStatuses.map(
                (value) => (
                  <option
                    key={value}
                    value={value}
                  >
                    {formatLabel(
                      value,
                    )}
                  </option>
                ),
              )}
            </select>
          </div>

          <ConfirmDeleteButton
            recordName={`"${selectedCampaign.name}"`}
            onDelete={() =>
              handleDelete(
                selectedCampaign,
              )
            }
          />
        </section>
      )}
    </section>
  );
}
