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

// AWS Bedrock config for the AI incident assistant. Feature-gated: the server
// boots fine without these — the /analyze endpoint just returns 502 until they
// are set. Validated lazily by llmService, never required at startup.
export interface BedrockConfig {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  modelId: string;
}

export function getBedrockConfig(): BedrockConfig | null {
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  const region = process.env.AWS_REGION;
  if (!accessKeyId || !secretAccessKey || !region) return null;
  return {
    accessKeyId,
    secretAccessKey,
    region,
    modelId: process.env.BEDROCK_MODEL_ID ?? "anthropic.claude-3-haiku-20240307-v1:0",
  };
}

export const isAiEnabled = getBedrockConfig() !== null;

export const REFRESH_COOKIE_NAME = "refreshToken";
export const REFRESH_COOKIE_PATH = "/api/auth/refresh";
