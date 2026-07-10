import { createApp } from "./app";
import { config } from "./config";

const app = createApp();

const server = app.listen(config.PORT, () => {
  console.log(`Server listening on port ${config.PORT}`);
});

function shutdown(signal: string) {
  console.log(`Received ${signal}. Shutting down.`);
  server.close((error) => {
    if (error) {
      console.error(error);
      process.exit(1);
    }

    process.exit(0);
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
