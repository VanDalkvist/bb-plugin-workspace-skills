# Arch Improvement Ledger — bb-plugin-workspace-skills

## Cycle 1: Headless BB Plugin for Configurable Workspace Skills
**Date:** 2026-09-13  
**Status:** In Progress  
**Objective:** Create a clean, headless BB plugin that allows users to configure arbitrary filesystem skill paths in BB settings, auto-discovers skill roots, updates `~/.bb/config.json`, and reloads BB via official SDK APIs.

### S0 Bootstrap
- **Target Repository:** `~/Projects/bb-plugin-workspace-skills`
- **Branch:** `main` (workspace repo)
- **Worktree State:** Clean scaffold generated via `bb plugin new workspace-skills`

### S1 Memory Load
- Checked `~/Projects/MEMORY.md`.
- Operating contract: `AGENTS.md`. No conflicting memory rules.

### S2 Orientation & Architecture Context Map
- **Boundary:** BB Plugin SDK (`@get-bb/plugin-sdk`).
- **Runtime:** Node 22 ESM, server-side only (headless plugin).
- **Inputs:** Freeform user paths in BB Settings (`scanPaths`) and toggle (`autoDiscover`).
- **Outputs:**
  - Synchronized `sharedSkillRoots.user` array in `~/.bb/config.json`.
  - Invocation of `bb.sdk.system.reloadConfig()`.
  - CLI command `bb workspace-skills` (`status`, `sync`, `add`).
- **Constraints:**
  - Strict compliance with `providerSkillRootPathSchema`: paths must be relative to `$HOME` without leading slash or `.` / `..` segments.
  - Zero symlink reliance (BB explicitly skips symlinks).
  - Atomic, idempotent config updates (no rewrite if roots are unchanged).
  - Headless architecture: no unnecessary React/DOM frontend overhead.

### S3 Brainstorm
- User requirement: "Плагин должен быть такой, что при установке в сеттингах можно добавить пути в файловой системе, где надо будет сканить скиллы. Так мы не заточимся на конкретные пути, а пользователь их будет задавать."
- Approved by user.

### S4 Review Findings & S5 Triage
- [x] **FINDING-1 (P1):** Scaffold includes unwanted React/DOM frontend files (`app.tsx`, `components/`, etc.). -> `fix-now`
- [x] **FINDING-2 (P0):** Path normalization must handle `~/`, absolute paths within `$HOME`, and trailing slashes while rejecting paths outside `$HOME`. -> `fix-now`
- [x] **FINDING-3 (P0):** Auto-discovery must detect directories containing children with `SKILL.md` (e.g. `skills/*` or `.agents/skills/*/*`). -> `fix-now`
- [x] **FINDING-4 (P0):** Config updater must preserve existing `~/.bb/config.json` fields and be idempotent. -> `fix-now`
- [x] **FINDING-5 (P1):** Declarative settings schema and CLI commands. -> `fix-now`
- [x] **FINDING-6 (P1):** Unit test suite for scanner and config merger. -> `fix-now`

### S6 Plan Reference
- Plan file: `docs/superpowers/plans/2026-09-13-workspace-skills-plugin.md`
