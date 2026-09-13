import path from "node:path";
import fs from "node:fs/promises";

/**
 * Normalizes an arbitrary path string to a relative path from homeDir.
 * Returns null if the path is outside homeDir or contains invalid traversal segments.
 * Conforms to BB's providerSkillRootPathSchema.
 */
export function normalizeToHomeRelative(pathStr: string, homeDir: string): string | null {
  if (!pathStr || typeof pathStr !== "string") return null;

  let trimmed = pathStr.trim();
  if (trimmed.length === 0) return null;

  // Resolve tilde
  if (trimmed === "~" || trimmed.startsWith("~/")) {
    trimmed = path.join(homeDir, trimmed.slice(1));
  }

  // Resolve absolute or relative to home
  const absoluteTarget = path.isAbsolute(trimmed)
    ? path.resolve(trimmed)
    : path.resolve(homeDir, trimmed);

  // Check if target is inside homeDir
  const relative = path.relative(homeDir, absoluteTarget);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    // Outside home directory
    return null;
  }

  // Normalize separators to POSIX slashes
  const posixPath = relative.split(path.sep).join("/");

  // Check against BB's isRelativeProviderSkillRootPath:
  // !normalized.startsWith("/") && !/^[a-zA-Z]:\//u.test(normalized) && normalized.split("/").every(s => s !== "" && s !== "." && s !== "..")
  const segments = posixPath.split("/").filter(Boolean);
  if (segments.length === 0) {
    return null;
  }

  for (const s of segments) {
    if (s === "." || s === "..") return null;
  }

  return segments.join("/");
}

/**
 * Parses multiline or comma-separated raw configuration into a list of cleaned paths.
 */
export function parsePathList(rawInput: string): string[] {
  if (!rawInput || typeof rawInput !== "string") return [];

  const lines = rawInput.split(/[\r\n,]+/);
  const results: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length > 0 && !trimmed.startsWith("#")) {
      results.push(trimmed);
    }
  }

  return results;
}

/**
 * Checks if a given directory contains immediate children that have a SKILL.md.
 */
async function hasChildSkills(dirPath: string): Promise<boolean> {
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
          // not a skill file, continue checking other entries
        }
      }
    }
  } catch {
    return false;
  }
  return false;
}

export interface DiscoverOptions {
  homeDir: string;
  autoDiscover?: boolean;
}

export interface DiscoverResult {
  roots: string[];
  invalidPaths: string[];
}

/**
 * Scans configured paths and discovers all valid BB skill root paths (relative to homeDir).
 */
export async function discoverSkillRoots(
  configuredPaths: string[],
  options: DiscoverOptions
): Promise<DiscoverResult> {
  const { homeDir, autoDiscover = true } = options;
  const discoveredRoots = new Set<string>();
  const invalidPaths: string[] = [];

  for (const rawPath of configuredPaths) {
    let absPath: string;
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

    // Check if this directory itself directly contains skills
    const isDirectSkillRoot = await hasChildSkills(absPath);
    if (isDirectSkillRoot) {
      const rel = normalizeToHomeRelative(absPath, homeDir);
      if (rel) {
        discoveredRoots.add(rel);
      }
    }

    // If autoDiscover is enabled, inspect subdirectories for category folders containing skills
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
        // ignore read errors on subdirectories
      }
    }
  }

  return {
    roots: Array.from(discoveredRoots).sort(),
    invalidPaths
  };
}
