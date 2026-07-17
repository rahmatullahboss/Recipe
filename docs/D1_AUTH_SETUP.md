# D1 Authentication and Trusted-Write Activation

The D1 account, private-media, recipe-submission, correction, scheduled-publication, archive-restoration, and published-recipe private change-set systems are implemented but disabled in checked-in configuration. The current public deployment remains D1-free.

Read [`PROJECT_HANDOFF.md`](PROJECT_HANDOFF.md) before changing activation procedures.

## Fail-closed defaults

```jsonc
"AUTH_ENABLED": "false",
"AUTH_REGISTRATION_ENABLED": "false",
"MEDIA_UPLOADS_ENABLED": "false",
"RECIPE_SUBMISSIONS_ENABLED": "false"
```

Enabling sign-in does not automatically enable registration, uploads, or recipe writes. Disabling recipe submissions closes initial submission, requested changes, resubmission, immediate publication, scheduling, due processing, archive/restore, and published change-set create/save/submit/review/approval/cancellation while preserving stored rows and public published reads.

## Storage model

| Concern | Authority |
| --- | --- |
| Accounts, status, password records, consent, and audit | D1 |
| Sessions, CSRF, and lightweight rate-limit state | Workers KV |
| Original and derivative objects | Private R2 |
| Media ownership, moderation, checksums, derivative jobs, and reservations | D1 |
| Recipe rows, normalized relations, schedules, snapshots, private change sets, and audit events | D1 |
| Server-side image transformations | Cloudflare Images binding |
| Bot verification | Turnstile |
| Verification delivery | Authenticated HTTPS adapter |

Only verified active accounts can create sessions. D1 remains authoritative for account status and session revocation version.

## Authoritative migration chain

```text
migrations/d1/0001_initial/migration.sql
migrations/d1/0002_seed/migration.sql
migrations/d1/0003_market_coverage/migration.sql
migrations/d1/0004_auth_accounts/migration.sql
migrations/d1/0005_media_pipeline/migration.sql
migrations/d1/0006_recipe_editorial/migration.sql
migrations/d1/0007_recipe_revisions/migration.sql
migrations/d1/0008_media_derivatives/migration.sql
migrations/d1/0009_recipe_publication_workflow/migration.sql
migrations/d1/0010_published_recipe_change_sets/migration.sql
```

Wrangler applies only the nested sequence selected by `migrations_pattern`. Root-level SQL files are legacy references.

- `0009_recipe_publication_workflow` adds scheduling, archive/restore fields, indexes, and publication audit history.
- `0010_published_recipe_change_sets` adds isolated baseline/proposal JSON, one-active-change-set and media-reservation constraints, cross-table triggers, and change-set audit history.

## Controlled activation order

1. Keep all four trusted-write flags false.
2. Provision a controlled non-production D1, KV, private R2, and Images environment.
3. Apply all ten migrations.
4. Verify D1 mode and bindings through `/api/health` while writes remain closed.
5. Configure approved authentication, bot-verification, and optional verification-delivery values in the protected deployment environment.
6. Enable controlled sign-in first; keep registration, media, and recipe writes closed.
7. Provision controlled contributor/editor/admin accounts through an approved process.
8. Run the full media derivative acceptance matrix.
9. Enable media uploads only in controlled runtime configuration.
10. Run initial submission, requested correction, scheduling, archive/restore, private published change-set, concurrency, and rollback tests.
11. Enable recipe writes only after every gate passes.
12. Enable public registration separately and last, after legal and delivery approval.

The guarded workflows require exact manual confirmation. They validate the project, build the D1 Worker, deploy fail-closed configuration before migrations, apply migrations, create runner-only runtime files, verify health, and remove temporary files even after failure.

## Recipe activation health requirements

When recipe writes are intentionally enabled, health verification requires:

- recipe pipeline ready;
- approved media required for publication;
- requested changes, contributor corrections, immutable snapshots, and optimistic locking;
- scheduled publishing, guarded processor, archive restoration, schedule revision/media/atomic promotion gates;
- automatic schedule cron reported as `false`;
- live published-row isolation during change-set drafting/review;
- one active published change set per recipe;
- private baseline and proposed JSON snapshots;
- optimistic change-set and exact live base guards;
- active proposed-media reservation;
- approval-time media/checksum/derivative revalidation;
- atomic normalized live promotion;
- immutable change-set audit events.

The activation workflow fails closed when any required capability is absent or when automatic cron is unexpectedly enabled.

## Publication and scheduling guarantees

A scheduled recipe remains private in `review`. Scheduling increments `revision` and stores the resulting value as `schedule_revision`.

Due eligibility requires:

```text
status = review
scheduled_publish_at <= current UTC time
schedule_revision = revision
```

Immediate and scheduled publication repeat complete content, approved media, checksum, policy, and mandatory derivative checks inside the final conditional D1 update.

The manual processor is editor/admin-only, same-origin, purpose-CSRF protected, session-CSRF protected, bounded to 25 rows, deterministic, and idempotent. Automatic Cron execution is not configured.

Archiving clears active schedule state. Restoration requires a reason and returns only to private `review`; it never republishes directly.

## Published recipe change-set guarantees

A contributor update to a published recipe is stored separately in `recipe_change_sets`. The live row and normalized relations remain unchanged during create, save, submission, requested changes, and cancellation.

Contributor mutations require ownership, exact base recipe/content revisions, canonical validation, valid categories, eligible media, purpose/session CSRF, same origin, rate/body limits, and optimistic change-set revision.

Approval requires editor/admin role and repeats:

- live status `published`;
- exact captured base recipe/content revisions;
- canonical proposed JSON;
- valid categories;
- approved owned media;
- current source checksum and `recipe-images-v1` derivative job;
- complete mandatory variants;
- no conflicting media assignment or reservation.

A temporary `revision_write_token` guards scalar and normalized relational promotion in one D1 batch. Success keeps status `published`, increments recipe/content revisions, clears stale scheduling, marks the change set approved, and records resulting revisions. Stale or failed promotion leaves live content unchanged.

See [`PUBLISHED_RECIPE_CHANGE_SETS.md`](PUBLISHED_RECIPE_CHANGE_SETS.md).

## Security behavior

- Production sessions use a secure HTTP-only host cookie.
- CSRF tokens are signed, purpose-bound, and time-limited.
- Authentication and contributor write routes are rate-limited where applicable.
- Login failures are generic and repeated failures trigger account lockout.
- Media upload intents are one-time and store only token digests.
- Original media is never publicly served.
- Public derivative delivery requires approved D1 state and complete current derivatives.
- Public recipe reads remain restricted to `published`.
- Relational replacement remains token guarded and atomic.
- Schedule, archive/restore, and change-set transitions are optimistic-lock guarded and audit recorded.
- Private change-set JSON and previews remain no-store and unavailable through public recipe queries.

## Acceptance matrix

1. Unverified accounts cannot create sessions.
2. Anonymous recipe/change-set/editorial/processor requests return 401.
3. Non-editor scheduling, processing, and change-set editorial decisions return 403.
4. Invalid origin or either CSRF value returns 403.
5. Invalid media/content creates no partial authoritative state.
6. Pending, rejected, quarantined, stale-checksum, or incomplete-derivative media cannot publish or receive final change-set approval.
7. Stale recipe, schedule, or change-set revisions return 409.
8. Scheduling and archive/restore preserve their revision/audit guarantees.
9. Change-set create/save/submit leaves the live published recipe unchanged.
10. At most one active change set exists per recipe.
11. Active proposed media cannot be deleted or assigned elsewhere.
12. A changed live base blocks save/request-changes/approval.
13. Successful approval replaces scalar and normalized content atomically while keeping status published.
14. Failed approval cannot partially delete normalized rows.
15. Disabling recipe writes closes all trusted recipe/change-set operations without deleting schedules, snapshots, change sets, normalized rows, or audit history.

See [`RECIPE_EDITORIAL.md`](RECIPE_EDITORIAL.md), [`RECIPE_PUBLICATION_WORKFLOW.md`](RECIPE_PUBLICATION_WORKFLOW.md), and [`PUBLISHED_RECIPE_CHANGE_SETS.md`](PUBLISHED_RECIPE_CHANGE_SETS.md).

## Rollback

Redeploy checked-in false flags to close authentication, registration, uploads, submissions, corrections, publication, scheduling, processing, archive/restore, and all change-set writes.

Existing approved derivative media and published recipes remain available through their existing public gates. Pending rows, schedules, normalized content, snapshots, private change sets, and audit history remain stored.

Migrations `0009` and `0010` are additive. Roll back application behavior rather than deleting applied schema history.

No deployment, D1 activation, account provisioning, real content operation, or production change was performed while updating this guide.
