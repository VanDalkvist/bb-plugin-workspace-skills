import { describe, it } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { mergeSharedSkillRoots, syncWorkspaceSkills } from "../src/config-sync.ts";

describe("ConfigSync", () => {
  describe("mergeSharedSkillRoots", () => {
    it("preserves other keys in config.json", () => {
      const existing = {
        config: { BB_INFERENCE: "test-model" },
        customModels: [{ id: "m1" }],
        sharedSkillRoots: {
          project: ["repo/skills"],
          user: ["old/root"]
        }
      };

      const { updatedConfig, changed } = mergeSharedSkillRoots(existing, ["Projects/skills"]);

      assert.equal(changed, true);
      assert.deepEqual(updatedConfig.config, { BB_INFERENCE: "test-model" });
      assert.deepEqual(updatedConfig.customModels, [{ id: "m1" }]);
      assert.deepEqual(updatedConfig.sharedSkillRoots.project, ["repo/skills"]);
      assert.deepEqual(updatedConfig.sharedSkillRoots.user, ["Projects/skills"]);
    });

    it("returns changed=false when roots are identical", () => {
      const existing = {
        sharedSkillRoots: {
          user: ["Projects/skills", "Projects/.agents/skills/research"],
          project: []
        }
      };

      const { changed } = mergeSharedSkillRoots(existing, [
        "Projects/.agents/skills/research",
        "Projects/skills"
      ]);

      assert.equal(changed, false);
    });

    it("handles null or missing initial config", () => {
      const { updatedConfig, changed } = mergeSharedSkillRoots(null, ["Projects/skills"]);

      assert.equal(changed, true);
      assert.deepEqual(updatedConfig, {
        sharedSkillRoots: {
          user: ["Projects/skills"],
          project: []
        }
      });
    });
  });

  describe("syncWorkspaceSkills disk operation", () => {
    it("writes config and calls reload when changed", async () => {
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "bb-config-sync-test-"));
      const configPath = path.join(tmpDir, "config.json");
      let reloadCalled = false;

      try {
        const result = await syncWorkspaceSkills({
          configPath,
          discoveredRoots: ["Projects/skills"],
          reloadConfigFn: async () => {
            reloadCalled = true;
          }
        });

        assert.equal(result.changed, true);
        assert.equal(reloadCalled, true);

        const content = JSON.parse(await fs.readFile(configPath, "utf8"));
        assert.deepEqual(content.sharedSkillRoots.user, ["Projects/skills"]);

        // Second run without changes should not call reload
        reloadCalled = false;
        const result2 = await syncWorkspaceSkills({
          configPath,
          discoveredRoots: ["Projects/skills"],
          reloadConfigFn: async () => {
            reloadCalled = true;
          }
        });

        assert.equal(result2.changed, false);
        assert.equal(reloadCalled, false);
      } finally {
        await fs.rm(tmpDir, { recursive: true, force: true });
      }
    });
  });
});
