// Netlify invokes drizzle-kit from an isolated npx installation before the
// project's local dependencies are available, so this config stays import-free.
export default {
  dialect: "postgresql",
  schema: "./drizzle/schema.ts",
  out: "./drizzle/migrations",
  dbCredentials: {
    url: process.env.LOVABLE_DB_MIGRATION_URL ?? "",
  },
};
