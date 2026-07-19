import {
  useEffect,
  useMemo,
  useState,
} from "react";
import type {
  SyntheticEvent,
} from "react";

import ConfirmDeleteButton from "../components/ConfirmDeleteButton";

type ProductStatus =
  | "planning"
  | "active"
  | "maintenance"
  | "archived";

const productStatuses: readonly ProductStatus[] =
  [
    "planning",
    "active",
    "maintenance",
    "archived",
  ];

interface Client {
  id: string;
  companyName: string;
}

interface ClientsResponse {
  count: number;
  clients: Client[];
}

interface Product {
  id: string;
  clientId?: string;
  name: string;
  description?: string;
  status: ProductStatus;
  repoUrl?: string;
  language?: string;
  version?: string;
  lastReleaseDate?: string;
  owner?: string;
  notes?: string;
  metadata: Record<
    string,
    unknown
  >;
  createdAt: string;
  updatedAt: string;
}

interface ProductsResponse {
  count: number;
  products: Product[];
}

interface ProductMutationResponse {
  success: boolean;
  status: ProductStatus;
  product: Product;
}

interface ProductFormData {
  name: string;
  language: string;
  version: string;
  repoUrl: string;
  status: ProductStatus;
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
  ProductFormData = {
    name: "",
    language: "",
    version: "",
    repoUrl: "",
    status: "planning",
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

async function requestProducts():
Promise<ProductsResponse> {
  const response = await fetch(
    "/api/v1/products",
  );

  return getResponseData<ProductsResponse>(
    response,
    "Products could not be loaded.",
  );
}

export default function EngineeringPage() {
  const [clients, setClients] =
    useState<Client[]>([]);

  const [products, setProducts] =
    useState<Product[]>([]);

  const [
    selectedProduct,
    setSelectedProduct,
  ] = useState<Product | null>(null);

  const [formData, setFormData] =
    useState<ProductFormData>(
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
      requestProducts(),
    ])
      .then(
        ([
          clientsResult,
          productsResult,
        ]) => {
          if (cancelled) {
            return;
          }

          setClients(
            clientsResult.clients,
          );

          setProducts(
            productsResult.products,
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
              "Engineering information could not be loaded.",
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
    let maintenance = 0;

    for (const product of products) {
      if (
        product.status === "active"
      ) {
        active += 1;
      }

      if (
        product.status ===
        "maintenance"
      ) {
        maintenance += 1;
      }
    }

    return {
      total: products.length,
      active,
      maintenance,
    };
  }, [products]);

  async function reloadProducts():
  Promise<void> {
    const result =
      await requestProducts();

    setProducts(result.products);
  }

  async function handleCreate(
    event: SyntheticEvent,
  ): Promise<void> {
    event.preventDefault();

    if (!formData.name.trim()) {
      setStatus({
        message:
          "A product name is required.",
        type: "error",
      });

      return;
    }

    setCreating(true);

    setStatus({
      message: "Adding product...",
      type: "working",
    });

    try {
      const response = await fetch(
        "/api/v1/products",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            name:
              formData.name.trim(),
            language:
              formData.language
                .trim() ||
              undefined,
            version:
              formData.version
                .trim() ||
              undefined,
            repoUrl:
              formData.repoUrl
                .trim() ||
              undefined,
            status:
              formData.status,
            owner:
              formData.owner
                .trim() ||
              undefined,
          }),
        },
      );

      const result =
        await getResponseData<ProductMutationResponse>(
          response,
          "The product could not be added.",
        );

      await reloadProducts();

      setSelectedProduct(
        result.product,
      );

      setFormData(emptyForm);

      setStatus({
        message: `Added "${result.product.name}".`,
        type: "success",
      });
    } catch (error) {
      setStatus({
        message:
          getErrorMessage(
            error,
            "The product could not be added.",
          ),
        type: "error",
      });
    } finally {
      setCreating(false);
    }
  }

  async function handleStatusChange(
    product: Product,
    nextStatus: ProductStatus,
  ): Promise<void> {
    setStatus({
      message: "Updating product...",
      type: "working",
    });

    try {
      const response = await fetch(
        `/api/v1/products/${product.id}`,
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
        await getResponseData<ProductMutationResponse>(
          response,
          "The product could not be updated.",
        );

      await reloadProducts();

      setSelectedProduct(
        result.product,
      );

      setStatus({
        message: `"${result.product.name}" is now ${formatLabel(
          nextStatus,
        )}.`,
        type: "success",
      });
    } catch (error) {
      setStatus({
        message:
          getErrorMessage(
            error,
            "The product could not be updated.",
          ),
        type: "error",
      });
    }
  }

  async function handleDelete(
    product: Product,
  ): Promise<void> {
    const response = await fetch(
      `/api/v1/products/${product.id}`,
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
        "The product could not be deleted.",
      );
    }

    await reloadProducts();

    setSelectedProduct((current) =>
      current?.id === product.id
        ? null
        : current,
    );

    setStatus({
      message: `Removed "${product.name}".`,
      type: "success",
    });
  }

  return (
    <section className="workspace active">
      <div className="workspace-heading">
        <div>
          <p className="eyebrow">
            Engineering
          </p>

          <h3>
            Software Products
          </h3>

          <p className="help-text">
            Track Faith Harbor's
            software products and
            repositories through
            planning, active
            development, maintenance,
            and release.
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
        aria-label="Engineering summary"
      >
        <article className="metric-card">
          <span className="metric-label">
            Products
          </span>

          <strong className="metric-value">
            {loading
              ? "..."
              : metrics.total}
          </strong>

          <span className="metric-detail">
            All software products
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
            In development
          </span>
        </article>

        <article className="metric-card">
          <span className="metric-label">
            Maintenance
          </span>

          <strong className="metric-value">
            {loading
              ? "..."
              : metrics.maintenance}
          </strong>

          <span className="metric-detail">
            Released and supported
          </span>
        </article>

        <article className="metric-card">
          <span className="metric-label">
            Standard
          </span>

          <strong className="metric-value metric-word">
            Tested
          </strong>

          <span className="metric-detail">
            Quality is a promise
          </span>
        </article>
      </div>

      <div className="workspace-grid">
        <section className="card">
          <div className="card-heading">
            <div>
              <p className="eyebrow">
                New Product
              </p>

              <h3>Add Product</h3>
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
              <label htmlFor="product-name">
                Name
              </label>

              <input
                id="product-name"
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

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="product-language">
                  Language / stack
                </label>

                <input
                  id="product-language"
                  type="text"
                  placeholder="TypeScript"
                  value={
                    formData.language
                  }
                  onChange={(event) =>
                    setFormData(
                      (current) => ({
                        ...current,
                        language:
                          event
                            .target
                            .value,
                      }),
                    )
                  }
                />
              </div>

              <div className="form-group">
                <label htmlFor="product-version">
                  Version
                </label>

                <input
                  id="product-version"
                  type="text"
                  placeholder="1.0.0"
                  value={
                    formData.version
                  }
                  onChange={(event) =>
                    setFormData(
                      (current) => ({
                        ...current,
                        version:
                          event
                            .target
                            .value,
                      }),
                    )
                  }
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="product-repo">
                Repository URL
              </label>

              <input
                id="product-repo"
                type="url"
                placeholder="https://github.com/..."
                value={
                  formData.repoUrl
                }
                onChange={(event) =>
                  setFormData(
                    (current) => ({
                      ...current,
                      repoUrl:
                        event.target
                          .value,
                    }),
                  )
                }
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="product-owner">
                  Owner
                </label>

                <input
                  id="product-owner"
                  type="text"
                  value={
                    formData.owner
                  }
                  onChange={(event) =>
                    setFormData(
                      (current) => ({
                        ...current,
                        owner:
                          event
                            .target
                            .value,
                      }),
                    )
                  }
                />
              </div>

              <div className="form-group">
                <label htmlFor="product-status">
                  Status
                </label>

                <select
                  id="product-status"
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
                            .value as ProductStatus,
                      }),
                    )
                  }
                >
                  {productStatuses.map(
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
                : "Add Product"}
            </button>
          </form>
        </section>

        <section className="card">
          <div className="card-heading">
            <div>
              <p className="eyebrow">
                Portfolio
              </p>

              <h3>Products</h3>
            </div>
          </div>

          {loading ? (
            <p className="help-text">
              Loading products...
            </p>
          ) : products.length ===
            0 ? (
            <p className="help-text">
              No products yet. Add the
              first software product to
              begin.
            </p>
          ) : (
            <div className="record-list">
              {products.map(
                (product) => (
                  <button
                    type="button"
                    className="record-button"
                    key={product.id}
                    onClick={() =>
                      setSelectedProduct(
                        product,
                      )
                    }
                  >
                    <span className="record-title">
                      {product.name}
                      {product.version
                        ? ` v${product.version}`
                        : ""}
                    </span>

                    <span className="record-detail">
                      <span
                        className={`product-status product-status-${product.status}`}
                      >
                        {formatLabel(
                          product.status,
                        )}
                      </span>{" "}
                      {product.language ||
                        "—"}
                    </span>
                  </button>
                ),
              )}
            </div>
          )}
        </section>
      </div>

      {selectedProduct && (
        <section className="card">
          <div className="card-heading">
            <div>
              <p className="eyebrow">
                {selectedProduct.language ||
                  "Software"}
              </p>

              <h3>
                {selectedProduct.name}
              </h3>
            </div>

            <button
              type="button"
              className="secondary-button"
              onClick={() =>
                setSelectedProduct(
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
                  selectedProduct.status,
                )}
              </strong>
            </div>

            <div className="client-overview-item">
              <span>Version</span>

              <strong>
                {selectedProduct.version ||
                  "Unreleased"}
              </strong>
            </div>

            <div className="client-overview-item">
              <span>Language</span>

              <strong>
                {selectedProduct.language ||
                  "Not set"}
              </strong>
            </div>

            <div className="client-overview-item">
              <span>Owner</span>

              <strong>
                {selectedProduct.owner ||
                  "Not set"}
              </strong>
            </div>

            <div className="client-overview-item">
              <span>Client</span>

              <strong>
                {selectedProduct.clientId
                  ? clientNames.get(
                      selectedProduct.clientId,
                    ) ?? "Client"
                  : "Faith Harbor"}
              </strong>
            </div>
          </div>

          {selectedProduct.repoUrl && (
            <p className="client-notes">
              Repository:{" "}
              {selectedProduct.repoUrl}
            </p>
          )}

          {selectedProduct.description && (
            <p className="client-notes">
              {
                selectedProduct.description
              }
            </p>
          )}

          <div className="section-divider" />

          <div className="form-group">
            <label htmlFor="product-status-update">
              Update status
            </label>

            <select
              id="product-status-update"
              value={
                selectedProduct.status
              }
              onChange={(event) =>
                void handleStatusChange(
                  selectedProduct,
                  event.target
                    .value as ProductStatus,
                )
              }
            >
              {productStatuses.map(
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
            recordName={`"${selectedProduct.name}"`}
            onDelete={() =>
              handleDelete(
                selectedProduct,
              )
            }
          />
        </section>
      )}
    </section>
  );
}
