import { describe, it } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { normalizeToHomeRelative, parsePathList, discoverSkillRoots } from "../src/scanner.ts";

describe("Scanner", () => {
  const mockHome = "/Users/testuser";

  describe("normalizeToHomeRelative", () => {
    it("normalizes home-relative paths without leading slash", () => {
      assert.equal(normalizeToHomeRelative("Projects/skills", mockHome), "Projects/skills");
    });

    it("normalizes tilde paths", () => {
      assert.equal(normalizeToHomeRelative("~/Projects/skills", mockHome), "Projects/skills");
      assert.equal(normalizeToHomeRelative("~/Projects/.agents/skills/research", mockHome), "Projects/.agents/skills/research");
    });

    it("normalizes absolute paths inside home", () => {
      assert.equal(normalizeToHomeRelative("/Users/testuser/Projects/skills", mockHome), "Projects/skills");
    });

    it("strips trailing slashes", () => {
      assert.equal(normalizeToHomeRelative("Projects/skills/", mockHome), "Projects/skills");
      assert.equal(normalizeToHomeRelative("~/Projects/skills///", mockHome), "Projects/skills");
    });

    it("rejects paths outside home directory", () => {
      assert.equal(normalizeToHomeRelative("/etc/skills", mockHome), null);
      assert.equal(normalizeToHomeRelative("../outside", mockHome), null);
    });

    it("rejects path traversal attempts", () => {
      assert.equal(normalizeToHomeRelative("~/Projects/../Projects/skills", mockHome), "Projects/skills");
      assert.equal(normalizeToHomeRelative("~/../../etc", mockHome), null);
    });
  });

  describe("parsePathList", () => {
    it("parses comma-separated and newline-separated strings", () => {
      const input = "Projects/skills, Projects/.agents/skills\n# this is a comment\n~/Another/Path\n";
      const result = parsePathList(input);
      assert.deepEqual(result, [
        "Projects/skills",
        "Projects/.agents/skills",
        "~/Another/Path"
      ]);
    });
  });

  describe("discoverSkillRoots with fixture directories", () => {
    it("discovers skill roots and subcategories", async () => {
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "bb-skills-test-"));
      try {
        // Create flat skills directory: tmpDir/skills/skill-a/SKILL.md
        await fs.mkdir(path.join(tmpDir, "skills", "skill-a"), { recursive: true });
        await fs.writeFile(path.join(tmpDir, "skills", "skill-a", "SKILL.md"), "---\nname: skill-a\ndescription: Test A\n---\n");

        // Create categorized directory: tmpDir/.agents/skills/cat-1/skill-b/SKILL.md
        await fs.mkdir(path.join(tmpDir, ".agents", "skills", "cat-1", "skill-b"), { recursive: true });
        await fs.writeFile(path.join(tmpDir, ".agents", "skills", "cat-1", "skill-b", "SKILL.md"), "---\nname: skill-b\ndescription: Test B\n---\n");

        const { roots, invalidPaths } = await discoverSkillRoots(
          [path.join(tmpDir, "skills"), path.join(tmpDir, ".agents", "skills")],
          { homeDir: tmpDir, autoDiscover: true }
        );

        assert.deepEqual(invalidPaths, []);
        assert.ok(roots.includes("skills"), "Should include 'skills'");
        assert.ok(roots.includes(".agents/skills/cat-1"), "Should include category root '.agents/skills/cat-1'");
      } finally {
        await fs.rm(tmpDir, { recursive: true, force: true });
      }
    });
  });
});
