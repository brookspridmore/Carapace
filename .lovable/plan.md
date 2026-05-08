# Carapace v1 — Operator Dashboard (Approved)

A self-hosted-style operator dashboard for OpenClaw. v1 ships the **Flow engine** and **Kanban mission control** as deep, interactive modules. All other modules ship as visually complete, themed pages with realistic placeholder content — they should feel like real product surfaces, not blank shells.

The product name is **Carapace** everywhere — code, UI, metadata, env vars, deploy files, docs. No alternate names.

## Hosting reality

Lovable preview runs on TanStack Start at the edge — it cannot literally bind to `127.0.0.1:8080` or run as systemd. The Carapace UI runs in preview; VPS deployment files are generated as repo artifacts you run yourself.

## Design system

Locked palette in `src/styles.css` (Tailwind v4 `@theme` tokens, oklch):
- bg `#0B0B0D`, panel `#1A1A1F`, card `#2A2A30`
- text `#F5F5F5`, muted `#A0A0A8`
- accent yellow `#F4E27A`, coral `#F47C7C`, sky `#7FD1E8`

Applied to buttons, focus rings (yellow glow), Flow nodes/edges, Kanban priority dots, status colors. Inter for UI, JetBrains Mono for IDs/metrics. Soft shadows, fast minimal animations.

## App shell

Persistent collapsible left rail: **Flow** (default) · **Kanban** · Agents · Files · Conversations · Dreams · Memory · Snapshots · Providers · Approvals · Logs · Settings.

Top bar: agent breadcrumb, global search, approvals badge, OpenClaw connection indicator (green/red dot from health check on `OPENCLAW_BASE_URL`).

## Module 1 — Flow Engine (deep)

React Flow (`@xyflow/react`) with custom nodes, animated edges, minimap, pan/zoom, focus mode.

Selected agent is always center; clicking any subagent re-centers and filters the graph.

- **Top**: metrics strip (msgs/min, tokens, cost, errors) — animated counters
- **Left**: Inputs (human, telegram, terminal, API, cron, parent agent)
- **Center**: Agent node — name, role, model, provider, status, active task, token bar, context-pressure ring
- **Right**: Tools (exec/coral, web+search/sky, memory/yellow, file/gray, tts)
- **Bottom**: Infrastructure (DB, FTS index, snapshot store, OpenClaw process)
- **Bottom drawer**: collapsible live log tail filtered to selected agent

Edges: dashed animated when active; labels show latency + cost; gray idle / sky active / yellow priority / coral error; hover shows last payloads. Default agent: Chief of Staff with subagents Researcher, Marketer, Builder, Ops. 2s simulated tick keeps the graph alive.

## Module 2 — Kanban Mission Control (deep)

Eight columns: Inbox · Planned · Assigned · Running · Needs Review · Blocked · Done · Failed.

Card: title, agent avatar+name, priority dot (coral/yellow/sky), due date, subtask progress, attachment/snapshot/conversation icons.

- Drag/drop with dnd-kit
- Card → right detail drawer: description, checkable subtasks, agent reassign, linked session/conversation/snapshot, output files, log tail, Approve / Request Changes for "Needs Review"
- "+ Task" composer; "Split task" generates subtasks
- Filters: agent, priority, has-snapshot, due-soon
- Persisted in Lovable Cloud (Postgres)

## Module 3 — Stubbed modules (visually complete)

Each is a fully designed page with realistic mock content, proper layouts, working filters/tabs where shown — not blank placeholders. Functionality is shallow but the surface looks shipped.

- **Agents** — grid of agent cards (Chief + subagents) with role, model, memory size, workspace path; detail panel
- **Files** — two-pane: file tree (OpenClaw codebase + `.md` agent files: AGENTS / SOUL / MEMORY / USER / DREAMS) and read-only markdown viewer with diff/backup buttons
- **Conversations** — unified inbox, channel filters (Telegram/UI/terminal/API), threaded message list with sample conversations
- **Dreams** — toggle, phase timeline (sample run), pending memory-change list with approve/reject, DREAMS.md preview
- **Memory** — search bar (FTS-styled), source tabs (MEMORY/DREAMS/daily notes/snapshots), promotion queue with sample entries
- **Snapshots** — list of snapshot cards (objective, current state, decisions, next actions, blockers, files, memory refs)
- **Providers** — table (OpenAI, Anthropic, Gemini, Groq, Mistral, Ollama, Custom), primary/fallback ordering, test-connection button (UI only)
- **Approvals** — queue of pending risky actions (commands/file edits/config/memory writes) with approve/deny + diff view
- **Logs** — virtualized log viewer with sample stream, level/agent filters
- **Settings** — `OPENCLAW_BASE_URL` field, Tailscale instructions, theme

## Backend — Carapace proxy layer

TanStack Start server functions in `src/server/`:
- `openclaw.server.ts` — fetch helper reading `process.env.OPENCLAW_BASE_URL` inside handlers
- `openclaw.functions.ts` — typed `createServerFn` wrappers (getAgents, getFlow, listTasks, createTask, updateTaskStatus, listConversations, …) returning mock data via swappable adapters
- `adapters/mock.ts` and `adapters/openclaw.ts` — adapter interface so real OpenClaw endpoints replace mocks later without UI changes
- `approvals.functions.ts` — gates risky proxied calls

UI never calls OpenClaw directly from the browser.

Lovable Cloud Postgres tables (RLS): `agents`, `tasks`, `task_events`, `snapshots`, `approvals`, `audit_logs`, `provider_configs`. Seeded with Chief of Staff + 4 subagents and a realistic Kanban board.

The data layer is documented for swap to SQLite/FTS5 on the VPS.

## Deploy scaffolding (repo files)

Generated under `deploy/` and project root:
- `deploy/install.sh` — install deps, run migrations, start service, print Tailscale command
- `deploy/carapace.service` — systemd unit, binds `127.0.0.1:8080`
- `.env.example` — `OPENCLAW_BASE_URL=http://127.0.0.1:18789` (with `OPENCLAW_GATEWAY_URL` documented as alias), DB URL, secrets
- `INSTALL.md` — install/run on VPS
- `DEPLOYMENT_TAILSCALE.md` — `tailscale serve --bg http://127.0.0.1:8080` and ACL guidance
- `SECURITY.md` — localhost binding, approvals, audit logs
- `deploy/README.md` — overview pointing to the above

Internal preference: `OPENCLAW_BASE_URL`. `OPENCLAW_GATEWAY_URL` documented as alias and accepted as fallback in the server helper.

## Out of scope for v1

Real OpenClaw wiring · live SQLite FTS5 in preview · real dreaming engine · live OpenClaw codebase editing · provider connection tests · executing the install script.

## Implementation order

1. Design tokens & shell (palette, sidebar, top bar, routing)
2. Flow engine (React Flow, custom nodes, simulated tick)
3. Kanban (dnd-kit, detail drawer, Cloud persistence)
4. Cloud schema + seed
5. Stubbed modules (visually complete)
6. Deploy scaffolding files