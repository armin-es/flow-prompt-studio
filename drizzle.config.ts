import { config } from 'dotenv'

config()
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './server/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgresql://flow:flow@127.0.0.1:5433/flow_prompt',
  },
  strict: true,
})
