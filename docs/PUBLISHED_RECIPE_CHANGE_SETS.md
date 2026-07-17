# Private Change Sets for Published Recipes

Published-recipe revisions are implemented for the guarded D1 deployment but remain disabled in checked-in configuration.

```jsonc
"RECIPE_SUBMISSIONS_ENABLED": "false"
```

The public D1-free application is unchanged. No real change set was created, submitted, reviewed, promoted, or deployed by this implementation phase.

## Safety objective

A contributor must never edit a live `published` recipe row in place. A proposed update is stored in a separate private change set. Public recipe reads continue to use the existing normalized published row until an editor approves the full proposal and one guarded D1 batch completes.

```text
published live recipe
  └─ private change set: draft
       → review
       → changes_requested → review
       → approved and atomically promoted
       → or cancelled
```

A failed validation, stale base, concurrent update, media change, derivative change, or failed D1 statement leaves the live recipe unchanged.

## Migration `0010_published_recipe_change_sets`

The migration adds:

- `recipe_change_sets`
- `recipe_change_set_events`
- one-active-change-set-per-recipe partial uniqueness
- active media reservation uniqueness
- contributor and editorial queue indexes
- published-owner triggers
- cross-table recipe/change-set media reservation triggers

Each change set stores:

- recipe and owner identity;
- creator identity;
- status and optimistic change-set revision;
- exact base recipe and content revisions;
- optional resulting recipe revision;
- proposed media asset;
- private baseline JSON;
- private proposed JSON;
- contributor and editorial notes;
- submit, review, promotion, cancellation, create, and update timestamps.

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

Contributor routes:

- `/account/submissions`
- `/account/submissions/:id/change-set`
- `POST /api/recipes/:id/change-set`

The API supports:

```text
create
save
submit
cancel
```

Every mutation requires:

- verified active session;
- ownership of the published recipe;
- same-origin request;
- purpose-bound `recipe-published-change-set` CSRF;
- current session CSRF;
- JSON and body-size checks;
- rate limiting;
- canonical `RecipeDraft` validation where content is supplied;
- matching optimistic change-set revision.

### Create

Creation reads the current normalized published recipe and stores the same complete draft in both `base_content_json` and `content_json`. It captures exact `base_recipe_revision` and `base_content_revision` values.

Creation does not update:

- the live recipe row;
- live categories;
- live ingredients;
- live directions;
- public media references;
- publication timestamps.

### Save

A save updates only private change-set JSON, media reservation, contributor note, and change-set revision. The server rechecks that the live recipe is still published and still has the captured base revisions.

### Submit and requested changes

Submission moves `draft` or `changes_requested` to private `review`. Editors can return it to `changes_requested` with a reason of at least ten characters. The contributor then edits and resubmits the same active change set.

### Cancellation

The contributor may cancel an active change set. Cancellation releases its active media reservation and never changes the live recipe.

## Media reservation and privacy

A proposed image must:

- belong to the recipe owner;
- be uploaded;
- have purpose `recipe_hero`;
- be pending or approved while drafting;
- have a current ready `recipe-images-v1` derivative job;
- have all required variants ready;
- not belong to another recipe;
- not be reserved by another active change set.

Cross-table D1 triggers prevent existing submission/revision code from assigning media that another active change set reserves. The media delete route also refuses deletion while an asset is assigned to a recipe or reserved by an active change set.

Private proposed-image previews use the existing derivative-only media route with `private, no-store`. Original R2 bytes remain unavailable through public or preview delivery.

## Editorial workflow

Editorial routes:

- `/admin/recipe-change-sets`
- `/admin/recipe-change-sets/:id`
- `POST /api/recipe-change-sets/:id/editorial`

Actions:

```text
request_changes
approve
cancel
```

Every editorial mutation requires:

- verified active session;
- `editor` or `admin` role;
- same-origin request;
- purpose-bound `recipe-change-set-editorial` CSRF;
- current session CSRF;
- matching optimistic change-set revision.

The detail page compares private baseline and proposed scalar fields, categories, ingredients, directions, media, contributor note, base/live revisions, and audit history.

## Atomic approval and promotion

Approval requires the change set to remain in `review`. Before building the batch, the server revalidates:

- proposed JSON through the canonical draft validator;
- live status remains `published`;
- live recipe revision equals `base_recipe_revision`;
- live content revision equals `base_content_revision`;
- all category slugs exist;
- proposed media belongs to the contributor;
- proposed media is uploaded and approved;
- media source checksum is current;
- derivative policy is `recipe-images-v1`;
- required JPEG/WebP variants are ready;
- media is not assigned or reserved elsewhere.

The final D1 batch:

1. conditionally acquires a unique `revision_write_token` while replacing live scalar fields and media;
2. increments live `revision` and `content_revision` while keeping status `published`;
3. clears any old publication schedule;
4. guardedly deletes and reinserts categories;
5. guardedly deletes and reinserts ingredients;
6. guardedly deletes and reinserts directions;
7. conditionally marks the change set `approved` and records the resulting recipe revision;
8. writes an immutable approval event;
9. clears the temporary write token.

Every relational delete and insert requires the same token. A stale or concurrent request cannot partially delete normalized content. D1 batch failure rolls back the complete operation.

## Audit events

`recipe_change_set_events` records:

```text
create
save
submit
request_changes
cancel
approve
```

Events include actor, previous/next status, change-set revision, base recipe revision, optional resulting recipe revision, reason, and timestamp.

Private JSON is not exposed through public recipe queries or public APIs.

## Health and activation checks

`/api/health` reports non-secret booleans for:

- live published row isolation;
- one active change set per recipe;
- private baseline/proposed snapshots;
- optimistic change-set revisions;
- base recipe/content revision guard;
- media reservation;
- approval-time media and derivative revalidation;
- atomic relational promotion;
- immutable audit events.

The guarded authentication workflow refuses recipe-write activation if any of these capabilities is missing.

## Test matrix

1. Anonymous create/save/submit/cancel returns 401.
2. Invalid origin or either CSRF value returns 403.
3. Another contributor cannot create or open a change set for the recipe.
4. A non-published recipe cannot receive an active published change set.
5. Concurrent creation produces at most one active change set.
6. Creation stores private baseline/proposed JSON and leaves the live recipe unchanged.
7. Invalid proposed content returns 422 and leaves both live and private server content unchanged.
8. A stale change-set revision returns 409.
9. A changed live recipe revision/content revision returns 409.
10. Unknown categories are rejected.
11. Foreign, deleted, rejected, quarantined, assigned, or separately reserved media is rejected.
12. Media reserved by an active change set cannot be deleted or assigned to another recipe.
13. Private save changes only change-set state.
14. Submission enters private `review` and remains absent from public recipe output.
15. Request changes requires an adequate reason and returns the same change set to the owner.
16. Approval is blocked while proposed media is pending or derivatives are incomplete.
17. Approval with a stale live base returns conflict without changing live rows.
18. A concurrent media moderation/source/checksum/derivative change returns conflict.
19. Successful approval increments live recipe/content revisions and replaces all normalized content atomically.
20. Successful approval keeps recipe status `published` and clears old scheduling state.
21. A failed statement cannot partially delete categories, ingredients, or directions.
22. Cancellation releases active uniqueness/reservation and leaves public content unchanged.
23. Private pages and APIs return `private, no-store`; robots do not index account/admin/API paths.
24. Disabling recipe submissions closes all change-set writes while preserving stored history and published reads.

## Rollback and conflicts

Disable recipe writes by rerunning the guarded authentication workflow with `enable_recipe_submissions=false`, or restore the checked-in fail-closed D1 configuration. This closes create/save/submit/review/approve/cancel operations without deleting stored rows or audit events.

A stale-base change set is intentionally not auto-merged. It should be cancelled and recreated from the latest published version. Automatic three-way merge, editor-authored changes, and restoring historical snapshots into a new change set remain future phases.
