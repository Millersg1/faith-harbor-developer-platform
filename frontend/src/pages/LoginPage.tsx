import {
  useState,
} from "react";
import type {
  SyntheticEvent,
} from "react";

interface AuthUser {
  email: string;
}

interface LoginResponse {
  authenticated: boolean;
  user?: AuthUser;
  error?: {
    code?: string;
    message?: string;
  };
}

interface LoginPageProps {
  onSuccess: (
    user: AuthUser,
  ) => void;
}

export default function LoginPage({
  onSuccess,
}: LoginPageProps) {
  const [email, setEmail] =
    useState("");

  const [password, setPassword] =
    useState("");

  const [totpCode, setTotpCode] =
    useState("");

  const [
    needsCode,
    setNeedsCode,
  ] = useState(false);

  const [error, setError] =
    useState<string | null>(null);

  const [
    submitting,
    setSubmitting,
  ] = useState(false);

  async function handleSubmit(
    event: SyntheticEvent,
  ): Promise<void> {
    event.preventDefault();

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch(
        "/api/v1/auth/login",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            email,
            password,
            totpCode:
              totpCode || undefined,
          }),
        },
      );

      const result =
        (await response.json()) as LoginResponse;

      if (
        response.ok &&
        result.authenticated &&
        result.user
      ) {
        onSuccess(result.user);
        return;
      }

      // Server is asking for the second factor.
      if (
        result.error?.code ===
          "TOTP_REQUIRED" ||
        result.error?.code ===
          "INVALID_TOTP"
      ) {
        setNeedsCode(true);
        setError(
          result.error.code ===
            "INVALID_TOTP"
            ? "That code wasn't valid. Try again."
            : "Enter the code from your authenticator app.",
        );
        return;
      }

      setError(
        result.error?.message ??
          "Sign in failed. Check your email and password.",
      );
    } catch {
      setError(
        "Could not reach the server. Try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-shell">
      <div className="login-card">
        <p className="eyebrow">
          Faith Harbor LLC
        </p>

        <h1>Faith Harbor OS</h1>

        <p className="login-mission">
          Technology is our tool.
          People are our purpose.
          Christ is our foundation.
        </p>

        <form
          onSubmit={(event) =>
            void handleSubmit(event)
          }
        >
          <div className="form-group">
            <label htmlFor="login-email">
              Email
            </label>

            <input
              id="login-email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) =>
                setEmail(
                  event.target.value,
                )
              }
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="login-password">
              Password
            </label>

            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) =>
                setPassword(
                  event.target.value,
                )
              }
              required
            />
          </div>

          {needsCode && (
            <div className="form-group">
              <label htmlFor="login-totp">
                Authenticator code
              </label>

              <input
                id="login-totp"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
                value={totpCode}
                onChange={(event) =>
                  setTotpCode(
                    event.target
                      .value,
                  )
                }
              />
            </div>
          )}

          {error && (
            <div className="status-message error">
              {error}
            </div>
          )}

          <button
            type="submit"
            className="primary-button"
            disabled={submitting}
          >
            {submitting
              ? "Signing in..."
              : needsCode
                ? "Verify & Sign In"
                : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}
