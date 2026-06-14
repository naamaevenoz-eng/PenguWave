import express from "express";

// Minimal bootstrap to verify the toolchain. Real middleware, routes, DB,
// auth, and security hardening are added in subsequent phases.
const app = express();
const PORT = Number(process.env.PORT ?? 3001);

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "penguwave-backend" });
});

app.listen(PORT, () => {
  console.log(`PenguWave backend listening on http://localhost:${PORT}`);
});
