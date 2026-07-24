import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

const root = process.cwd();
const sourceEntries = ["src/app/page.tsx", "src/app/layout.tsx"];
const forbiddenSource = [
  /stage\/filmScrubber/,
  /flow-engine\/legacyEngineBridge/,
  /flow-engine\/lenox\/lenoxVessel/,
  /flow-engine\/lenox\/lenoxAuthoredCharacter/,
  /flow-engine\/engineBridge/,
  /^three(?:\/|$)/,
];
const forbiddenBuild = [
  "gravity-clip",
  "360_sphere_robot",
  "lenox-v006",
  "autumn_field_puresky",
  "hero-keyframe",
];

function isTypeOnlyImport(node) {
  const clause = node.importClause;
  if (!clause) return false;
  if (clause.isTypeOnly) return true;
  if (clause.name) return false;
  const bindings = clause.namedBindings;
  return Boolean(
    bindings &&
    ts.isNamedImports(bindings) &&
    bindings.elements.length > 0 &&
    bindings.elements.every((element) => element.isTypeOnly),
  );
}

function resolveRelativeImport(fromFile, specifier) {
  const base = path.resolve(path.dirname(fromFile), specifier);
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}.jsx`,
    path.join(base, "index.ts"),
    path.join(base, "index.tsx"),
    path.join(base, "index.js"),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile()) ?? null;
}

function verifySourceGraph() {
  const queue = sourceEntries.map((entry) => path.join(root, entry));
  const visited = new Set();
  const violations = [];
  while (queue.length > 0) {
    const file = queue.shift();
    if (!file || visited.has(file)) continue;
    visited.add(file);
    const source = fs.readFileSync(file, "utf8");
    const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    for (const statement of tree.statements) {
      if (!ts.isImportDeclaration(statement) || isTypeOnlyImport(statement)) continue;
      const specifier = statement.moduleSpecifier.text;
      if (forbiddenSource.some((pattern) => pattern.test(specifier))) {
        violations.push(`${path.relative(root, file)} -> ${specifier}`);
      }
      if (!specifier.startsWith(".")) continue;
      const resolved = resolveRelativeImport(file, specifier);
      if (resolved && !resolved.endsWith(".css")) queue.push(resolved);
    }
  }
  if (violations.length > 0) {
    throw new Error(`Forbidden static homepage imports:\n${violations.join("\n")}`);
  }
  return visited.size;
}

function normalizeChunk(chunk) {
  return chunk.replace(/^\/_next\//, "").replace(/^\//, "");
}

function verifyBuildGraph() {
  const manifestPath = path.join(root, ".next/server/app/page_client-reference-manifest.js");
  const pageBuildPath = path.join(root, ".next/server/app/page/build-manifest.json");
  if (!fs.existsSync(manifestPath) || !fs.existsSync(pageBuildPath)) {
    throw new Error("Production manifests missing. Run npm run build first.");
  }
  const context = { globalThis: {} };
  vm.runInNewContext(fs.readFileSync(manifestPath, "utf8"), context);
  const manifest = context.globalThis.__RSC_MANIFEST?.["/page"];
  if (!manifest) throw new Error("Could not read /page client reference manifest.");
  const entryFiles = Object.entries(manifest.entryJSFiles ?? {})
    .filter(([entry]) => entry.endsWith("/src/app/layout") || entry.endsWith("/src/app/page"))
    .flatMap(([, chunks]) => chunks);
  const cssFiles = Object.entries(manifest.entryCSSFiles ?? {})
    .filter(([entry]) => entry.endsWith("/src/app/layout") || entry.endsWith("/src/app/page"))
    .flatMap(([, records]) => records.map((record) => record.path));
  const pageBuild = JSON.parse(fs.readFileSync(pageBuildPath, "utf8"));
  const jsChunks = [...new Set([...(pageBuild.rootMainFiles ?? []), ...entryFiles].map(normalizeChunk))];
  const scannedChunks = [...new Set([...jsChunks, ...cssFiles.map(normalizeChunk)])];
  const violations = [];
  for (const chunk of scannedChunks) {
    const file = path.join(root, ".next", chunk);
    if (!fs.existsSync(file)) throw new Error(`Initial chunk missing: ${chunk}`);
    const source = fs.readFileSync(file, "utf8");
    for (const forbidden of forbiddenBuild) {
      if (source.includes(forbidden)) violations.push(`${chunk}: ${forbidden}`);
    }
  }
  if (violations.length > 0) {
    throw new Error(`Forbidden references in initial SIGNAL chunks:\n${violations.join("\n")}`);
  }
  const jsBytes = jsChunks.reduce((total, chunk) => total + fs.statSync(path.join(root, ".next", chunk)).size, 0);
  return { jsChunks: jsChunks.length, jsBytes };
}

const sourceModules = verifySourceGraph();
const build = verifyBuildGraph();
process.stdout.write(
  `Homepage source graph: ${sourceModules} modules\nInitial SIGNAL JS: ${build.jsChunks} chunks, ${build.jsBytes} bytes\nBundle guard: PASS\n`,
);
