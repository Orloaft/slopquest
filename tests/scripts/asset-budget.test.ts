import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const assetBudgetScript = join(repoRoot, "scripts/asset-budget.ts");

test("asset budget report classifies startup preload and lazy assets", () => {
  const fixture = createFixture({
    startupGroups: [
      {
        name: "startup-core",
        include: ["public/core.png"],
        maxTotalBytes: 1024,
        maxFileBytes: 1024,
        maxFiles: 2
      },
      {
        name: "starter-area",
        include: ["public/starter.png"],
        maxTotalBytes: 1024,
        maxFileBytes: 1024,
        maxFiles: 2
      }
    ]
  });

  const result = runBudget(fixture);
  assert.equal(result.status, 0, result.stderr);

  const report = JSON.parse(result.stdout);
  assert.equal(report.status, "pass");
  assert.deepEqual(
    report.preload.startupGroups.map((group: { name: string; files: number }) => [group.name, group.files]),
    [
      ["startup-core", 1],
      ["starter-area", 1]
    ]
  );
  assert.deepEqual(report.preload.unclassifiedStartup, []);
  assert.deepEqual(
    report.preload.lazy.classificationGroups.map((group: { name: string; files: number }) => [group.name, group.files]),
    [["lazy/background-generated-stages", 1]]
  );
  assert.equal(report.preload.lazy.headroomMiB, 0);
  assert.equal(report.preload.lazy.fileHeadroom, 3);
  assert.equal(report.preload.lazy.groups[0].headroomMiB, 0);
  assert.equal(report.preload.lazy.groups[0].fileHeadroom, 3);
  assert.deepEqual(report.preload.lazy.unclassified, []);
});

test("asset budget fails when a startup preload asset is not policy-classified", () => {
  const fixture = createFixture({
    startupGroups: [
      {
        name: "startup-core",
        include: ["public/core.png"],
        maxTotalBytes: 1024,
        maxFileBytes: 1024,
        maxFiles: 2
      }
    ]
  });

  const result = runBudget(fixture);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /unclassified startup preload asset: public\/starter\.png/);

  const report = JSON.parse(result.stdout);
  assert.equal(report.status, "fail");
  assert.deepEqual(
    report.preload.unclassifiedStartup.map((file: { path: string }) => file.path),
    ["public/starter.png"]
  );
});

function createFixture(overrides: { startupGroups: unknown[] }): string {
  const fixture = mkdtempSync(join(tmpdir(), "tib-asset-budget-"));

  mkdirSync(join(fixture, "config"), { recursive: true });
  mkdirSync(join(fixture, "public/tilesets/northwood"), { recursive: true });
  mkdirSync(join(fixture, "src/generated/stages"), { recursive: true });

  writeFileSync(join(fixture, "public/core.png"), "core");
  writeFileSync(join(fixture, "public/starter.png"), "starter");
  writeFileSync(join(fixture, "public/tilesets/northwood/forest.png"), "forest");

  writeFileSync(
    join(fixture, "src/main.ts"),
    `
import { NORTHWOOD_STAGE } from "./generated/stages/index.ts";

function runtimeImageAsset(key: string, path: string, tier: RuntimeImageLoadTier, label: string): RuntimeImageAsset {
  return { key, path, tier, label };
}

const STARTUP_IMAGE_ASSETS = [
  runtimeImageAsset("core", "/core.png", "startup", "core actor art"),
  runtimeImageAsset("starter", "/starter.png", "startup", "starter area art")
] as const;

function preload(this: Phaser.Scene): void {
  for (const asset of STARTUP_IMAGE_ASSETS) this.load.image(asset.key, asset.path);
}

const GENERATED_STAGES: GeneratedStage[] = [NORTHWOOD_STAGE];

function ensureGeneratedStageAssetsLoaded(floor: number): Promise<void> {
  return Promise.resolve();
}
`
  );
  writeFileSync(join(fixture, "src/generated/stages/index.ts"), `export { NORTHWOOD_STAGE } from "./northwood.ts";\n`);
  writeFileSync(
    join(fixture, "src/generated/stages/northwood.ts"),
    `export const NORTHWOOD_STAGE = { "tilesets": [{ "publicPath": "/tilesets/northwood/forest.png" }] };\n`
  );

  writeFileSync(
    join(fixture, "config/asset-policy.json"),
    JSON.stringify(
      {
        schemaVersion: 1,
        root: "public",
        preloadEntry: "src/main.ts",
        budgets: {
          runtime: { maxTotalBytes: 4096, maxFileBytes: 1024, maxFiles: 8 },
          startupPreload: { maxTotalBytes: 4096, maxFileBytes: 1024, maxFiles: 4 },
          lazyBundles: { maxTotalBytes: 4096, maxFileBytes: 1024, maxFiles: 4 }
        },
        preloadClassification: {
          requireStartupGroupMatch: true,
          requireLazyGroupMatch: true,
          requireDynamicLazyGroupBudgets: true
        },
        startupGroups: overrides.startupGroups,
        lazyClassifications: [
          {
            name: "lazy/background-generated-stages",
            include: ["public/tilesets/northwood/**"],
            maxTotalBytes: 4096,
            maxFileBytes: 1024,
            maxFiles: 4
          }
        ],
        lazyGroups: {
          "lazy generated stage tilesets": {
            maxTotalBytes: 4096,
            maxFileBytes: 1024,
            maxFiles: 4
          }
        }
      },
      null,
      2
    )
  );

  return fixture;
}

function runBudget(cwd: string) {
  return spawnSync(process.execPath, [assetBudgetScript, "--policy", "config/asset-policy.json"], {
    cwd,
    encoding: "utf8"
  });
}
