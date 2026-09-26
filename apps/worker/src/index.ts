import { parseServerEnv } from "@phan/config";

const env = parseServerEnv(process.env);
console.info(JSON.stringify({ event: "worker_boot", appEnv: env.APP_ENV, dataMode: env.DATA_MODE }));

const shutdown = (signal: string): void => {
  console.info(JSON.stringify({ event: "worker_shutdown", signal }));
  process.exit(0);
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
