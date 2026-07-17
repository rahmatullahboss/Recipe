# Guarded Recipe Submission, Revision, and Editorial Publishing

Recipe submission, requested changes, contributor resubmission, immediate publication, scheduled publication, archival, and archive restoration are implemented for the D1 deployment but remain disabled in checked-in configuration.

```jsonc
"RECIPE_SUBMISSIONS_ENABLED": "false"
```

The D1-free public application and browser-local new-recipe editor continue to work without this feature.

## Capability status

| Capability | Code status | Activation status |
| --- | --- | --- |
| Initial contributor submission | Complete | Disabled |
| Private editor/admin review | Complete | Disabled |
| Approved-media/derivative-gated publication | Complete | Disabled |
| Editor-requested changes | Complete | Disabled |
| Owner-only correction editor | Complete | Disabled |
| Race-safe resubmission | Complete | Disabled |
| Immutable content snapshots | Complete | Disabled |
| Future UTC publication schedule | Complete | Disabled |
| Schedule replace/cancellation | Complete | Disabled |
| Guarded manual due processor | Complete | Disabled |
| Archive restoration to review | Complete | Disabled |
| Contributor revision of published recipe | Not implemented | Not available |
| Automatic Cron/queue processor | Not configured | Not available |

## Activation dependencies

Recipe writes become ready only when authentication, D1, private R2, Cloudflare Images, moderated derivative-capable uploads, migrations through `0009_recipe_publication_workflow`, and `RECIPE_SUBMISSIONS_ENABLED=true` are ready.

The guarded activation workflow rejects recipe activation without media uploads. Checked-in flags remain false.

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
- media not already assigned to another recipe.

The recipe and normalized category/ingredient/direction rows are committed through one D1 batch. Successful submissions enter private `review`. Public D1 reads remain `published`-only.

## Requested changes and contributor correction

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
- `content_revision` changes only when contributor content is replaced.
- `recipe_revision_snapshots` stores immutable validated JSON for initial submission and resubmission.
- Snapshot data remains private.

## Media and publication gates

Immediate and scheduled publication require:

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

## Audit history

- `recipe_editorial_events` records status transitions.
- `recipe_revision_snapshots` records immutable contributor content revisions.
- `recipe_publication_events` records schedule, cancellation, immediate publication, scheduled publication, archive, and restore actions with expected/resulting revisions.

## Private routes

- `/account/submissions`
- `/account/submissions/:id/edit`
- `/admin/recipes`
- `/admin/recipes/:id`
- `/api/recipes/submissions`
- `/api/recipes/:id/resubmit`
- `/api/recipes/:id/editorial`
- `/api/recipes/scheduled/process`

Private pages and API responses use no-store/noindex protections where applicable.

## Health capabilities

`/api/health` reports:

- publication requires approved media;
- contributor revisions;
- requested changes;
- immutable snapshots;
- optimistic locking;
- scheduled publishing;
- guarded manual schedule processor;
- archive restoration;
- schedule revision guard;
- scheduled media revalidation;
- atomic scheduled promotion;
- automatic schedule cron not configured.

Health output does not enable the feature or expose private content.

## Test matrix

1. Anonymous submission, resubmission, editorial action, or schedule processing returns 401.
2. Non-editor scheduling/processing returns 403.
3. Invalid origin or CSRF returns 403.
4. Invalid recipe content creates no partial normalized rows.
5. Another contributor's recipe or media cannot be edited or attached.
6. Pending/rejected/quarantined media cannot be published or scheduled.
7. A stale recipe revision returns 409.
8. Successful correction resubmission stores immutable snapshots and returns to review.
9. Invalid schedule date returns 422.
10. Scheduling increments revision and sets matching `schedule_revision`.
11. Later revision/status changes invalidate the old schedule.
12. Cancel schedule clears schedule fields and increments revision.
13. Two concurrent processors cannot publish the same revision twice.
14. Due processing rechecks content, media approval, checksum, policy, and required derivatives.
15. Archive clears a schedule and records audit history.
16. Restore without a reason returns 422.
17. Restore returns only to review.
18. Disabling recipe submissions closes all recipe workflow writes without deleting rows, schedules, snapshots, events, or published reads.

## Rollback

Redeploying checked-in false flags closes submission, resubmission, editorial decisions, scheduling, due processing, archive, and restore writes.

Existing approved media and published recipes remain publicly readable. Pending rows, schedules, snapshots, normalized content, and audit events remain stored.

Migration `0009` is additive. Roll back application behavior rather than deleting applied schema history.

## Current boundaries

- Published-recipe contributor change sets are not implemented.
- Editor-authored content editing is not implemented.
- Snapshot restore is not implemented.
- Automatic Cron/queue execution is not configured.
- Scheduled unpublish, embargo, recurring schedules, and user timezone preferences are not implemented.

See [`RECIPE_PUBLICATION_WORKFLOW.md`](RECIPE_PUBLICATION_WORKFLOW.md) for detailed scheduling and restoration design.
