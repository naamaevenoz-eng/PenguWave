import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.length < 32) {
    throw new Error(
      `Missing or weak env var ${name} (must be set, min 32 chars). See backend/.env.example.`,
    );
  }
  return value;
}

export const config = {
  port: Number(process.env.PORT ?? 3001),
  nodeEnv: process.env.NODE_ENV ?? "development",
  isProduction: process.env.NODE_ENV === "production",
  frontendUrl: process.env.FRONTEND_URL ?? "http://localhost:5173",
  jwt: {
    accessSecret: required("JWT_ACCESS_SECRET"),
    refreshSecret: required("JWT_REFRESH_SECRET"),
    accessTtl: process.env.ACCESS_TOKEN_TTL ?? "15m",
    refreshTtlDays: Number(process.env.REFRESH_TOKEN_TTL_DAYS ?? 7),
    issuer: "penguwave-api",
    audience: "penguwave-frontend",
  },
} as const;

export const REFRESH_COOKIE_NAME = "refreshToken";
export const REFRESH_COOKIE_PATH = "/api/auth/refresh";
