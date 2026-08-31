/**
 * Post-build script: copies capability runtime assets into the Nitro output
 * directory so they are available at runtime.
 *
 * The capability handler uses `import.meta.url` to find the plugins directory.
 * After Nitro bundles, `import.meta.url` resolves to `.output/server/index.mjs`,
 * so `dirname(import.meta.url) + '/plugins/'` = `.output/server/plugins/`.
 *
 * Plugin JS modules use relative imports like `../../core-ChWXA2y7.js` to
 * reference shared chunks in the capability dist root. We must also copy
 * those shared JS files to `.output/server/` so the imports resolve.
 *
 * We also copy the project's `capabilities/` directory (instance configs) into
 * `.output/server/capabilities/` because the deploy server's `process.cwd()` is
 * NOT the project root—it's `/app/deploy-srv/`.
 */
import { cpSync, readdirSync, copyFileSync, existsSync, mkdirSync, statSync, readFileSync } from "node:fs";
import { resolve, dirname, extname, join, sep } from "node:path";
import { createRequire, isBuiltin } from "node:module";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");
const require = createRequire(import.meta.url);

let capabilityPkgEntry;
try {
  capabilityPkgEntry = require.resolve("@ks-open/capability/server");
} catch {
  console.log("[copy-capability-assets] @ks-open/capability not installed, skipping");
  process.exit(0);
}
const capabilityDistRoot = resolve(dirname(capabilityPkgEntry), "..");
const pluginsSrc = resolve(capabilityDistRoot, "plugins");

const capabilitiesSrc = resolve(projectRoot, "capabilities");
const serverDir = resolve(projectRoot, ".output", "server");
const pluginsDest = resolve(serverDir, "plugins");
const capabilitiesDest = resolve(serverDir, "capabilities");

console.log(`[copy-capability-assets] capability dist root: ${capabilityDistRoot}`);

// 1. Copy plugins directory (configs, manifests, and plugin JS modules)
console.log(`[copy-capability-assets] plugins source: ${pluginsSrc}`);
if (existsSync(pluginsSrc)) {
  mkdirSync(pluginsDest, { recursive: true });
  cpSync(pluginsSrc, pluginsDest, { recursive: true });
  console.log(`  -> Copied plugins to ${pluginsDest}`);
} else {
  console.error(`[copy-capability-assets] ERROR: plugins not found at ${pluginsSrc}`);
  process.exit(1);
}

// 2. Copy plugins into the externalized node_modules package.
//    Nitro externalizes @ks-open/capability to .output/server/node_modules/.
//    At runtime, import.meta.url resolves to the node_modules path, so the
//    dynamic plugin loader looks for plugins there, not in .output/server/plugins/.
const nmCapabilityDist = resolve(serverDir, "node_modules", "@ks-open", "capability", "dist");
if (existsSync(nmCapabilityDist)) {
  const nmPluginsDest = resolve(nmCapabilityDist, "plugins");
  mkdirSync(nmPluginsDest, { recursive: true });
  cpSync(pluginsSrc, nmPluginsDest, { recursive: true });
  console.log(`  -> Copied plugins to ${nmPluginsDest} (externalized package)`);
}

// 3. Copy shared chunks (core-*.js, handler-*.js, etc.) that plugins import
//    via relative paths like `../../core-ChWXA2y7.js`
const sharedFiles = readdirSync(capabilityDistRoot).filter(
  (f) => extname(f) === ".js" || extname(f) === ".mjs",
);
for (const file of sharedFiles) {
  copyFileSync(resolve(capabilityDistRoot, file), resolve(serverDir, file));
}
if (sharedFiles.length > 0) {
  console.log(`  -> Copied ${sharedFiles.length} shared chunk(s) to ${serverDir}`);
}

// 4. Copy widgets directory (widget manifests + assets served via
//    /api/capabilities/widgets). When @ks-open/capability is bundled into
//    index.mjs, import.meta.url → .output/server/ so widgets must live there.
const widgetsSrc = resolve(capabilityDistRoot, "widgets");
if (existsSync(widgetsSrc)) {
  const widgetsDest = resolve(serverDir, "widgets");
  mkdirSync(widgetsDest, { recursive: true });
  cpSync(widgetsSrc, widgetsDest, { recursive: true });
  console.log(`  -> Copied widgets to ${widgetsDest}`);
}

// 3b. Also copy shared chunks into the externalized node_modules dist root.
//     Plugins loaded from node_modules resolve relative imports (e.g.
//     ../../wps365-S0qq6oY9.js) against the package's dist/ directory,
//     not .output/server/.
if (existsSync(nmCapabilityDist)) {
  for (const file of sharedFiles) {
    copyFileSync(
      resolve(capabilityDistRoot, file),
      resolve(nmCapabilityDist, file),
    );
  }
  if (sharedFiles.length > 0) {
    console.log(`  -> Copied ${sharedFiles.length} shared chunk(s) to ${nmCapabilityDist}`);
  }
}

// 4. Copy capabilities instance configs
if (existsSync(capabilitiesSrc)) {
  mkdirSync(capabilitiesDest, { recursive: true });
  cpSync(capabilitiesSrc, capabilitiesDest, { recursive: true });
  console.log(`  -> Copied capabilities to ${capabilitiesDest}`);
} else {
  console.log(`[copy-capability-assets] No capabilities/ directory, skipping`);
}

// 5. Copy runtime external dependencies (bare imports) of the shared chunks
//    and plugin modules into .output/server/node_modules/.
//    With `externals.inline` the bundle ships no node_modules, but plugins
//    are loaded dynamically from disk at runtime and their chunks still
//    import bare specifiers (ajv, ky, jose, ...). Copy the transitive
//    closure of those packages as real files (no symlinks) so the zip is
//    self-contained and the dynamic imports resolve.
const BARE_IMPORT_RES = [
  /from\s*["']([^"'\n]+)["']/g,
  /import\(\s*["']([^"'\n]+)["']\s*\)/g,
  /require\(\s*["']([^"'\n]+)["']\s*\)/g,
];
const PKG_BLOCKLIST = new Set(["nitropack"]);

function toPkgName(spec) {
  if (
    spec.startsWith("node:") ||
    spec.startsWith(".") ||
    spec.startsWith("/") ||
    spec.startsWith("#") ||
    spec.startsWith("~") ||
    spec.includes("${") ||
    spec.includes("\\n")
  ) {
    return null;
  }
  const seg = spec.split("/");
  const name = spec.startsWith("@") ? seg.slice(0, 2).join("/") : seg[0];
  if (!name || PKG_BLOCKLIST.has(name) || name.startsWith("@nitro")) return null;
  return name;
}

function collectBareImports(dir, acc) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    const p = join(dir, name);
    let st;
    try {
      st = statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      if (name === "node_modules" || name === ".bin") continue;
      collectBareImports(p, acc);
    } else if (st.isFile() && [".js", ".mjs", ".cjs"].includes(extname(name))) {
      let src;
      try {
        src = readFileSync(p, "utf8");
      } catch {
        continue;
      }
      for (const re of BARE_IMPORT_RES) {
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(src)) !== null) {
          const pkg = toPkgName(m[1]);
          if (pkg) acc.add(pkg);
        }
      }
    }
  }
}

function resolvePkgRoot(pkg) {
  if (isBuiltin(pkg) || isBuiltin(`node:${pkg}`)) return null;
  const resolvers = [
    createRequire(join(projectRoot, "package.json")),
    createRequire(capabilityPkgEntry),
  ];
  for (const r of resolvers) {
    try {
      return requireRealPkgDir(r.resolve(join(pkg, "package.json")));
    } catch {}
    try {
      return requireRealPkgDir(r.resolve(pkg));
    } catch {}
  }
  return null;
}

// Accept only paths that live inside a node_modules directory and contain a
// package.json — guards against resolving builtins ("node:assert") or
// workspace files, which would make cpSync copy the project into itself.
function requireRealPkgDir(resolved) {
  let d = dirname(resolved);
  for (let i = 0; i < 8; i++) {
    if (d.split(sep).includes("node_modules") && existsSync(join(d, "package.json"))) {
      return d;
    }
    const parent = dirname(d);
    if (parent === d) break;
    d = parent;
  }
  return null;
}

const runtimePkgDirs = [serverDir, pluginsDest];
const pending = new Set();
for (const dir of runtimePkgDirs) {
  if (existsSync(dir)) collectBareImports(dir, pending);
}
const nmDest = resolve(serverDir, "node_modules");
const copiedPkgs = new Set();
const visited = new Set();
let queue = [...pending];
while (queue.length > 0) {
  const pkg = queue.shift();
  if (visited.has(pkg)) continue;
  visited.add(pkg);
  const pkgRoot = resolvePkgRoot(pkg);
  if (!pkgRoot) {
    console.warn(`[copy-capability-assets] WARN: cannot resolve runtime dep '${pkg}'`);
    continue;
  }
  copiedPkgs.add(pkg);
  const dest = join(nmDest, pkg);
  if (resolve(dest).startsWith(resolve(pkgRoot) + sep)) {
    console.warn(`[copy-capability-assets] WARN: skip self-nesting copy for '${pkg}'`);
    continue;
  }
  cpSync(pkgRoot, dest, { recursive: true, dereference: true });
  // Scan the copied package for its own bare imports (transitive closure).
  const inner = new Set();
  collectBareImports(dest, inner);
  for (const dep of inner) {
    if (!visited.has(dep)) queue.push(dep);
  }
}
if (copiedPkgs.size > 0) {
  console.log(`  -> Copied ${copiedPkgs.size} runtime dep(s) to ${nmDest}: ${[...copiedPkgs].join(", ")}`);
}

console.log("[copy-capability-assets] Done");
