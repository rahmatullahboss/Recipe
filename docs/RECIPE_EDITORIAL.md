# Guarded Recipe Submission, Revision, and Editorial Publishing

Recipe submission, requested changes, contributor resubmission, publication, and archival are implemented for the D1 deployment but remain disabled in checked-in configuration.

```jsonc
"RECIPE_SUBMISSIONS_ENABLED": "false"
```

The D1-free public application and browser-local new-recipe editor continue to work without this feature. Read [`PROJECT_HANDOFF.md`](PROJECT_HANDOFF.md) for the complete project status and continuation prompt.

## Implementation status

| Capability | Code status | Activation status |
| --- | --- | --- |
| Initial contributor submission | Complete | Disabled |
| Private editor/admin review | Complete | Disabled |
| Media-gated publication | Complete | Disabled |
| Editorial archive | Complete | Disabled |
| Editor-requested changes | Complete | Disabled |
| Owner-only revision editor | Complete | Disabled |
| Race-safe resubmission | Complete | Disabled |
| Immutable content snapshots | Complete | Disabled |
| Published-recipe revisioning | Not implemented | Not available |
| Scheduled publishing and archive restore | Not implemented | Not available |

## Activation dependencies

Recipe submissions and revisions become ready only when authentication, D1, private R2 storage, the Cloudflare Images binding, moderated derivative-capable uploads, migrations through `0008_media_derivatives`, and `RECIPE_SUBMISSIONS_ENABLED=true` are all ready.

The guarded **Enable Authentication** workflow rejects recipe activation when moderated media uploads are not also enabled. Deployment verification checks recipe readiness plus optimistic locking, requested changes, contributor revisions, and immutable snapshots.

## Initial submission transaction

The contributor editor first runs the canonical Worker draft validator. The protected submission API then requires:

- a verified active session;
- same-origin metadata;
- purpose-bound `recipe-submit` signed CSRF;
- current session CSRF;
- `application/json` under 100 KB;
- per-account submission rate limiting;
- canonical recipe validation.

The server verifies every category slug in D1. It also verifies that the attached asset:

- belongs to the contributor;
- is uploaded;
- has purpose `recipe_hero`;
- is pending or approved;
- is not already attached to another recipe.

The recipe row, category relations, ingredients, and directions are committed through one `D1Database.batch()` transaction. Ingredient and direction rows use bounded multi-row statements to stay below D1 parameter limits. A failed statement aborts the complete submission.

A successful submission enters private `review`. Public D1 recipe queries expose only `published`.

## Status meanings

```text
review     waiting for an editor
draft      changes requested; editable only by the owning contributor
published  available through public D1 recipe queries
archived   closed and not public
```

`draft` in this workflow is not a public, collaborative, or general-purpose server draft. It is created only when an editor returns a submitted recipe to its owner with a required reason.

## Requested changes

Only `editor` and `admin` accounts can request changes. The protected editorial endpoint requires:

- editor/admin role;
- same-origin metadata;
- `recipe-editorial` signed CSRF;
- current session CSRF;
- matching optimistic lock revision;
- a reason of at least 10 characters.

A successful request:

1. transitions `review → draft`;
2. increments the optimistic lock revision;
3. stores the editor and reason;
4. records `change_requested_at`;
5. clears any stale revision write token;
6. creates a trigger-backed editorial event.

The contributor sees the reason at `/account/submissions` and can open `/account/submissions/:id/edit`. The edit query requires matching ownership and status `draft`. Another user, a recipe still in review, a published recipe, or an archived recipe cannot open the contributor editor.

## Contributor revision editor

The revision editor is separate from the browser-local new-recipe draft. It:

- loads the current normalized recipe from D1;
- displays the editor's requested-change reason;
- restores current categories, ingredients, directions, timing, language, measurements, and media where eligible;
- autosaves unsent changes under a recipe-specific browser key;
- supports an eligible existing hero image or a new private upload;
- displays lock/content revision information;
- validates through the canonical Worker validator before resubmission.

Rejected, quarantined, deleted, or otherwise unavailable media is not restored as eligible submission media. The contributor must attach a new uploaded `recipe_hero` before resubmitting.

## Protected resubmission

`POST /api/recipes/:id/resubmit` requires:

- verified active contributor session;
- matching recipe ownership;
- status `draft`;
- matching expected optimistic lock revision;
- same-origin metadata;
- purpose-bound `recipe-resubmit` signed CSRF;
- current session CSRF;
- JSON/body-size checks;
- canonical recipe validation;
- contributor rate limiting;
- valid D1 categories;
- owned pending or approved hero media not assigned to another recipe.

Invalid content returns 422, unauthorized ownership/status returns 403, and stale revision conflicts return 409.

## Atomic relational replacement

Migration `0007_recipe_revisions` adds a temporary unique `revision_write_token`.

Resubmission first performs a conditional update matching recipe ID, owner, `draft` status, and expected revision. A successful match acquires a unique token and updates the recipe into its next review/content state.

Every later category, ingredient, direction, snapshot, and cleanup statement is guarded by the same token. If a stale tab fails to acquire it, guarded deletes and inserts become no-ops and the operation returns conflict rather than partially replacing content.

A successful D1 batch:

1. updates the recipe and moves `draft → review`;
2. increments `revision`;
3. increments `content_revision`;
4. records `submitted_at` and `resubmitted_at`;
5. backfills the previous content snapshot if it is not already present;
6. replaces categories;
7. replaces ingredients;
8. replaces directions;
9. writes the new immutable snapshot;
10. clears the temporary write token.

Any failed statement rolls back the complete batch.

## Revision snapshots

`recipe_revision_snapshots` stores:

- recipe ID;
- content revision number;
- contributor/author ID;
- source (`initial_submission` or `resubmission`);
- validated draft JSON;
- timestamp.

Snapshot JSON is limited to 100 KB.

The current normalized recipe row begins as content revision 1. During the first successful correction resubmission, the transaction writes the baseline content snapshot and the revised content snapshot together. Later resubmissions preserve previous snapshots and append the next content revision.

The counters are intentionally separate:

- `revision` changes on status or content transitions and prevents stale writes.
- `content_revision` changes only when contributor content is replaced.

Snapshots are private and are not exposed by public recipe queries.

## Separate media and recipe approval

Media moderation and recipe review are separate decisions. A pending hero image with private derivatives may enter private recipe review, but publication requires:

```text
upload_status = uploaded
moderation_status = approved
current derivative policy = recipe-images-v1
mandatory JPEG/WebP derivative matrix = ready
```

Media approval itself is blocked until the current-policy required matrix is ready. Editors inspect media at `/admin/media` and recipes at `/admin/recipes`. Neither private originals nor unapproved derivatives are exposed through public recipe reads.

## Publication and archival

Publishing requires:

- status `review`;
- matching optimistic revision;
- at least two ingredients;
- at least two directions;
- at least one category;
- attached uploaded and approved hero media;
- a ready current-policy derivative job with every mandatory JPEG/WebP variant.

The final conditional D1 update rechecks media approval, source checksum, derivative policy, and complete required-variant counts. A concurrent recipe revision, source replacement, derivative cleanup, or media moderation change returns conflict instead of publishing stale content.

Archiving a review submission requires a clear editorial reason. Archived recipes are not public and cannot be edited by the contributor revision endpoint.

## Audit history

Migration `0006_recipe_editorial` adds `recipe_editorial_events` and D1 triggers for:

- initial review submission;
- every real status transition.

Events record actor, previous status, next status, reason, lock revision, and timestamp.

Migration `0007_recipe_revisions` adds content revision/snapshot history without exposing private draft JSON publicly.

## Private routes

- `/account/submissions` — contributor-owned status, revisions, and change reasons
- `/account/submissions/:id/edit` — owner-only requested-change editor
- `/admin/recipes` — editor/admin review queue
- `/admin/recipes/:id` — detailed private review and decisions
- `/api/recipes/submissions` — protected first submission
- `/api/recipes/:id/resubmit` — protected contributor replacement transaction
- `/api/recipes/:id/editorial` — protected publish, request-changes, or archive transition

Middleware applies `private, no-store` to these routes. Robots rules disallow account, admin, API, and editor paths.

## Health and guarded workflow

`/api/health` exposes non-secret recipe readiness and these capability booleans:

- publication requires approved media and a complete current-policy mandatory derivative matrix;
- privacy-safe derivative readiness and private-original denial;
- optimistic locking;
- requested changes;
- contributor revisions;
- immutable snapshots.

The guarded workflow verifies these capabilities when recipe submissions are intentionally requested. It refuses recipe activation without media uploads.

## Rollback

Running **Enable D1 and Deploy** restores checked-in false trusted-write flags while preserving D1 rows, snapshots, and audit history.

To close only recipe submissions and revisions, rerun **Enable Authentication** with `enable_recipe_submissions=false`.

This closes:

- first submission;
- requested changes;
- contributor resubmission;
- publication;
- archival transitions.

It preserves approved media delivery, published recipe reads, normalized rows, private snapshots, and audit history.

## Test matrix

1. Anonymous first submission or resubmission returns 401.
2. Invalid origin or CSRF returns 403.
3. Invalid drafts and unknown categories create no partial rows.
4. Another contributor's recipe or media cannot be edited or attached.
5. Rejected, quarantined, deleted, or reused media cannot be attached.
6. A valid first submission enters private `review` and remains absent from public search.
7. Publication is blocked while media is pending.
8. Request changes without a detailed reason returns 422.
9. Valid request changes creates `review → draft` and one editorial event.
10. Only the owning contributor can open the revision editor.
11. A stale expected revision returns 409 and leaves normalized rows unchanged.
12. Successful resubmission stores baseline/revised snapshots, increments content revision, and returns to `review`.
13. Approved media and complete content allow publication.
14. Concurrent media or recipe changes return 409 instead of publishing stale content.
15. Archive without a clear reason returns 422.
16. Disabling recipe submissions closes all recipe trusted writes without deleting stored history.

## Validation baseline

The last verified implementation head before documentation synchronization was:

```text
7ea198c57407f44dc130eb6c6936b8fb255ae91a
```

GitHub Actions CI run `#290` passed project validation, operational scripts, Cloudflare type generation, and the Astro Worker build. Documentation commits may move the branch; always re-read PR `#1` before continuing.

## Current boundary

This phase does not support:

- collaborative editing;
- contributor edits to published recipes;
- editorial editing on behalf of contributors;
- scheduled publishing;
- archive restoration;
- restoring a prior snapshot into an active draft;
- merge/conflict resolution beyond optimistic rejection.

The recommended next phase is privacy-safe image derivatives as specified in [`MEDIA_PIPELINE.md`](MEDIA_PIPELINE.md).
