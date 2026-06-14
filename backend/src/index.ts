import { config, isAiEnabled } from "./config.js";
import { createApp } from "./app.js";

const app = createApp();

app.listen(config.port, () => {
  console.log(`PenguWave backend listening on http://localhost:${config.port}`);
  if (!isAiEnabled) {
    console.log("AI analysis disabled: AWS credentials not set (POST /api/events/:id/analyze will return 502).");
  }
});
