---
name: workspace-skills
description: Manage and inspect configurable external and project skill roots in BB. Use when checking active skill paths, rescanning directories, or adding new skill scan locations.
---

# Workspace Skills Plugin

Configure external and workspace skill roots in BB without hardcoding paths.

## Usage

Use the `bb workspace-skills` CLI to inspect, sync, or configure paths:

- `bb workspace-skills status` — list configured paths, auto-discovery setting, and all discovered skill roots.
- `bb workspace-skills sync` — force an immediate rescan of all configured paths and reload BB skills.
- `bb workspace-skills add <path>` — add a directory path (relative to `~` or absolute) to the scan list.

## Settings

Settings can be edited via the BB UI under **Settings → Plugins → Workspace Skills**, or via CLI:

```bash
bb plugin config workspace-skills set scanPaths "Projects/skills,Projects/.agents/skills"
bb plugin config workspace-skills set autoDiscover true
```
