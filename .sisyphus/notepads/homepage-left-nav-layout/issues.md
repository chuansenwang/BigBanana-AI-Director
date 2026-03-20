
- Plan/code drift detected during Task 1 verification:
  - `components/Dashboard.tsx` already renders a desktop left rail + right content layout (`343-447`). The active plan describes this as future work, so later tasks must be interpreted as regression/polish against current code unless deeper diffs prove otherwise.
  - `onShowOnboarding` prop exists in `Props` (`17-20`) but is not used in render logic, so there is no active homepage help/onboarding trigger to preserve inside `Dashboard.tsx`.
  - `onOpenProject` prop exists (`18`, component signature at `23`) but current homepage uses direct `navigate(...)` calls instead of the prop callback.
  - No QR/group modal is owned by `Dashboard.tsx`; required preservation scope should not assume one without evidence.

- Task 4 QA note:
  - Browser back from `/project/:id` to `/` temporarily returned a stale 0-project homepage view until a fresh navigation/reload. Fresh load showed the persisted project correctly. This may be an existing state-refresh issue outside the left-nav layout scope, but keep it in mind for final regression.

- Task 5 scope note:
  - The plan mentions help/onboarding relocation, but current `Dashboard` has no rendered help/onboarding trigger. Treat this as a stale-plan expectation, not a missing relocation in the current implementation.
