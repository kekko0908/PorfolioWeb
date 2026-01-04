import { spawn } from "node:child_process";

const pythonBin = process.env.PYTHON_BIN || "python";
const apiPort = process.env.MARKET_API_PORT || "8000";

const run = (label, command, args, options) => {
  const child = spawn(command, args, { stdio: "inherit", ...options });
  child.on("exit", (code) => {
    if (code && code !== 0) {
      console.error(`[${label}] exited with code ${code}`);
    }
  });
  return child;
};

const api = run(
  "api",
  pythonBin,
  ["-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", apiPort],
  { cwd: "services/market_api" }
);
const web = run("web", "npm", ["run", "dev"], { cwd: "." });

const shutdown = () => {
  api.kill();
  web.kill();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
