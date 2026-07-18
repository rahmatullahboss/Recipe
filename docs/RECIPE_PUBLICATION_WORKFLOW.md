# Guarded Recipe Publication Workflow

Scheduled publication and archive restoration are implemented for the D1 deployment but remain disabled with the existing checked-in trusted-write flags.

```jsonc
"AUTH_ENABLED": "false",
"AUTH_REGISTRATION_ENABLED": "false",
"MEDIA_UPLOADS_ENABLED": "false",
"RECIPE_SUBMISSIONS_ENABLED": "false"
```

No deployment, D1 activation, account provisioning, real recipe publication, real archive restoration, or production change occurred while implementing this phase.

## Migration `0009_recipe_publication_workflow`

The ninth authoritative migration adds:

- `recipes.scheduled_publish_at`;
- `recipes.scheduled_by`;
- `recipes.schedule_revision`;
- `recipes.archived_at`;
- `recipes.restored_at`;
- indexes for due schedules and archived operations;
- `recipe_publication_events` for schedule, cancellation, immediate publication, scheduled publication, archive, and restore audit events.

The schema is additive. Public recipe queries remain restricted to `status='published'`.

## Schedule model

A scheduled recipe remains private in `review`. Scheduling never changes the public status by itself.

An active schedule requires:

```text
status = review
scheduled_publish_at is not null
schedule_revision = revision
```

Scheduling increments the optimistic recipe revision and stores the resulting revision in `schedule_revision`. Any later recipe status/content transition changes `revision`, which automatically makes the old schedule stale and ineligible for processing.

Schedule time is normalized to UTC SQL timestamp format. It must be at least five minutes and no more than one year in the future.

## Publication gates

Immediate and due scheduled publication both recheck:

- recipe status is still `review`;
- expected optimistic revision still matches;
- at least two ingredients exist;
- at least two directions exist;
- at least one category exists;
- attached media is uploaded and approved;
- the current `recipe-images-v1` derivative job matches the source checksum;
- every required JPEG/WebP derivative is ready.

The final conditional D1 update contains these checks again. A stale recipe, changed media status, changed checksum, incomplete derivative matrix, or schedule mismatch returns conflict instead of publishing.

## Manual due processor

Route:

```text
POST /api/recipes/scheduled/process
```

The processor requires:

- verified active session;
- editor/admin role;
- same-origin request;
- purpose-bound `recipe-schedule-process` CSRF token;
- current session CSRF;
- limit between 1 and 25;
- complete guarded recipe pipeline readiness.

It processes due recipes in deterministic timestamp/ID order. Each recipe is promoted through its own atomic D1 batch and may independently succeed or be skipped. Re-running the processor is idempotent because successful rows clear the schedule and increment revision.

Automatic cron execution is intentionally not configured. The health endpoint reports:

```text
automaticScheduleCronConfigured = false
```

## Editorial actions

The protected recipe editorial route supports:

- `publish` — immediate guarded publication;
- `schedule` — save or replace a future UTC schedule;
- `cancel_schedule` — cancel the current active schedule;
- `request_changes` — return the recipe to its contributor;
- `archive` — archive a review recipe and clear any schedule;
- `restore` — return an archived recipe to private `review`.

Every action uses the current optimistic revision. Schedule, cancel, publish, archive, and restore also write a `recipe_publication_events` record in the same D1 batch as the recipe update.

## Archive restoration

Restoration never republishes directly.

```text
archived → review
```

It requires an editor/admin reason of at least five characters, increments revision, clears schedule fields and temporary relational write tokens, records restoration time, and returns the recipe to the private editorial queue. Publication gates must be satisfied again before publish or schedule.

## Admin routes and UI

- `/admin/recipes` displays the review queue, active schedules, archived recipes, and a guarded manual due-processing control.
- `/admin/recipes/:id` supports immediate publication, schedule/replace, schedule cancellation, request changes, archive, and restore-to-review.
- Publication workflow history is shown separately from general status-transition history.

Every page and API response remains private/no-store and noindex where applicable.

## Health diagnostics

`/api/health` reports non-secret capabilities:

- scheduled publishing;
- guarded manual processor;
- archive restoration;
- schedule revision guard;
- media/derivative revalidation;
- atomic promotion;
- automatic cron not configured.

These booleans describe code capability only. They do not enable trusted writes.

## Test matrix

1. Anonymous editorial and processor requests return 401.
2. Non-editor roles return 403.
3. Cross-origin or invalid CSRF requests return 403.
4. Invalid schedule dates return 422.
5. A schedule less than five minutes away or more than one year away returns 422.
6. A stale expected revision returns 409 without changing schedule state.
7. Pending/rejected/quarantined media cannot be scheduled or published.
8. A stale derivative policy/source checksum cannot be scheduled or published.
9. Scheduling increments revision and sets `schedule_revision` to the resulting revision.
10. Replacing a schedule creates another audit event and a new revision.
11. Contributor resubmission or requested changes invalidates an old schedule through revision mismatch.
12. Cancel schedule clears all schedule fields and increments revision.
13. The due processor ignores future, stale, archived, draft, and already published rows.
14. Two concurrent processors cannot publish the same revision twice.
15. A media moderation/checksum change immediately before due processing causes skip/conflict.
16. Successful due publication clears schedule fields, increments revision, records both editorial and publication events, and becomes public only through existing `published` reads.
17. Archive clears active schedule fields and records an archive event.
18. Restore without a reason returns 422.
19. Restore returns only to private `review`, never directly to public status.
20. Disabling `RECIPE_SUBMISSIONS_ENABLED` closes all publication workflow writes while preserving schedules, audit events, archived rows, and published reads.

## Rollback

The safest rollback is to redeploy checked-in configuration with all trusted-write flags false. This closes immediate publication, schedule changes, due processing, archive, restore, submissions, and revisions without deleting D1 data.

Existing published recipes remain available through published-only reads. Existing schedule metadata remains stored but cannot be processed while the recipe feature is disabled.

To abandon an individual schedule after reactivation, use `cancel_schedule`. To recover an archived item, use `restore` and complete editorial review again.

Migration `0009` is additive and should not be manually removed from an already migrated D1 database. Roll back application behavior, not schema history.

## Current boundaries

- No automatic Cron Trigger or queue consumer is configured.
- No contributor edit workflow for already published recipes is implemented yet.
- No editor-authored content editing interface is implemented yet.
- No scheduled unpublish, embargo, timezone preference, or recurring schedule exists.
- No real runtime acceptance has been performed in Cloudflare production or staging.
