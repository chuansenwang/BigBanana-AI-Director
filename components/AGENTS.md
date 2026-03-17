# COMPONENTS KNOWLEDGE BASE

## OVERVIEW
`components/` contains both the creative workflow surfaces (the Stage modules) and a few cross-cutting UI domains such as dashboard, onboarding, model config, character library, and account center.

## STRUCTURE
```text
components/
├── StageScript|Assets|Director|Export|Prompts/   # real stage implementations
├── StageScript.tsx ... StageExport.tsx           # compatibility re-export shells
├── CharacterLibrary/                             # project-level asset library UI
├── Onboarding/                                   # first-run flow and API key setup
├── ModelConfig/                                  # model/provider configuration modal
├── account-center/                               # billing/token/log/account console
├── Dashboard.tsx                                 # root landing surface
├── ProjectOverview.tsx                           # project + episode overview
└── Sidebar.tsx                                   # stage navigation shell
```

## WHERE TO LOOK
| Task | Location | Notes |
|---|---|---|
| Main episode stage UI | `Stage*/index.tsx` | wrapper `.tsx` files are not the implementation |
| Stage-local architecture | `Stage*/README.md` | best source for module breakdown and intended decomposition |
| Landing/project navigation | `Dashboard.tsx`, `ProjectOverview.tsx`, `Sidebar.tsx` | route-facing shells |
| Asset library UX | `CharacterLibrary/` | shared character/scene/prop editing and sync banners |
| First-run/API onboarding | `Onboarding/` | localStorage-backed onboarding flow |
| Model/provider modal | `ModelConfig/`, `ModelManagerTab.tsx` | provider and model registry UI |
| Account route | `NewApiConsole.tsx`, `account-center/` | separate domain, see child AGENTS |

## CONVENTIONS
- Stage folders follow a modular refactor pattern: split constants, utils, and narrow child components out of a former monolith.
- Top-level Stage wrapper files must keep `export { default } from './StageX/index';` style compatibility.
- Shared styling is mostly class-string + CSS-variable based; README references to Tailwind are partially historical.
- Many user-facing editor flows are inline and stateful; preserve existing save/cancel interaction patterns when editing UI.

## ANTI-PATTERNS
- Do not add new logic to wrapper re-export files.
- Do not duplicate stage-local documentation in new child docs; defer to each stage README.
- Do not treat all components equally: `NewApiConsole` and Stage folders are domain-heavy, while small root components are shells.

## NOTES
- The Stage directories already carry detailed README files; avoid adding another nested AGENTS layer there unless the repo structure changes again.
- `App.tsx` controls stage switching and autosave; component-level changes often require checking route-shell behavior too.
