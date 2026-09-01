import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { toNitroHandler } from "@ks-open/capability/server/nitro";

const require = createRequire(import.meta.url);
const capabilityDistRoot = resolve(
  dirname(require.resolve("@ks-open/capability/server")),
  "..",
);

// Dev:  process.cwd() is the project root, so "./capabilities" works.
// Prod: Nitro replaces import.meta.url → globalThis._importMeta_.url which
//       points to .output/server/index.mjs. The deploy-server's cwd is NOT
//       the project root, so we must use an absolute path.
const capabilitiesDir = import.meta.dev
  ? "./capabilities"
  : resolve(dirname(fileURLToPath(import.meta.url)), "capabilities");

// Dev: point at the real package plugins under node_modules.
// Prod: use the plugins copied next to the Nitro bundle by copy-capability-assets.
const pluginsConfigPath = import.meta.dev
  ? resolve(capabilityDistRoot, "plugins/capability-plugins.json")
  : resolve(dirname(fileURLToPath(import.meta.url)), "plugins/capability-plugins.json");

/**
 * Catch-all route for capability API endpoints.
 *
 * Handles:
 * - POST /api/capabilities/:instanceId/:actionKey
 * - POST /api/capabilities/_exec/:pluginKey/:actionKey
 * - GET  /api/capabilities/plugins
 * - GET  /api/oauth/status
 * - ALL  /api/wps-openapi/*
 *
 * Nitro's route priority ensures that more specific routes (e.g.
 * `health.get.ts`, `todos.get.ts`) always take precedence over
 * this catch-all. Unrecognized paths return 404.
 */
const config = useRuntimeConfig();

export default toNitroHandler({
  basePath: "/api",
  capabilitiesDir,
  pluginsConfigPath,
  env: {
    WPS_APP_ID: config.WPS_APP_ID,
    WPS_APP_SECRET: config.WPS_APP_SECRET,
    SESSION_SECRET: config.SESSION_SECRET,
  },
});
