# Editor-Authored Private Recipe Change Sets

Editor-authored updates and historical recipe restoration are implemented for the guarded D1 deployment but remain disabled in checked-in configuration.

```jsonc
"RECIPE_SUBMISSIONS_ENABLED": "false"
```

No live recipe, media, account, or production environment was changed while implementing this phase.

## Safety objective

Editors never mutate a live `published` recipe while drafting. The current normalized published recipe is captured as the private baseline. A separate proposal is stored in the existing `recipe_change_sets` workflow and reaches public content only through the existing guarded atomic approval operation.

```text
current published recipe remains unchanged
  └─ editor-controlled private draft
       → independent review
       → approved through shared atomic promotion
       → changes_requested and handed to contributor
       → or cancelled
```

A stale base, invalid snapshot, missing owner media, concurrent proposal, failed validation, or failed D1 statement leaves the public recipe unchanged.

## Migration `0011_editor_change_set_origins`

The migration adds immutable origin metadata in `recipe_change_set_origins`.

Supported source types:

```text
editor_current
revision_snapshot
approved_change_set_proposed
approved_change_set_baseline
```

Each origin records:

- the editor-authored change-set ID;
- source type;
- optional historical snapshot or approved change-set audit pointer;
- historical content revision when known;
- whether historical media required a safe fallback;
- editor/admin creator and creation time.

D1 triggers require an editor/admin creator, require origin creator identity to match `recipe_change_sets.created_by`, and reject origin updates. Source IDs are immutable audit pointers rather than cascading foreign keys, avoiding cyclic deletion dependencies with historical change sets.

## Editorial surfaces

- `/admin/recipe-change-sets` — review queue plus published-recipe proposal launcher;
- `/admin/recipes/:id/change-set` — current-live or historical-source private workspace;
- `POST /api/recipes/:id/editor-change-set` — guarded create, restore, save, submit, and cancel operations;
- `/admin/recipe-change-sets/:id` — existing baseline-versus-proposal review and shared approval route.

All pages are `noindex`; private routes and responses are `private, no-store`.

## Current-live proposal

The editor may create a private proposal from the current live recipe. Creation:

1. verifies editor/admin role and complete recipe-pipeline readiness;
2. reads the current normalized published recipe;
3. serializes that exact content into both `base_content_json` and `content_json`;
4. captures exact live `revision` and `content_revision`;
5. creates an immutable `editor_current` origin;
6. records the existing change-set `create` audit event;
7. leaves all live recipe and normalized rows unchanged.

Only one active change set remains possible per recipe.

## Historical restoration

Historical content may come from:

- `recipe_revision_snapshots` created by initial submission or contributor resubmission;
- the proposed JSON of an already approved published-recipe change set;
- the baseline JSON captured before an already approved change set.

The current live recipe always remains the new baseline. The selected historical JSON becomes only the private proposal. This means restoration is a normal reviewed update rather than an immediate rollback.

The service revalidates historical JSON through the current canonical `RecipeDraft` validator and verifies every category slug before creating the proposal.

## Media handling

Editors cannot upload media on behalf of a contributor. They may select only media that:

- belongs to the published recipe owner;
- is uploaded for `recipe_hero`;
- is pending or approved while drafting;
- has a ready current `recipe-images-v1` derivative job;
- has all required variants ready;
- is not assigned to another recipe;
- is not reserved by another active change set.

If historical content references media that is no longer eligible, the service attempts to use the current live eligible owner media. The origin records `media_fallback_applied=1`. If no eligible owner media exists, the private draft may still be created and saved with no media, but review submission is blocked.

## Contributor control boundary

An origin-backed change set in `draft` is editor-controlled.

- Contributor save, submit, cancel, media upload, and local-edit controls are disabled.
- The contributor API independently returns `403` for attempted writes.
- The owner receives a read-only private proposal view.

After the editor submits the proposal, it enters the existing independent review queue. If a reviewer requests changes, status becomes `changes_requested`; the contributor then controls the existing owner editor and may revise/resubmit the same private proposal.

## Save and submission

Editor save/submit requires:

- verified editor/admin session;
- same-origin request;
- purpose-bound `recipe-editor-authored-change-set` CSRF;
- current session CSRF;
- body and rate limits;
- canonical recipe validation;
- valid categories;
- matching change-set optimistic revision;
- exact current live recipe/content base revisions;
- origin-backed editor-controlled `draft` state;
- eligible owner media before submission.

Saving modifies only private proposal JSON, media reservation, note, timestamp, revision, and audit history. Submission moves the proposal to `review` and uses the existing review UI and approval service.

## Shared approval guarantees

Editor-authored and contributor-authored proposals use the same approval implementation. Final approval repeats:

- live status is still `published`;
- exact base recipe/content revisions;
- canonical proposed content and categories;
- owner media uploaded and approved;
- current checksum and `recipe-images-v1` derivative policy;
- complete required JPEG/WebP variants;
- no conflicting media assignment or reservation.

One D1 batch conditionally updates live scalar/media fields, increments recipe/content revisions, guardedly replaces categories/ingredients/directions with a unique `revision_write_token`, approves the change set, records audit history, and clears the token. Any failure rolls back the complete operation.

## Health and activation

`/api/health` reports non-secret capability booleans for:

- editor-authored published change sets;
- historical snapshot restoration;
- immutable origin audit;
- contributor lock on editor-controlled drafts;
- current-live baseline capture;
- safe historical-media fallback;
- shared atomic approval.

The guarded activation workflow fails closed if any capability is missing when recipe writes are requested.

## Acceptance matrix

1. Anonymous or non-editor editorial API requests fail.
2. Invalid origin, purpose CSRF, or session CSRF fails.
3. A non-published recipe cannot receive an editor-authored published change set.
4. A second active proposal cannot be created for the same recipe.
5. Current-live creation produces equal baseline and proposal JSON without changing live rows.
6. A valid historical snapshot becomes only proposed JSON; current live content remains baseline.
7. Invalid or missing historical source returns an error and creates no partial rows.
8. Historical media conflict triggers current-live owner-media fallback or a null private draft.
9. An editor cannot select media owned by another user.
10. A contributor cannot write or cancel an editor-controlled draft.
11. An editor cannot alter a contributor-controlled draft through the editor API.
12. Save with a stale change-set revision returns conflict.
13. Save or submit after live base revision changes returns conflict.
14. Submission without eligible owner media fails.
15. Submitted editor proposal enters the standard independent review queue.
16. Requested changes hand editing control to the contributor.
17. Approval uses the same atomic media/content promotion gates.
18. Disabling recipe submissions closes all writes without deleting private drafts, origins, or history.

## Rollback

Redeploying checked-in false flags closes editor proposal creation, restoration, save, submit, cancellation, and approval writes. Existing private rows and audit history remain stored; public published recipes continue through existing read gates.

Migration `0011` is additive. Roll back application behavior rather than deleting applied migration history.
