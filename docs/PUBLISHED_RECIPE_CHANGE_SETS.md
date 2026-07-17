# Private Change Sets for Published Recipes

Published-recipe revisions are implemented for the guarded D1 deployment but remain disabled in checked-in configuration.

```jsonc
"RECIPE_SUBMISSIONS_ENABLED": "false"
```

The public D1-free application is unchanged. No real change set was created, submitted, restored, reviewed, promoted, or deployed by these implementation phases.

## Safety objective

Neither contributors nor editors mutate a live `published` recipe while drafting. Proposed content is stored in a separate private change set. Public reads continue to use the existing normalized published row until one guarded D1 approval batch completes.

```text
published live recipe remains public and unchanged
  └─ private change set: draft
       → review
       → changes_requested → review
       → approved and atomically promoted
       → or cancelled
```

A failed validation, stale base, concurrent update, invalid historical source, media/derivative change, or failed D1 statement leaves the live recipe unchanged.

## Migration `0010_published_recipe_change_sets`

The migration adds:

- `recipe_change_sets`;
- `recipe_change_set_events`;
- one-active-change-set-per-recipe partial uniqueness;
- active media reservation uniqueness;
- contributor/editorial queue indexes;
- published-owner triggers;
- cross-table recipe/change-set media reservation triggers.

Each change set stores recipe/owner/creator identity, status, optimistic revision, exact base recipe/content revisions, optional resulting recipe revision, proposed media, private baseline/proposed JSON, notes, and lifecycle timestamps.

Supported statuses:

```text
draft
review
changes_requested
approved
cancelled
superseded
```

Only `draft`, `review`, and `changes_requested` are active. D1 allows at most one active change set per recipe.

## Contributor workflow

Routes:

- `/account/submissions/:id/change-set`;
- `POST /api/recipes/:id/change-set`.

Contributor actions are `create`, `save`, `submit`, and `cancel`. Mutations require a verified owner session, same-origin, `recipe-published-change-set` purpose CSRF, current session CSRF, limits, canonical validation, and matching optimistic revision.

Creation captures current normalized published content in both baseline and proposal JSON. Save modifies only private JSON/media/note/revision. Submit enters private `review`. A reviewer may request changes and hand the same change set back to the owner. Cancellation releases active media reservation and never changes public content.

## Editor-authored extension

Migration `0011_editor_change_set_origins` lets editor/admin users create an origin-backed private draft from:

```text
current live recipe
historical recipe_revision_snapshots entry
proposal JSON of an approved change set
baseline JSON of an approved change set
```

The current live recipe always becomes the new baseline. Historical content becomes only proposed JSON. Immutable origin metadata records source identity/content revision and whether historical media required a safe fallback.

An origin-backed `draft` is editor-controlled. Contributor UI is read-only and contributor API writes return `403`. Editor submission enters the same independent review queue. If changes are requested, contributor control opens through the existing owner correction workflow.

Editors can select only eligible media already owned by the recipe contributor. They cannot upload on behalf of the owner. A historical proposal may fall back to current eligible owner media; otherwise it may be saved without media but cannot be submitted.

See [`EDITOR_RECIPE_CHANGE_SETS.md`](EDITOR_RECIPE_CHANGE_SETS.md).

## Media reservation and privacy

A proposed image must:

- belong to the recipe owner;
- be uploaded for `recipe_hero`;
- be pending or approved while drafting;
- have a ready current `recipe-images-v1` derivative job and complete required variants;
- not belong to another recipe;
- not be reserved by another active change set.

Cross-table D1 triggers prevent existing recipe code from assigning media reserved by another active change set. Media deletion also refuses assigned or reserved assets. Private previews use derivative-only `private, no-store` delivery; original R2 bytes remain unavailable.

## Editorial review

Routes:

- `/admin/recipe-change-sets` — review queue and proposal launcher;
- `/admin/recipe-change-sets/:id` — baseline/proposal comparison and audit history;
- `/admin/recipes/:id/change-set` — editor current/historical private workspace;
- `POST /api/recipes/:id/editor-change-set` — editor create/restore/save/submit/cancel;
- `POST /api/recipe-change-sets/:id/editorial` — shared request-changes/approve/cancel operations.

Editorial mutations require verified editor/admin session, same-origin, purpose/session CSRF, matching optimistic revision, and private no-store responses. The review detail compares baseline and proposed scalars, categories, ingredients, directions, media, notes, live/base revisions, origin, and audit history.

## Atomic approval and promotion

Approval requires `review` and revalidates:

- canonical proposed JSON;
- live status remains `published`;
- exact base recipe and content revisions;
- category existence;
- proposed media owner, upload, approval, checksum, policy, and required variants;
- no conflicting media assignment/reservation.

One D1 batch:

1. conditionally acquires a unique `revision_write_token` while replacing live scalar/media fields;
2. increments live `revision` and `content_revision` while keeping status `published`;
3. clears obsolete scheduling state;
4. guardedly replaces categories;
5. guardedly replaces ingredients;
6. guardedly replaces directions;
7. marks the change set `approved` and records resulting revision;
8. writes an immutable approval event;
9. clears the temporary token.

Every relational delete/insert requires the same token. A stale/concurrent request cannot partially remove normalized content. D1 batch failure rolls back the complete operation. Contributor- and editor-authored proposals share this exact approval service.

## Audit and health

`recipe_change_set_events` records create, save, submit, request changes, cancel, and approve actions with actor, statuses, revisions, reason, and timestamp. `recipe_change_set_origins` records immutable editor source metadata.

`/api/health` reports non-secret capabilities for live-row isolation, one-active guard, private snapshots, optimistic/base guards, media reservation, approval revalidation, atomic promotion, audit events, editor-authored proposals, historical restoration, immutable origins, contributor draft-lock, media fallback, and shared approval.

The guarded authentication workflow refuses recipe-write activation if any capability is missing.

## Acceptance matrix

1. Anonymous/private-route access fails appropriately.
2. Non-editor editor-authored operations fail.
3. Invalid origin or CSRF fails.
4. Only the recipe owner can author contributor proposals.
5. Editor proposal uses current live content as exact baseline.
6. Historical source affects only private proposal JSON.
7. Concurrent creation produces at most one active change set.
8. Contributor cannot modify an editor-controlled draft.
9. Editor cannot modify a contributor-controlled draft.
10. Invalid proposed content/category/media creates no partial state.
11. Stale change-set or live base revisions return conflict.
12. Foreign/deleted/rejected/quarantined/assigned/reserved media is rejected.
13. Historical media fallback is recorded or submission remains blocked.
14. Save changes only private state.
15. Submission remains absent from public output.
16. Requested changes transfer editing control to the contributor.
17. Approval is blocked by pending media or incomplete/stale derivatives.
18. Successful approval keeps `published`, increments live revisions, and atomically replaces normalized content.
19. Failed statements cannot partially replace categories/ingredients/directions.
20. Cancellation releases active uniqueness/reservation and leaves public content unchanged.
21. Disabling recipe submissions closes all writes while preserving rows/history/public reads.

## Rollback and conflicts

Redeploy checked-in false flags or run guarded activation with `enable_recipe_submissions=false`. This closes create/restore/save/submit/review/approve/cancel operations without deleting stored rows, origins, or events.

A stale-base proposal is intentionally not auto-merged. It should be cancelled and recreated from the latest published version. Rich three-way conflict comparison/merge assistance remains a future phase and must not weaken optimistic rejection.
