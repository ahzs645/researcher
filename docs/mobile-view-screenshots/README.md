# Mobile view verification (demo mode)

Screenshots captured while walking the `/demo` workspace at a mobile viewport
(390×844, iPhone-class) to verify every view renders correctly on mobile.

Result: **all views render correctly — no fixes needed.** Data tables scroll
horizontally to reveal extra columns, which is the intended mobile behavior.

## Coverage

- Onboarding modal + mobile nav drawer (Lab / Work / Funding / Discovery folders)
- All object list views:
  - Lab: research teams, researchers, collaborators, applicant profiles, institutions
  - Work: projects, milestones, datasets, manuscripts, manuscript sections, figures,
    references, journal templates, project assignments, obligations, obligation
    documents, tasks, notes
  - Funding: grants, grant applications, application cycles, application requirements,
    application sections, reusable answers
  - Discovery: grant sources, grant opportunities
  - Top-level: opportunities, dashboards, workflows (empty states)
- Record detail pages: company, researcher (fields, chips, relations, tabs)
- Discovery custom page, Settings, Ask AI chat panel

All seeded demo views are table views (`type: 'TABLE'`); the demo seeds no Kanban
views.
