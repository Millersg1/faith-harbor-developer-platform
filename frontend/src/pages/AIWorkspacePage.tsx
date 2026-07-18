import {
  useState,
} from "react";
import type {
  SyntheticEvent,
} from "react";

type AIProvider =
  | "auto"
  | "ollama"
  | "openai"
  | "blackbox";

interface AIRequest {
  provider: AIProvider;
  prompt: string;
}

const AI_PROVIDER_KEY =
  "faith-harbor-os-default-ai-provider";

function getSavedProvider(): AIProvider {
  const savedProvider =
    window.localStorage.getItem(
      AI_PROVIDER_KEY,
    );

  if (
    savedProvider === "auto" ||
    savedProvider === "ollama" ||
    savedProvider === "openai" ||
    savedProvider === "blackbox"
  ) {
    return savedProvider;
  }

  return "auto";
}

function getErrorMessage(
  error: unknown,
  fallback: string,
): string {
  return error instanceof Error
    ? error.message
    : fallback;
}

async function getResponseData(
  response: Response,
): Promise<unknown> {
  const responseText =
    await response.text();

  if (!responseText.trim()) {
    if (!response.ok) {
      throw new Error(
        `AI request failed with status ${response.status}.`,
      );
    }

    throw new Error(
      "The AI service returned an empty response.",
    );
  }

  let result: unknown;

  try {
    result = JSON.parse(responseText);
  } catch {
    if (!response.ok) {
      throw new Error(
        responseText ||
          "The AI request failed.",
      );
    }

    return responseText;
  }

  if (!response.ok) {
    if (
      typeof result === "object" &&
      result !== null
    ) {
      const errorResult = result as {
        error?: {
          message?: string;
        };
        message?: string;
      };

      throw new Error(
        errorResult.error?.message ??
          errorResult.message ??
          "The AI request failed.",
      );
    }

    throw new Error(
      "The AI request failed.",
    );
  }

  return result;
}

function formatResponse(
  result: unknown,
): string {
  if (typeof result === "string") {
    return result;
  }

  return JSON.stringify(
    result,
    null,
    2,
  );
}

export default function AIWorkspacePage() {
  const [provider, setProvider] =
    useState<AIProvider>(
      getSavedProvider,
    );

  const [prompt, setPrompt] =
    useState("");

  const [response, setResponse] =
    useState(
      "Waiting for your first prompt...",
    );

  const [isGenerating, setIsGenerating] =
    useState(false);

  const [copyLabel, setCopyLabel] =
    useState("Copy");

  const [hasResponse, setHasResponse] =
    useState(false);

  const [hasError, setHasError] =
    useState(false);

  async function handleSubmit(
    event: SyntheticEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();

    const trimmedPrompt =
      prompt.trim();

    if (!trimmedPrompt) {
      setResponse(
        "Please enter a prompt.",
      );

      setHasResponse(false);
      setHasError(true);

      return;
    }

    const payload: AIRequest = {
      provider,
      prompt: trimmedPrompt,
    };

    setIsGenerating(true);
    setHasResponse(false);
    setHasError(false);

    setResponse(
      "Connecting to Faith Harbor OS...",
    );

    try {
      const apiResponse = await fetch(
        "/api/v1/ai/chat",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify(
            payload,
          ),
        },
      );

      const result =
        await getResponseData(
          apiResponse,
        );

      setResponse(
        formatResponse(result),
      );

      setHasResponse(true);
      setHasError(false);
    } catch (error) {
      setResponse(
        `Connection failed.\n\n${getErrorMessage(
          error,
          "Unknown error",
        )}`,
      );

      setHasResponse(false);
      setHasError(true);
    } finally {
      setIsGenerating(false);
    }
  }

  async function copyResponse():
  Promise<void> {
    if (!hasResponse) {
      return;
    }

    try {
      await navigator.clipboard.writeText(
        response,
      );

      setCopyLabel("Copied");

      window.setTimeout(() => {
        setCopyLabel("Copy");
      }, 1500);
    } catch {
      setResponse(
        `${response}\n\nThe response could not be copied automatically.`,
      );

      setHasError(true);
    }
  }

  function clearWorkspace(): void {
    setPrompt("");

    setResponse(
      "Waiting for your first prompt...",
    );

    setHasResponse(false);
    setHasError(false);
    setCopyLabel("Copy");
  }

  return (
    <section
      className="workspace active"
      id="ai-workspace"
    >
      <div className="workspace-heading">
        <div>
          <p className="eyebrow">
            Faith Harbor Intelligence
          </p>

          <h3>AI Workspace</h3>

          <p className="help-text">
            Work with local and cloud AI
            providers through one governed
            Faith Harbor workspace.
          </p>
        </div>
      </div>

      <div className="two-column-layout">
        <section className="card">
          <p className="eyebrow">
            Faith Harbor Intelligence
          </p>

          <h3>Ask Faith Harbor OS</h3>

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="provider">
                Provider
              </label>

              <select
                id="provider"
                value={provider}
                onChange={(event) =>
                  setProvider(
                    event.target
                      .value as AIProvider,
                  )
                }
                disabled={isGenerating}
              >
                <option value="auto">
                  Auto
                </option>

                <option value="ollama">
                  Ollama
                </option>

                <option value="openai">
                  OpenAI
                </option>

                <option value="blackbox">
                  Blackbox
                </option>
              </select>
            </div>

            <p className="help-text">
              Your saved default provider
              is selected automatically.
              You may change it for this
              request.
            </p>

            <div className="form-group">
              <label htmlFor="prompt">
                Prompt
              </label>

              <textarea
                id="prompt"
                rows={14}
                placeholder="Ask Faith Harbor OS something..."
                value={prompt}
                onChange={(event) =>
                  setPrompt(
                    event.target.value,
                  )
                }
                disabled={isGenerating}
              />
            </div>

            <div className="button-group">
              <button
                className="primary-button"
                id="generate"
                type="submit"
                disabled={isGenerating}
              >
                {isGenerating
                  ? "Generating..."
                  : "Generate"}
              </button>

              <button
                className="secondary-button"
                type="button"
                onClick={
                  clearWorkspace
                }
                disabled={isGenerating}
              >
                Clear
              </button>
            </div>
          </form>
        </section>

        <section className="card proposal-preview">
          <div className="card-heading">
            <div>
              <p className="eyebrow">
                AI Response
              </p>

              <h3>Response</h3>
            </div>

            <button
              className="secondary-button"
              type="button"
              onClick={() =>
                void copyResponse()
              }
              disabled={
                !hasResponse ||
                isGenerating
              }
            >
              {copyLabel}
            </button>
          </div>

          <div
            className={`status-message ${
              isGenerating
                ? "working"
                : hasError
                  ? "error"
                  : hasResponse
                    ? "success"
                    : ""
            }`}
            role={
              hasError
                ? "alert"
                : "status"
            }
          >
            {isGenerating
              ? `Faith Harbor OS is using the ${provider} provider.`
              : hasError
                ? "The request could not be completed."
                : hasResponse
                  ? "Response generated successfully. Review all AI output before using it."
                  : "Choose a provider and enter a prompt."}
          </div>

          <pre id="response">
            {response}
          </pre>
        </section>
      </div>

      <section className="card">
        <p className="eyebrow">
          Human Authority
        </p>

        <h3>
          AI-Assisted, Human-Directed
        </h3>

        <p className="help-text">
          Faith Harbor OS may assist with
          research, planning, writing, and
          development. Final decisions and
          client deliverables always remain
          under human authority.
        </p>
      </section>
    </section>
  );
}