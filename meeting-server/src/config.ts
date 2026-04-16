/**
 * meeting-server runtime configuration.
 *
 * All values come from environment variables. Missing required vars fail
 * fast at process start so the container never limps in half-configured
 * state. JWT_SECRET is intentionally REQUIRED here (no dev fallback) because
 * it must match the Next.js app secret — a divergence would silently break
 * inter-service auth.
 */
import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // HTTP listener
  PORT: z.coerce.number().int().positive().default(3100),

  // LiveKit signalling endpoint (http[s]:// or ws[s]://). Worker talks to
  // LiveKit server over HTTP for REST/egress APIs.
  LIVEKIT_URL: z.string().url(),
  LIVEKIT_API_KEY: z.string().min(4),
  LIVEKIT_API_SECRET: z.string().min(16),

  // Filesystem paths shared with the Next.js container via the same volume.
  DB_PATH: z.string().default('/app/data/taskhub.db'),
  RECORDINGS_DIR: z.string().default('/app/data/recordings'),

  // Shared JWT secret with Next.js — required for webhook verification and
  // for accepting internal auth tokens on /recordings/* routes.
  JWT_SECRET: z.string().min(16),
});

export type Env = z.infer<typeof EnvSchema>;

function loadConfig() {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const errors = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    // eslint-disable-next-line no-console
    console.error(`\n[meeting-server] Invalid environment configuration:\n${errors}\n`);
    process.exit(1);
  }

  const env = parsed.data;

  return {
    env,
    nodeEnv: env.NODE_ENV,
    isProduction: env.NODE_ENV === 'production',

    port: env.PORT,

    livekit: {
      url: env.LIVEKIT_URL,
      apiKey: env.LIVEKIT_API_KEY,
      apiSecret: env.LIVEKIT_API_SECRET,
      // The webhook signer key equals the API key LiveKit is configured with.
      webhookApiKey: env.LIVEKIT_API_KEY,
    },

    paths: {
      dbPath: env.DB_PATH,
      recordingsDir: env.RECORDINGS_DIR,
    },

    auth: {
      jwtSecret: env.JWT_SECRET,
    },
  } as const;
}

export const config = loadConfig();
export type Config = typeof config;
