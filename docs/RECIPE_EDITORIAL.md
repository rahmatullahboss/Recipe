# Guarded Recipe Submission, Revision, and Editorial Publishing

Recipe submission, requested changes, contributor resubmission, and publication are implemented for the D1 deployment but remain disabled in checked-in configuration.

```jsonc
"RECIPE_SUBMISSIONS_ENABLED": "false"
```

The D1-free public application and browser-local new-recipe editor continue to work without this feature.

## Activation dependencies

Recipe submissions and revisions become ready only when authentication, D1, R2 media storage, moderated uploads, migrations `0006_recipe_editorial` and `0007_recipe_revisions`, and `RECIPE_SUBMISSIONS_ENABLED=true` are all ready.

The guarded **Enable Authentication** workflow rejects recipe submissions when moderated media uploads are not also enabled.

## Initial submission transaction

The contributor editor first runs the canonical Worker draft validator. The protected submission API then requires a verified active session, same-origin metadata, purpose-bound signed CSRF, the current session CSRF value, JSON under 100 KB, and the per-account submission limit.

The server verifies every category slug in D1. It also verifies that the attached asset belongs to the contributor, is an uploaded `recipe_hero`, is pending or approved, and is not already attached to another recipe.

The recipe row, category relations, ingredients, and directions are committed through one `D1Database.batch()` transaction. Ingredient and direction rows use bounded multi-row statements to remain below D1 parameter limits. Any failed statement aborts the complete submission.

A successful submission enters private status `review`. Existing public queries expose only `published` recipes.

## Status meanings

```text
review     waiting for an editor
 draft      changes requested; editable only by the owning contributor
published  available through public D1 recipe queries
archived   closed and not public
```

The `draft` status in this workflow is not a public or shared draft. It is created only when an editor returns a submitted recipe to its owner with a required change reason.

## Requested changes

Only `editor` and `admin` accounts can request changes. The protected editorial endpoint requires same-origin metadata, the `recipe-editorial` CSRF purpose, the current session CSRF value, a matching optimistic lock revision, and a reason of at least ten characters.

A successful request transitions `review → draft`, increments the lock revision, stores the editor and reason, records `change_requested_at`, and creates a trigger-backed editorial event.

The contributor sees the reason at `/account/submissions` and can open `/account/submissions/:id/edit`. The edit query requires both matching ownership and status `draft`; another user, a review recipe, a published recipe, or an archived recipe cannot open the contributor editor.

## Contributor revision editor

The revision editor is separate from the browser-local new-recipe draft. It loads the current relational recipe from D1, autosaves unsent changes under a recipe-specific browser key, and supports an eligible existing hero image or a new private upload.

Rejected, quarantined, deleted, or otherwise unavailable media is not restored into the editable draft. The contributor must attach a new uploaded `recipe_hero` before resubmitting.

The resubmission API requires:

- verified active ownership
- status `draft`
- a matching expected lock revision
- same-origin metadata
- purpose-bound `recipe-resubmit` CSRF
- the current session CSRF value
- canonical recipe validation
- contributor rate limiting
- valid D1 categories
- owned pending or approved hero media not assigned to another recipe

## Atomic relational replacement

Migration `0007_recipe_revisions` adds a temporary unique `revision_write_token`. Resubmission first conditionally acquires that token while matching recipe ID, owner, status, and expected revision.

Every category, ingredient, direction, and snapshot statement is guarded by the same token. If a stale browser tab fails to acquire it, the later delete and insert statements become no-ops. The batch result then returns a conflict instead of partially replacing content.

A successful batch:

1. updates the recipe and moves `draft → review`
2. increments the optimistic lock revision
3. increments `content_revision`
4. backfills the previous content snapshot when it is not already present
5. replaces categories, ingredients, and directions
6. writes the new immutable revision snapshot
7. clears the temporary write token

Any failed statement rolls back the complete D1 batch.

## Revision snapshots

`recipe_revision_snapshots` stores contributor-owned validated draft JSON, content revision number, source, and timestamp. Snapshot JSON is limited to 100 KB.

The current recipe row represents content revision 1 after initial submission. When the first revision cycle is resubmitted, the transaction writes the baseline content snapshot and the new revision snapshot together. Later resubmissions preserve every previous snapshot and append the next content revision.

The optimistic `revision` and `content_revision` are intentionally separate:

- `revision` changes on status or content transitions and prevents stale writes.
- `content_revision` changes only when contributor content is replaced.

## Separate media and recipe approval

Media moderation and recipe review are separate decisions. A pending hero image may enter the private recipe queue, but publication requires:

```text
upload_status = uploaded
moderation_status = approved
```

Editors inspect media at `/admin/media` and recipes at `/admin/recipes`.

## Editorial publication and archival

Publishing requires status `review`, a matching optimistic revision, at least two ingredients, at least two directions, at least one category, and an approved uploaded hero image.

The final conditional D1 update checks approved media again inside the write condition. A changed recipe revision or changed media status causes a conflict instead of publishing stale content.

Archiving a review submission requires a clear editorial reason.

## Audit history

Migration `0006_recipe_editorial` adds `recipe_editorial_events` plus D1 triggers for the initial review submission and every real status transition. Events record the actor, previous status, next status, reason, lock revision, and timestamp.

Migration `0007_recipe_revisions` adds content snapshots and revision timestamps without exposing private draft JSON through public recipe queries.

## Private routes

- `/account/submissions` — contributor-owned status and change reasons
- `/account/submissions/:id/edit` — owner-only requested-change editor
- `/admin/recipes` — editor/admin review queue
- `/admin/recipes/:id` — detailed private review and decisions
- `/api/recipes/submissions` — protected first submission
- `/api/recipes/:id/resubmit` — protected contributor revision replacement
- `/api/recipes/:id/editorial` — protected publish, request-changes, or archive transition

Middleware applies `private, no-store` to these routes. Robots rules disallow account, admin, and API paths.

## Health and rollback

`/api/health` exposes non-secret recipe-submission readiness plus capability booleans for contributor revisions, requested changes, immutable snapshots, and optimistic locking. When intentionally activated, both `recipeSubmissions.enabled` and `recipeSubmissions.ready` must be true.

Running **Enable D1 and Deploy** closes authentication and every trusted write surface while preserving D1 rows, snapshots, and audit history. To close only recipe submissions and revisions, rerun **Enable Authentication** with `enable_recipe_submissions=false`.

## Test matrix

1. Anonymous submission or resubmission returns 401.
2. Invalid origin or CSRF returns 403.
3. Invalid drafts and unknown categories create no partial rows.
4. Another contributor's recipe or media cannot be edited or attached.
5. Rejected, quarantined, deleted, or reused media cannot be attached.
6. A valid submission enters the private review queue and remains absent from public search.
7. Request changes without a detailed reason returns 422.
8. A request changes transition creates status `draft` and one editorial event.
9. Only the owning contributor can open the revision editor.
10. A stale expected revision returns 409 and leaves relational rows unchanged.
11. A successful resubmission stores baseline and revised snapshots, increments content revision, and returns to `review`.
12. Publication is blocked while media is pending.
13. Approved media and complete content allow publication.
14. A concurrent media change returns 409 rather than publishing.
15. Archive without a clear reason returns 422.
16. A published recipe becomes available through the existing D1 public queries.

## Current boundary

This phase does not support collaborative editing, scheduled publishing, contributor edits to published recipes, editorial edits on behalf of contributors, archive restoration, snapshot restore, or merge/conflict resolution beyond optimistic rejection. Those remain separate future phases.
