# ACCOUNT CENTER KNOWLEDGE BASE

## OVERVIEW
This directory holds the account/billing/token/log subviews used by `components/NewApiConsole.tsx`. It is operational/admin UI, not part of the creative stage workflow.

## WHERE TO LOOK
| Task | Location | Notes |
|---|---|---|
| Login/register UI | `AuthView.tsx`, `types.ts`, `internal.ts` | `AuthTab` is only `login | register` |
| Billing/top-up/subscription UI | `BillingPanel.tsx`, `utils.ts` | payment normalization and form submission helpers live in utils |
| Token management | `TokensPanel.tsx`, `types.ts` | token form state is local to this domain |
| Usage/task logs | `LogsPanel.tsx` | filter-heavy, pairs with `services/newApiService.ts` |
| Overview cards | `OverviewPanel.tsx`, `ui.tsx` | summary surfaces and shared section shells |

## CONVENTIONS
- `NewApiConsole.tsx` is the container; this folder mostly provides subpanels and helper types/utils.
- Domain helpers are intentionally co-located (`types.ts`, `utils.ts`, `ui.tsx`) instead of pushed up to global folders.
- This area talks to `services/newApiService.ts`, not the creative stage service stack.

## ANTI-PATTERNS
- Do not move payment/token-specific helpers into generic component utilities without a real reuse case.
- Do not store endpoint/session assumptions in UI only; session behavior is defined by `services/newApiService.ts` plus `server/newApiProxyCore.mjs`.
- Do not mix creative-workflow terminology here; this route is operational/account management.

## NOTES
- `components/NewApiConsole.tsx` is large; when changing flow, inspect both the container and the panel file you touched.
- Payment and top-up UX depends on upstream capability flags returned by the new-api backend.
