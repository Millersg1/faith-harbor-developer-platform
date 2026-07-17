import { useEffect, useState } from "react";

type HealthResponse = {
  status: string;
  service: string;
  version: string;
  environment: string;
};

function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadHealth() {
      try {
        const response = await fetch("/health");

        if (!response.ok) {
          throw new Error(`Server returned ${response.status}`);
        }

        const data: HealthResponse = await response.json();

        setHealth(data);
      } catch (err) {
        if (err instanceof Error) {
          setError(err.message);
        } else {
          setError("Unknown error");
        }
      } finally {
        setLoading(false);
      }
    }

    loadHealth();
  }, []);

  return (
    <main
      style={{
        maxWidth: "900px",
        margin: "40px auto",
        padding: "2rem",
        fontFamily: "Arial, Helvetica, sans-serif",
      }}
    >
      <h1>Faith Harbor OS</h1>

      <p>
        React frontend successfully connected to the Express backend.
      </p>

      {loading && <p>Checking server status...</p>}

      {error && (
        <div
          style={{
            color: "red",
            border: "1px solid red",
            padding: "1rem",
            marginTop: "1rem",
          }}
        >
          {error}
        </div>
      )}

      {health && (
        <div
          style={{
            marginTop: "2rem",
            padding: "1.5rem",
            border: "1px solid #ccc",
            borderRadius: "8px",
          }}
        >
          <h2>Backend Status</h2>

          <p>
            <strong>Service:</strong> {health.service}
          </p>

          <p>
            <strong>Status:</strong> {health.status}
          </p>

          <p>
            <strong>Version:</strong> {health.version}
          </p>

          <p>
            <strong>Environment:</strong> {health.environment}
          </p>
        </div>
      )}
    </main>
  );
}

export default App;