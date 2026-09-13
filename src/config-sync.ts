import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

export interface MergeResult {
  updatedConfig: Record<string, any>;
  changed: boolean;
}

/**
 * Merges discovered roots into existing config object.
 * Preserves all existing keys, ensures sharedSkillRoots is correctly structured.
 */
export function mergeSharedSkillRoots(
  existingConfig: any,
  discoveredRoots: string[]
): MergeResult {
  const config = existingConfig && typeof existingConfig === "object"
    ? { ...existingConfig }
    : {};

  const existingShared = config.sharedSkillRoots && typeof config.sharedSkillRoots === "object"
    ? { ...config.sharedSkillRoots }
    : {};

  const existingProjectRoots: string[] = Array.isArray(existingShared.project)
    ? [...existingShared.project]
    : [];

  const existingUserRoots: string[] = Array.isArray(existingShared.user)
    ? [...existingShared.user]
    : [];

  // Sort and deduplicate
  const sortedNewUser = Array.from(new Set(discoveredRoots)).sort();
  const sortedExistingUser = Array.from(new Set(existingUserRoots)).sort();

  // Check equality
  const changed =
    sortedNewUser.length !== sortedExistingUser.length ||
    sortedNewUser.some((val, idx) => val !== sortedExistingUser[idx]);

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

export interface SyncOptions {
  configPath: string;
  discoveredRoots: string[];
  reloadConfigFn?: () => Promise<any>;
}

export interface SyncReport {
  changed: boolean;
  rootsCount: number;
  roots: string[];
}

/**
 * Reads config.json, performs safe merge of sharedSkillRoots.user,
 * writes atomically if changed, and calls the reload function.
 */
export async function syncWorkspaceSkills(options: SyncOptions): Promise<SyncReport> {
  const { configPath, discoveredRoots, reloadConfigFn } = options;

  let existingConfig: any = null;
  try {
    const raw = await fs.readFile(configPath, "utf8");
    existingConfig = JSON.parse(raw);
  } catch (err: any) {
    if (err && err.code !== "ENOENT") {
      throw err;
    }
  }

  const { updatedConfig, changed } = mergeSharedSkillRoots(existingConfig, discoveredRoots);

  if (changed) {
    const dir = path.dirname(configPath);
    await fs.mkdir(dir, { recursive: true });

    const serialized = JSON.stringify(updatedConfig, null, 2) + "\n";
    const tempPath = `${configPath}.tmp-${crypto.randomUUID()}`;

    await fs.writeFile(tempPath, serialized, "utf8");
    await fs.rename(tempPath, configPath);

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
