<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

## Project rules
- Pages read and write audits only through `src/services/auditService.ts`. Demo sessions stay in `src/mocks`. Uploaded audits go through the local API in `src/server`. If that API fails, show the error on the current audit and do not substitute demo data.
- Route files in `src/routes` stay thin and render page components from `src/pages`; domain types live in `src/types/audit.ts`, demo data in `src/mocks`.
- Reviewer verdicts are stored separately from automatic `CheckResult.status`; never let a reviewer action change the automatic status.
- Highlights for uploaded files come only from anchors or coordinates the extractor actually produced. If only a page and a quote are known, show those and do not invent a box. Never store user file contents in localStorage.
- Before editing, sync with the remote if the branch is behind and the worktree is clean. Commit and push a requested change when it is done; do not commit secrets.

- Keep route-aware navigation in AppShell: homepage uses a compact top bar and review workspaces use an icon rail to reserve space for evidence.
- Landing evidence previews are filtered views of synthetic pages obtained through auditService, with existing evidence anchors; do not duplicate document values.
- Use the generated Sverko document-check icon for the homepage identity and derive the public favicon from the same source so browser and page branding stay consistent.
