# Guarded Recipe Submission, Revision, and Editorial Publishing

Recipe submission, requested changes, contributor resubmission, immediate publication, scheduled publication, archival, archive restoration, and private contributor change sets for published recipes are implemented for the D1 deployment but remain disabled in checked-in configuration.

```jsonc
"RECIPE_SUBMISSIONS_ENABLED": "false"
```

The D1-free public application and browser-local new-recipe editor continue to work without these trusted-write features.

## Capability status

| Capability | Code status | Activation status |
| --- | --- | --- |
| Initial contributor submission | Complete | Disabled |
| Private editor/admin review | Complete | Disabled |
| Approved-media/derivative-gated publication | Complete | Disabled |
| Editor-requested corrections before first publication | Complete | Disabled |
| Owner-only correction editor | Complete | Disabled |
| Race-safe resubmission | Complete | Disabled |
| Immutable initial/resubmission snapshots | Complete | Disabled |
| Future UTC publication schedule | Complete | Disabled |
| Schedule replace/cancellation | Complete | Disabled |
| Guarded manual due processor | Complete | Disabled |
| Archive restoration to review | Complete | Disabled |
| Contributor private update to published recipe | Complete | Disabled |
| Atomic published change-set promotion | Complete | Disabled |
| Editor-authored content change set | Not implemented | Not available |
| Snapshot restore into a new change set | Not implemented | Not available |
| Automatic Cron/queue processor | Not configured | Not available |

## Activation dependencies

Recipe writes become ready only when authentication, D1, private R2, Cloudflare Images, moderated derivative-capable uploads, migrations through `0010_published_recipe_change_sets`, and `RECIPE_SUBMISSIONS_ENABLED=true` are ready.

The guarded activation workflow rejects recipe activation without media uploads and verifies publication, scheduling, archive restoration, published-row isolation, change-set base guards, media reservations, derivative revalidation, atomic promotion, and audit capabilities. Checked-in flags remain false.

## Initial submission

The protected submission endpoint requires:

- verified active session;
- same-origin request;
- purpose-bound `recipe-submit` CSRF;
- current session CSRF;
- body-size and rate limits;
- canonical recipe validation;
- valid D1 categories;
- contributor-owned uploaded `recipe_hero`;
- pending or approved media with complete mandatory privacy-safe derivatives;
- media not assigned to another recipe or reserved by another active change set.

The recipe and normalized category/ingredient/direction rows are committed through one D1 batch. Successful submissions enter private `review`. Public D1 reads remain `published`-only.

## Requested changes before first publication

```text
review
  → editor requests changes
  → draft (owner-only correction state)
  → contributor resubmits
  → review
```

Requested changes require editor/admin role, current optimistic revision, same-origin/CSRF protection, and a reason of at least ten characters.

The owner-only editor loads current normalized content and eligible media. Resubmission requires ownership, `draft` status, expected revision, validation, valid categories, and owned ready media.

A unique temporary `revision_write_token` guards every relational delete and insert. A stale browser cannot partially replace normalized content.

## Revision and snapshot model

- `revision` changes for content or workflow transitions and prevents stale writes.
- `content_revision` changes only when normalized contributor content is replaced.
- `recipe_revision_snapshots` stores immutable validated JSON for initial submission and correction resubmission.
- `recipe_change_sets` stores a private baseline and proposed copy for updates after publication.
- Private snapshots and change-set JSON are never exposed by public recipe reads.

## Media and publication gates

Immediate and scheduled first publication require:

```text
status = review
expected revision matches
at least 2 ingredients
at least 2 directions
at least 1 category
media upload_status = uploaded
media moderation_status = approved
current derivative policy = recipe-images-v1
mandatory JPEG/WebP derivative matrix = ready
source checksum matches the derivative job
```

The final D1 update repeats these conditions. Concurrent content, status, media, checksum, or derivative changes return conflict instead of publishing stale content.

## Scheduled publication

Migration `0009_recipe_publication_workflow` adds schedule and audit fields.

A scheduled recipe remains private in `review`. An active schedule requires:

```text
scheduled_publish_at is not null
schedule_revision = revision
```

Scheduling or replacing a schedule increments revision and stores the resulting revision in `schedule_revision`. Later contributor/editor changes invalidate the old schedule automatically through revision mismatch.

Schedule input is normalized to UTC, at least five minutes in the future, and no more than one year ahead.

### Due processor

```text
POST /api/recipes/scheduled/process
```

The processor requires editor/admin role, verified session, same-origin request, `recipe-schedule-process` CSRF, session CSRF, and a bounded limit of 1–25.

It selects only due rows whose schedule revision still matches. Each recipe is promoted through an independent atomic D1 batch. Success clears schedule fields and increments revision. Re-running is idempotent.

Automatic Cron Trigger execution is intentionally not configured.

## Archive and restoration

Archiving is allowed only from `review`, requires a clear reason, increments revision, records `archived_at`, and clears any active schedule.

Restoration is:

```text
archived → review
```

It requires editor/admin role, expected revision, and a reason of at least five characters. Restoration clears schedule state and temporary relational write tokens, records `restored_at`, and returns the recipe to private review. It never republishes directly.

## Private updates after publication

Migration `0010_published_recipe_change_sets` separates proposed changes from the live normalized recipe.

```text
published recipe stays public and unchanged
  └─ private change set: draft
       → review
       → changes_requested → review
       → approved and atomically promoted
       → or cancelled
```

### Contributor guarantees

Only the owning contributor can create or edit an active change set for their published recipe. D1 permits at most one active change set per recipe.

Contributor create/save/submit/cancel requires:

- verified active session;
- published recipe ownership;
- same-origin request;
- `recipe-published-change-set` signed CSRF;
- current session CSRF;
- rate/body limits;
- canonical validation for supplied content;
- matching change-set revision;
- exact captured live `revision` and `content_revision`;
- valid categories;
- eligible owned media with ready derivatives and no conflicting assignment/reservation.

Creation stores complete private `base_content_json` and `content_json`. Saving and submitting modify only the change set. The public recipe, normalized categories, ingredients, directions, media reference, and publication timestamps remain unchanged.

### Editorial guarantees

Editors review at:

- `/admin/recipe-change-sets`
- `/admin/recipe-change-sets/:id`

The detail page compares baseline and proposed fields, categories, ingredients, directions, media, contributor note, revision state, and audit history.

Editorial actions require editor/admin role, same-origin request, `recipe-change-set-editorial` CSRF, current session CSRF, and expected change-set revision.

### Atomic promotion

Approval rechecks:

- change-set status and revision;
- live recipe remains `published`;
- live recipe/content revisions still equal the captured base;
- canonical proposed JSON;
- categories exist;
- proposed media belongs to the contributor;
- media is uploaded and approved;
- source checksum and `recipe-images-v1` job match;
- all mandatory derivatives are ready;
- media is not assigned or reserved elsewhere.

The D1 batch conditionally acquires `revision_write_token`, updates scalar/media fields while keeping status `published`, increments recipe/content revisions, clears scheduling, guardedly replaces all normalized relations, marks the change set approved, writes its resulting recipe revision and an audit event, then clears the token.

If the first guarded update does not acquire the token, all guarded relational changes are no-ops. If any statement fails, D1 rolls back the complete batch. A stale proposal cannot partially alter public content.

See [`PUBLISHED_RECIPE_CHANGE_SETS.md`](PUBLISHED_RECIPE_CHANGE_SETS.md).

## Audit history

- `recipe_editorial_events` records first-submission status transitions.
- `recipe_revision_snapshots` records immutable pre-publication contributor revisions.
- `recipe_publication_events` records schedule, cancellation, immediate publication, scheduled publication, archive, and restore actions.
- `recipe_change_set_events` records create, save, submit, requested changes, cancellation, and approval of private published updates.

## Private routes

- `/account/submissions`
- `/account/submissions/:id/edit`
- `/account/submissions/:id/change-set`
- `/admin/recipes`, `/admin/recipes/:id`
- `/admin/recipe-change-sets`, `/admin/recipe-change-sets/:id`
- `/api/recipes/submissions`
- `/api/recipes/:id/resubmit`
- `/api/recipes/:id/change-set`
- `/api/recipes/:id/editorial`
- `/api/recipes/scheduled/process`
- `/api/recipe-change-sets/:id/editorial`

Private pages and API responses use no-store/noindex protections where applicable.

## Health capabilities

`/api/health` reports:

- publication requires approved media;
- correction resubmissions and immutable snapshots;
- optimistic locking;
- scheduled publishing and guarded processor;
- archive restoration;
- schedule revision/media/atomic promotion gates;
- automatic schedule cron not configured;
- live published-row isolation during change-set editing/review;
- one active change set per recipe;
- private baseline/proposed snapshots;
- change-set optimistic/base guards;
- cross-table media reservation;
- approval-time media/derivative revalidation;
- atomic normalized promotion;
- immutable change-set audit events.

Health output does not enable features or expose private content.

## Test matrix

1. Anonymous recipe/change-set mutation returns 401.
2. Non-editor editorial/schedule/change-set decision returns 403.
3. Invalid origin or either CSRF value returns 403.
4. Invalid recipe content creates no partial normalized rows.
5. Another contributor's recipe or media cannot be edited, proposed, or attached.
6. Pending/rejected/quarantined media cannot be published or used for final change-set approval.
7. A stale recipe, schedule, or change-set revision returns 409.
8. Successful correction resubmission stores immutable snapshots and returns to review.
9. Invalid schedule date returns 422.
10. Scheduling increments revision and sets matching `schedule_revision`.
11. Later revision/status changes invalidate the old schedule.
12. Two concurrent processors cannot publish the same revision twice.
13. Archive clears a schedule and restore returns only to review.
14. Concurrent change-set creation produces at most one active row.
15. Change-set create/save/submit leaves live public rows unchanged.
16. Stale base recipe/content revision blocks save, request-changes transition, and approval.
17. Active change-set media cannot be assigned elsewhere or deleted.
18. Approval rechecks approved media, source checksum, policy, and mandatory derivatives.
19. Successful approval keeps status published, increments live revisions, and replaces all normalized content atomically.
20. A failed or stale approval cannot partially delete normalized rows.
21. Disabling recipe submissions closes all recipe/change-set writes without deleting rows, schedules, snapshots, events, or published reads.

## Rollback

Redeploying checked-in false flags closes submission, resubmission, editorial decisions, scheduling, due processing, archive/restore, and all change-set writes.

Existing approved media and published recipes remain publicly readable. Pending rows, schedules, snapshots, private change sets, normalized content, and audit events remain stored.

Migrations `0009` and `0010` are additive. Roll back application behavior rather than deleting applied schema history.

## Current boundaries

- Editor-authored private content change sets are not implemented.
- Restoring a historical snapshot into a new change set is not implemented.
- Automatic three-way merge is not implemented; stale bases fail closed.
- Automatic Cron/queue execution is not configured.
- Scheduled unpublish, embargo, recurring schedules, and user timezone preferences are not implemented.

See [`RECIPE_PUBLICATION_WORKFLOW.md`](RECIPE_PUBLICATION_WORKFLOW.md) and [`PUBLISHED_RECIPE_CHANGE_SETS.md`](PUBLISHED_RECIPE_CHANGE_SETS.md).
