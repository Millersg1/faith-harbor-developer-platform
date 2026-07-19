import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import type {
  ReactNode,
} from "react";

import LoginPage from "../pages/LoginPage";

interface AuthUser {
  email: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  logout: () => Promise<void>;
}

const AuthContext =
  createContext<AuthContextValue>({
    user: null,
    logout: async () => {},
  });

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}

type AuthStatus =
  | "loading"
  | "authenticated"
  | "login"
  | "open";

interface MeResponse {
  authenticated: boolean;
  user?: AuthUser;
}

export default function AuthGate({
  children,
}: {
  children: ReactNode;
}) {
  const [status, setStatus] =
    useState<AuthStatus>("loading");

  const [user, setUser] =
    useState<AuthUser | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/v1/auth/me")
      .then(async (response) => {
        if (cancelled) {
          return;
        }

        if (response.status === 404) {
          // Auth is not configured on the
          // server; the app runs open.
          setStatus("open");
          return;
        }

        if (response.ok) {
          const result =
            (await response.json()) as MeResponse;

          if (
            result.authenticated &&
            result.user
          ) {
            setUser(result.user);
            setStatus(
              "authenticated",
            );
            return;
          }
        }

        setStatus("login");
      })
      .catch(() => {
        if (!cancelled) {
          setStatus("login");
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const logout =
    useCallback(async () => {
      try {
        await fetch(
          "/api/v1/auth/logout",
          {
            method: "POST",
          },
        );
      } catch {
        // Ignore network errors on logout.
      }

      setUser(null);
      setStatus("login");
    }, []);

  if (status === "loading") {
    return (
      <div className="login-shell">
        <p className="login-loading">
          Loading Faith Harbor OS...
        </p>
      </div>
    );
  }

  if (status === "login") {
    return (
      <LoginPage
        onSuccess={(nextUser) => {
          setUser(nextUser);
          setStatus(
            "authenticated",
          );
        }}
      />
    );
  }

  return (
    <AuthContext.Provider
      value={{ user, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}
