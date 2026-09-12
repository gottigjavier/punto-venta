// test/setup.ts
// Vitest setup: load the development database URL (postgresql://...@localhost:5432)
// before any backend module that constructs the Prisma client singleton is imported.
import dotenv from "dotenv";
import path from "path";

dotenv.config({
  path: path.resolve(process.cwd(), ".env.development"),
  override: false,
});
