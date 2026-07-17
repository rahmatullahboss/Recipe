# Guarded Recipe Submission and Editorial Publishing

Recipe submission and publication are implemented for the D1 deployment but remain disabled in checked-in configuration.

```jsonc
"RECIPE_SUBMISSIONS_ENABLED": "false"
```

The D1-free public application and browser-local editor continue to work without this feature.

## Activation dependencies

Recipe submissions become ready only when authentication, D1, R2 media storage, moderated uploads, migration `0006_recipe_editorial`, and `RECIPE_SUBMISSIONS_ENABLED=true` are all ready.

The guarded **Enable Authentication** workflow rejects recipe submissions when moderated media uploads are not also enabled.

## Submission transaction

The contributor editor first runs the canonical Worker draft validator. The protected submission API then requires a verified active session, same-origin metadata, purpose-bound signed CSRF, the current session CSRF value, JSON under 100 KB, and the per-account submission limit.

The server verifies every category slug in D1. It also verifies that the attached asset belongs to the contributor, is an uploaded `recipe_hero`, is pending or approved, and is not already attached to another recipe.

The recipe row, category relations, ingredients, and directions are committed through one `D1Database.batch()` transaction. Ingredient and direction rows use bounded multi-row statements to remain below D1 parameter limits. Any failed statement aborts the complete submission.

A successful submission enters private status `review`. Existing public queries expose only `published` recipes.

## Separate media and recipe approval

Media moderation and recipe review are separate decisions. A pending hero image may enter the private recipe queue, but publication requires:

```text
upload_status = uploaded
moderation_status = approved
```

Editors inspect media at `/admin/media` and recipes at `/admin/recipes`.

## Editorial publication

Only `editor` and `admin` accounts can use the editorial transition endpoint. It requires same-origin metadata, the `recipe-editorial` CSRF purpose, the current session CSRF value, a valid action, and the expected revision.

Publishing requires status `review`, a matching optimistic revision, at least two ingredients, at least two directions, at least one category, and an approved uploaded hero image.

The final conditional D1 update checks approved media again inside the write condition. A changed recipe revision or changed media status causes a conflict instead of publishing stale content.

Archiving a review submission requires a clear editorial reason.

## Audit history

Migration `0006_recipe_editorial` adds `recipe_editorial_events` plus D1 triggers for the initial review submission and every real status transition. Events record the actor, previous status, next status, reason, revision, and timestamp.

## Private routes

- `/account/submissions` — contributor-owned submission status
- `/admin/recipes` — editor/admin review queue
- `/admin/recipes/:id` — detailed private review
- `/api/recipes/submissions` — protected contributor submission
- `/api/recipes/:id/editorial` — protected editorial transition

Middleware applies `private, no-store` to these routes. Robots rules disallow account, admin, and API paths.

The current contributor status page is deliberately compact and returns only the signed-in contributor's own records. Requested-change and resubmission controls belong to the next editorial phase.

## Health and rollback

`/api/health` exposes non-secret recipe-submission readiness. When intentionally activated, both `recipeSubmissions.enabled` and `recipeSubmissions.ready` must be true. The guarded workflow verifies the requested flag against the deployed health response.

Running **Enable D1 and Deploy** closes authentication and every trusted write surface while preserving D1 rows and audit history. To close only recipe submissions, rerun **Enable Authentication** with `enable_recipe_submissions=false`.

## Test matrix

1. Anonymous submission returns 401.
2. Invalid origin or CSRF returns 403.
3. Invalid drafts and unknown categories create no partial rows.
4. Another contributor's media cannot be attached.
5. Rejected, quarantined, deleted, or reused media cannot be attached.
6. A valid submission enters the private review queue and remains absent from public search.
7. Publication is blocked while media is pending.
8. Approved media and complete content allow publication.
9. A stale revision or concurrent media change returns 409.
10. Archive without a clear reason returns 422.
11. A successful status transition creates one editorial event.
12. A published recipe becomes available through the existing D1 public queries.

## Current boundary

This phase supports first submission, publication, and archival from review. Contributor editing after submission, editor-requested changes, resubmission, scheduled publishing, published-recipe revisions, and archive restoration remain future phases.
