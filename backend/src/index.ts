import { config, isAiEnabled } from "./config.js";
import { createApp } from "./app.js";

const app = createApp();

app.listen(config.port, () => {
  console.log(`PenguWave backend listening on http://localhost:${config.port}`);
  console.log(
    isAiEnabled
      ? "Optional AI incident analysis: ENABLED."
      : "Optional AI incident analysis: off (this is fine — add AWS_* to backend/.env to enable it; all other features run normally).",
  );
});
