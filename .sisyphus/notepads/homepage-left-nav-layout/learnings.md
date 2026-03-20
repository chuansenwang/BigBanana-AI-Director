
- Task 1 preservation contract from `components/Dashboard.tsx`:
  - Root homepage actions currently exposed are already organized in a left rail on desktop (`components/Dashboard.tsx:346-444`) with mobile fallback controls in the header (`components/Dashboard.tsx:456-523`).
  - Preserve navigation actions: 项目库 (`357-368`), 数据分析 (`369-384`), 对标分析 (`387-398`), 总览 (`399-410`).
  - Preserve utility actions: 系统设置 (`417-423`, `493-499`), theme toggle (`424-430`, `500-506`), 账号中心 (`435-441`, `515-521`).
  - Preserve create/open project affordances: `handleCreate` (`208-216`) is used by header CTA (`508-514`), create card (`563-570`), and analysis overview CTA; project cards open with direct `navigate(`/project/${proj.id}`)` (`573-577`).
  - Preserve DirectorHub section and external link (`528-545`).
  - Preserve settings modal and downstream actions: 模型配置 (`1199-1212`), 资产库 (`1215-1227`), 导出数据 (`1229-1239`), 导入数据 (`1241-1250`) plus hidden file input (`1488-1493`).
  - Preserve overlay flows: asset library modal (`1257-1398`), asset-to-project picker (`1400-1438`), benchmark import picker (`1440-1486`), and per-card delete confirmation overlay (`579-592`).
  - Modal layering depends on `fixed inset-0 z-50`; desktop rail is `z-40`, so modal host must stay above the shell (`346`, `1175`, `1259`, `1402`, `1441`).

- Task 2 verification:
  - Current desktop homepage already satisfies the left-nav structure requirement with visible rail actions for 项目库 / 数据分析 / 系统设置 / 账号中心 (`components/Dashboard.tsx:346-444`).
  - Playwright verification on `http://localhost:3003/` confirmed the left rail renders, the settings modal opens from the rail, and the account action routes to `/account` before returning to `/`.
  - Evidence file captured: `.sisyphus/evidence/task-2-left-rail.png`.

- Task 3 verification:
  - Current `Dashboard` already renders as a two-column desktop shell with `aside` rail and right content pane (`components/Dashboard.tsx:343-447`).
  - At 1440px width, Playwright snapshot showed left rail plus main content with no horizontal overflow; DOM metrics reported `docScrollWidth === window.innerWidth === 1440`.
  - At 1024px width, Playwright metrics still showed `asideVisible: true`, `mainLeftMargin: 288px`, and `hasHorizontalOverflow: false`.
  - Evidence files captured: `.sisyphus/evidence/task-3-two-column-shell.png` and `.sisyphus/evidence/task-3-narrow-desktop.png`.

- Task 4 verification:
  - Right content pane already contains the project-library section with create card plus project cards (`components/Dashboard.tsx:548-628`).
  - Playwright verified create-project flow by clicking the create card and reaching `/project/sproj_*`; evidence saved at `.sisyphus/evidence/task-4-create-flow.png`.
  - After reload, Playwright verified an existing project card opens its project route and the per-card delete overlay appears with cancel preserving the card; evidence saved at `.sisyphus/evidence/task-4-delete-cancel.png`.

- Task 5 verification:
  - Utility actions already live in the rail/footer + content-pane pattern instead of a desktop top-header cluster: settings/theme/account in the rail (`components/Dashboard.tsx:416-443`), new-project via create card in the content pane (`563-570`).
  - Playwright confirmed the theme toggle switches visible label from `亮色` to `暗色`; evidence saved at `.sisyphus/evidence/task-5-utilities.png`.
  - Settings/account/new-project reachability was already proven during Tasks 2 and 4, so Task 5 passes on existing code.

- Task 6 verification:
  - `DirectorHub 资源共创平台` remains rendered above the project library in the right content pane (`components/Dashboard.tsx:528-545`), while the project library section remains directly below (`548-628`).
  - Playwright confirmed both DirectorHub and 项目库 headings are simultaneously visible and the DirectorHub link still resolves to `https://directorhub.tree456.com/`.
  - Evidence file captured: `.sisyphus/evidence/task-6-directorhub-layout.png`.

- Task 7 verification:
  - Overlay chain remains intact: `系统设置` opens the settings modal, then `资产库` opens the asset-library modal above the homepage shell (`components/Dashboard.tsx:1173-1255`, `1257-1398`).
  - Playwright verified the asset library modal is visible with search/filter controls, accepts a query, shows the empty-state text, and closes back to a normal homepage interaction state.
  - Evidence files captured: `.sisyphus/evidence/task-7-settings-asset-library.png` and `.sisyphus/evidence/task-7-library-search-empty.png`.

- Task 8 verification:
  - Fresh navigation to `/` still lands on `Dashboard` with `aside` present and project-library content visible; Playwright evidence saved at `.sisyphus/evidence/task-8-root-homepage.png`.
  - `npm run build` succeeded after UTF-8 guardrail and Vite build; terminal output saved at `.sisyphus/evidence/task-8-build.txt`.
