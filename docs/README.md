# Documentation index

| Doc | Purpose |
| --- | --- |
| **[ARCHITECTURE.md](ARCHITECTURE.md)** | End-to-end system architecture: graph engine, UI shell / workflow persistence, spam pipeline, data model, auth, retrieval, trade-offs, scale path. Use for hiring-manager walkthroughs and system design sessions. |
| **[13-server-graph-executor-roadmap.md](13-server-graph-executor-roadmap.md)** | Planned re-architecture: generic `runSavedGraph` on the server so any stored graph can drive production — extension boundaries, executor layering. |
| **[07-tech-stack-rationale.md](07-tech-stack-rationale.md)** | Why Vite + Hono + two-process dev, etc. |
| **[08-from-demo-to-product.md](08-from-demo-to-product.md)** | Staged product roadmap (RAG → persistence → …). The opening “anchor” section is **historical** for Stage A; current shipped behavior is in ARCHITECTURE.md. |
| **[12-spam-detection-app.md](12-spam-detection-app.md)** | Spam vertical: extend vs fork, phases, data model, nodes, API — updated with **implemented** vs **planned** callouts. |
| **05–06, 09–11** | Node design, agents strategy, registry refactor — deeper design notes. |

**Product story (short):** A general-purpose visual LLM pipeline editor (`/`) with server-backed graphs and corpora; a **spam triage** vertical (`/spam`) uses the same studio to edit the **`spam-default`** policy graph. Stage B on ingest reads the judge **system prompt** from that saved graph; reviewers open items in the studio via **Edit pipeline in studio**, test with **Run**, and ship changes with **Publish spam policy**.
