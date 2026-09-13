import { createRequire as __createRequire } from "node:module";
import { dirname as __pathDirname } from "node:path";
import { fileURLToPath as __fileURLToPath } from "node:url";
const require = __createRequire(import.meta.url);
var __filename = __fileURLToPath(import.meta.url);
var __dirname = __pathDirname(__filename);

// server.ts
import os from "node:os";
import path3 from "node:path";

// src/scanner.ts
import path from "node:path";
import fs from "node:fs/promises";
function normalizeToHomeRelative(pathStr, homeDir) {
  if (!pathStr || typeof pathStr !== "string") return null;
  let trimmed = pathStr.trim();
  if (trimmed.length === 0) return null;
  if (trimmed === "~" || trimmed.startsWith("~/")) {
    trimmed = path.join(homeDir, trimmed.slice(1));
  }
  const absoluteTarget = path.isAbsolute(trimmed) ? path.resolve(trimmed) : path.resolve(homeDir, trimmed);
  const relative = path.relative(homeDir, absoluteTarget);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return null;
  }
  const posixPath = relative.split(path.sep).join("/");
  const segments = posixPath.split("/").filter(Boolean);
  if (segments.length === 0) {
    return null;
  }
  for (const s of segments) {
    if (s === "." || s === "..") return null;
  }
  return segments.join("/");
}
function parsePathList(rawInput) {
  if (!rawInput || typeof rawInput !== "string") return [];
  const lines = rawInput.split(/[\r\n,]+/);
  const results = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length > 0 && !trimmed.startsWith("#")) {
      results.push(trimmed);
    }
  }
  return results;
}
async function hasChildSkills(dirPath) {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith(".")) {
        const skillPath = path.join(dirPath, entry.name, "SKILL.md");
        try {
          const stat = await fs.stat(skillPath);
          if (stat.isFile()) {
            return true;
          }
        } catch {
        }
      }
    }
  } catch {
    return false;
  }
  return false;
}
async function discoverSkillRoots(configuredPaths, options) {
  const { homeDir, autoDiscover = true } = options;
  const discoveredRoots = /* @__PURE__ */ new Set();
  const invalidPaths = [];
  for (const rawPath of configuredPaths) {
    let absPath;
    if (rawPath.startsWith("~/") || rawPath === "~") {
      absPath = path.join(homeDir, rawPath.slice(1));
    } else if (path.isAbsolute(rawPath)) {
      absPath = path.resolve(rawPath);
    } else {
      absPath = path.resolve(homeDir, rawPath);
    }
    try {
      const stat = await fs.stat(absPath);
      if (!stat.isDirectory()) {
        invalidPaths.push(rawPath);
        continue;
      }
    } catch {
      invalidPaths.push(rawPath);
      continue;
    }
    const isDirectSkillRoot = await hasChildSkills(absPath);
    if (isDirectSkillRoot) {
      const rel = normalizeToHomeRelative(absPath, homeDir);
      if (rel) {
        discoveredRoots.add(rel);
      }
    }
    if (autoDiscover) {
      try {
        const entries = await fs.readdir(absPath, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory() && !entry.name.startsWith(".")) {
            const subDirPath = path.join(absPath, entry.name);
            const subHasSkills = await hasChildSkills(subDirPath);
            if (subHasSkills) {
              const rel = normalizeToHomeRelative(subDirPath, homeDir);
              if (rel) {
                discoveredRoots.add(rel);
              }
            }
          }
        }
      } catch {
      }
    }
  }
  return {
    roots: Array.from(discoveredRoots).sort(),
    invalidPaths
  };
}

// src/config-sync.ts
import fs2 from "node:fs/promises";
import path2 from "node:path";
import crypto from "node:crypto";
function mergeSharedSkillRoots(existingConfig, discoveredRoots) {
  const config = existingConfig && typeof existingConfig === "object" ? { ...existingConfig } : {};
  const existingShared = config.sharedSkillRoots && typeof config.sharedSkillRoots === "object" ? { ...config.sharedSkillRoots } : {};
  const existingProjectRoots = Array.isArray(existingShared.project) ? [...existingShared.project] : [];
  const existingUserRoots = Array.isArray(existingShared.user) ? [...existingShared.user] : [];
  const sortedNewUser = Array.from(new Set(discoveredRoots)).sort();
  const sortedExistingUser = Array.from(new Set(existingUserRoots)).sort();
  const changed = sortedNewUser.length !== sortedExistingUser.length || sortedNewUser.some((val, idx) => val !== sortedExistingUser[idx]);
  config.sharedSkillRoots = {
    ...existingShared,
    user: sortedNewUser,
    project: existingProjectRoots
  };
  return {
    updatedConfig: config,
    changed
  };
}
async function syncWorkspaceSkills(options) {
  const { configPath, discoveredRoots, reloadConfigFn } = options;
  let existingConfig = null;
  try {
    const raw = await fs2.readFile(configPath, "utf8");
    existingConfig = JSON.parse(raw);
  } catch (err) {
    if (err && err.code !== "ENOENT") {
      throw err;
    }
  }
  const { updatedConfig, changed } = mergeSharedSkillRoots(existingConfig, discoveredRoots);
  if (changed) {
    const dir = path2.dirname(configPath);
    await fs2.mkdir(dir, { recursive: true });
    const serialized = JSON.stringify(updatedConfig, null, 2) + "\n";
    const tempPath = `${configPath}.tmp-${crypto.randomUUID()}`;
    await fs2.writeFile(tempPath, serialized, "utf8");
    await fs2.rename(tempPath, configPath);
    if (reloadConfigFn) {
      await reloadConfigFn();
    }
  }
  return {
    changed,
    rootsCount: discoveredRoots.length,
    roots: discoveredRoots
  };
}

// server.ts
async function plugin(bb) {
  bb.log.info("bb-plugin-workspace-skills loading...");
  const settings = bb.settings.define({
    scanPaths: {
      type: "string",
      label: "Skill Scan Paths",
      description: "Newline- or comma-separated filesystem paths (relative to ~ or absolute) to scan for project skills.",
      default: "Projects/skills\nProjects/.agents/skills",
      experimental_multiline: true
    },
    autoDiscover: {
      type: "boolean",
      label: "Auto-discover category folders",
      description: "Automatically scan category subdirectories (e.g. .agents/skills/research) for skill packages.",
      default: true
    }
  });
  async function runSync(trigger) {
    const current = await settings.get();
    const rawPaths = parsePathList(current.scanPaths);
    const homeDir = os.homedir();
    const { roots, invalidPaths } = await discoverSkillRoots(rawPaths, {
      homeDir,
      autoDiscover: current.autoDiscover
    });
    if (invalidPaths.length > 0) {
      bb.log.warn(`[workspace-skills] Invalid or inaccessible paths skipped: ${invalidPaths.join(", ")}`);
    }
    const configPath = path3.join(homeDir, ".bb", "config.json");
    const report = await syncWorkspaceSkills({
      configPath,
      discoveredRoots: roots,
      reloadConfigFn: async () => {
        try {
          await bb.sdk.system.reloadConfig();
        } catch (err) {
          bb.log.error(`[workspace-skills] Failed to trigger system.reloadConfig: ${err}`);
        }
      }
    });
    bb.log.info(
      `[workspace-skills] Sync (${trigger}): found ${roots.length} roots across ${rawPaths.length} paths (changed: ${report.changed})`
    );
    return { ...report, invalidPaths, rawPaths };
  }
  await runSync("initial-load");
  settings.onChange(async () => {
    bb.log.info("[workspace-skills] Settings modified, rescanning paths...");
    await runSync("settings-change");
  });
  bb.cli.register({
    name: "workspace-skills",
    summary: "Manage configurable workspace and external skill roots in BB",
    commands: [
      {
        name: "status",
        summary: "Show active skill paths, discovered roots, and registration state",
        usage: "bb workspace-skills status"
      },
      {
        name: "sync",
        summary: "Force a rescan of configured paths and reload BB skills",
        usage: "bb workspace-skills sync"
      },
      {
        name: "add",
        summary: "Add a directory path to the scanPaths setting",
        usage: "bb workspace-skills add <path>"
      }
    ],
    async run(argv) {
      const sub = argv[0] || "status";
      if (sub === "status") {
        const current = await settings.get();
        const rawPaths = parsePathList(current.scanPaths);
        const homeDir = os.homedir();
        const { roots, invalidPaths } = await discoverSkillRoots(rawPaths, {
          homeDir,
          autoDiscover: current.autoDiscover
        });
        const lines = [
          "=== BB Workspace Skills ===",
          `Configured Paths (${rawPaths.length}):`,
          ...rawPaths.map((p) => `  \u2022 ${p}`),
          "",
          `Auto-discover category folders: ${current.autoDiscover ? "enabled" : "disabled"}`,
          "",
          `Discovered Skill Roots (${roots.length}):`,
          ...roots.map((r) => `  \u2713 ~/${r}`)
        ];
        if (invalidPaths.length > 0) {
          lines.push("", `Invalid / Inaccessible Paths (${invalidPaths.length}):`);
          for (const inv of invalidPaths) {
            lines.push(`  \u2717 ${inv}`);
          }
        }
        return { exitCode: 0, stdout: lines.join("\n") + "\n" };
      }
      if (sub === "sync") {
        const report = await runSync("cli-sync");
        const msg = `Rescan complete: ${report.rootsCount} skill roots registered in BB (changed: ${report.changed}).
`;
        return { exitCode: 0, stdout: msg };
      }
      if (sub === "add") {
        const newPath = argv[1];
        if (!newPath) {
          return { exitCode: 1, stderr: "Usage: bb workspace-skills add <path>\n" };
        }
        const current = await settings.get();
        const rawPaths = parsePathList(current.scanPaths);
        if (rawPaths.includes(newPath)) {
          return { exitCode: 0, stdout: `Path '${newPath}' is already in scanPaths.
` };
        }
        rawPaths.push(newPath);
        const nextScanPaths = rawPaths.join("\n");
        if (typeof settings.experimental_set === "function") {
          await settings.experimental_set({ scanPaths: nextScanPaths });
        }
        await runSync("cli-add");
        return { exitCode: 0, stdout: `Added '${newPath}' to scanPaths and refreshed skills.
` };
      }
      return {
        exitCode: 1,
        stderr: `Unknown subcommand '${sub}'. Available subcommands: status, sync, add.
`
      };
    }
  });
  bb.onDispose(() => {
    bb.log.info("bb-plugin-workspace-skills disposed");
  });
}
export {
  plugin as default
};
//# sourceMappingURL=server.js.map
