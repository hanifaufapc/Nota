# AGENTS.md — Persistent Instructions for Nota (Manajemen Keuangan Masjid)

## Mission

Build **Nota**, a local-first mosque financial management web application (DKM / Takmir) that helps mosque administrators record, organize, plan (RAB), and transparently report mosque finances to the congregation. Read `PRD.md`, `DESIGN_BRIEF.md`, `ARCHITECTURE.md`, `IMPLEMENTATION_PLAN.md`, and `HANDOFF.md` before making substantial changes. The image at `references/nota-visual-reference.png` is the primary visual reference for palette, whitespace, and typographic calm.

## Source of truth

- Product requirements and mosque accounting/governance rules: `PRD.md`.
- Visual identity, 6-tab page layouts, print rules, and UX: `DESIGN_BRIEF.md`.
- Technology, Dexie `v5` schema, and data boundaries: `ARCHITECTURE.md`.
- Sequence and acceptance gates: `IMPLEMENTATION_PLAN.md`.
- Factual state of work: `HANDOFF.md`.

Do not silently resolve conflicts between documents. Report the exact conflict and ask for a decision before implementing affected work.

## Product invariants

- The app name is Nota.
- The product is local-first for mosque financial administration.
- Do not add login, registration, cloud databases, real bank API connections, payment-gateway integrations, or mandatory AI.
- Core workflows must work completely offline in the browser.
- Distinguish **Cash Accounts (`CashAccount` — where money is physically/manually recorded: `Kas Tunai`, `Rekening Bank Tercatat`)** from **Funds (`Fund` — designated amanah purposes: `Dana Operasional Umum`, `Dana Pembangunan`, `Dana Sosial / Zakat`)**.
- Internal **Cash Transfers (`CashTransfer`)** move balances between `CashAccount`s without altering `Fund` balances or double-counting income/expenses.
- Enforce **Soft Guard (Warning with Treasurer Confirmation)** when an expense exceeds the selected Fund/Account balance or uses a restricted Fund with an mismatched category.
- Money is stored as integer IDR values, never formatted currency strings.
- Balance logic, fund summaries, RAB realization, and financial reports must live in tested domain functions, not be duplicated in components.
- Backup and restore must live exclusively under `Pengaturan → Data & Cadangan`.
- Never populate normal user data with fake/demo transactions.
- Never claim that local browser storage is automatically encrypted.
- Never expose API secrets in frontend code.

## Visual rules

- Follow `DESIGN_BRIEF.md`; treat the reference as aesthetic direction.
- Use the warm off-white, emerald, soft green, lime accent, and charcoal tokens specified there.
- Give each of the 6 primary tabs (`Ringkasan`, `Transaksi`, `Kas & Dana`, `Anggaran / RAB`, `Laporan`, `Pengaturan`) a distinct layout, purpose, and primary action.
- Support clean `@media print` rendering on the `Laporan` tab for congregation announcements.
- Design mobile and desktop intentionally; do not simply shrink the desktop layout.
- Every visible button/control must perform a real action.

## Engineering rules

- Use React + TypeScript + Vite SPA.
- Use IndexedDB through Dexie for persistent financial data; do not use `localStorage` as the transaction database.
- Components must not query Dexie directly throughout the UI. Keep data operations in repository/domain functions.
- Keep dependencies lean; add a dependency only when its benefit is clear and it is used.
- Use semantic HTML, keyboard-accessible controls, visible focus, and labelled form fields.
- Avoid broad `any`, ignored errors, fake stubs, dead buttons, and silent catch blocks.

## Workflow

1. Inspect working tree, project structure, current milestone, and existing conventions.
2. State a concise plan before a change that spans multiple files or changes data architecture.
3. Implement one milestone or coherent vertical slice at a time.
4. Keep changes scoped; do not refactor unrelated areas during feature work.
5. Run relevant tests, typecheck, lint, and production build if configured.
6. Report exactly what ran and whether it passed. Do not claim an unrun test passed.
7. Update `HANDOFF.md` after each milestone with modified files, completed work, tests and actual outcomes, known issues, and the next task.
8. Update other docs when the relevant product, visual, or architecture decisions change.
9. Do not remove user data, migrations, or files without explicit approval.
10. If an instruction is ambiguous and a wrong assumption could damage data or architecture, stop and ask instead of guessing.

## Required completion report

At the end of each task, report:
- Changes made.
- Tests/commands actually run and outcomes.
- Remaining gaps or risks.
- Docs updated.
- Recommended next step.
