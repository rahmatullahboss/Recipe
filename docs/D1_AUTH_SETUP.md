# D1 Authentication and Trusted-Write Activation

The D1 account, private-media, recipe-submission, revision, scheduled-publication, and archive-restoration systems are implemented but disabled in checked-in configuration. The current public deployment remains D1-free.

Read [`PROJECT_HANDOFF.md`](PROJECT_HANDOFF.md) before changing activation procedures.

## Fail-closed defaults

```jsonc
"AUTH_ENABLED": "false",
"AUTH_REGISTRATION_ENABLED": "false",
"MEDIA_UPLOADS_ENABLED": "false",
"RECIPE_SUBMISSIONS_ENABLED": "false"
```

Enabling sign-in does not automatically enable registration, uploads, or recipe writes. Disabling recipe submissions closes submission, requested changes, resubmission, immediate publication, scheduling, due processing, archive, and restore writes while preserving stored rows and public published reads.

## Storage model

| Concern | Authority |
| --- | --- |
| Accounts, status, password records, consent, and audit | D1 |
| Sessions, CSRF, and lightweight rate-limit state | Workers KV |
| Original and derivative objects | Private R2 |
| Media ownership, moderation, checksums, and derivative jobs | D1 |
| Recipe rows, normalized relations, schedules, snapshots, and audit events | D1 |
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
```

Wrangler applies only the nested sequence selected by `migrations_pattern`. Root-level SQL files are legacy references.

Migration `0009_recipe_publication_workflow` adds schedule time/owner/revision fields, archive/restore timestamps, due/archived indexes, and publication workflow audit events.

## Controlled activation order

1. Keep all four trusted-write flags false.
2. Provision a controlled non-production D1, KV, private R2, and Images environment.
3. Apply all nine migrations.
4. Verify D1 mode and bindings through `/api/health` while writes remain closed.
5. Configure approved authentication, bot-verification, and optional verification-delivery values in the protected deployment environment.
6. Enable controlled sign-in first; keep registration, media, and recipe writes closed.
7. Provision controlled contributor/editor/admin accounts through an approved process.
8. Run the full media derivative acceptance matrix.
9. Enable media uploads only in controlled runtime configuration.
10. Run submission, requested-change, resubmission, publication, schedule, archive/restore, and rollback tests.
11. Enable recipe submissions only after every gate passes.
12. Enable public registration separately and last, after legal and delivery approval.

The guarded workflows require exact manual confirmation. They validate the project, build the D1 Worker, deploy fail-closed configuration before migrations, apply migrations, create runner-only runtime files, verify health, and remove temporary files even after failure.

## Recipe activation health requirements

When recipe submissions are intentionally enabled, health verification requires:

- recipe pipeline ready;
- approved media required for publication;
- requested changes and contributor revisions available;
- immutable snapshots and optimistic locking available;
- scheduled publishing available;
- guarded manual schedule processor available;
- archive restoration available;
- schedule revision guard available;
- scheduled media/derivative revalidation available;
- scheduled atomic promotion available;
- automatic schedule cron reported as `false` until a separately reviewed automation phase exists.

The activation workflow now fails closed when any of these capabilities is absent or when automatic cron is unexpectedly enabled.

## Publication and scheduling guarantees

A scheduled recipe remains private in `review`. Scheduling increments `revision` and stores the resulting value as `schedule_revision`.

Due eligibility requires:

```text
status = review
scheduled_publish_at <= current UTC time
schedule_revision = revision
```

Immediate and scheduled publication repeat these checks inside the final conditional D1 update:

- current recipe revision;
- complete ingredient, direction, and category relations;
- uploaded and approved hero media;
- matching source checksum and derivative policy;
- complete required JPEG/WebP derivative matrix.

The manual processor is editor/admin-only, same-origin, purpose-CSRF protected, session-CSRF protected, bounded to 25 rows, deterministic, and idempotent. Automatic Cron execution is not configured.

Archiving clears active schedule state. Restoration requires a reason and returns only to private `review`; it never republishes directly.

## Security behavior

- Production sessions use a secure HTTP-only host cookie.
- CSRF tokens are signed, purpose-bound, and time-limited.
- Authentication and contributor write routes are rate-limited where applicable.
- Login failures are generic and repeated failures trigger account lockout.
- Media upload intents are one-time and store only token digests.
- Original media is never publicly served.
- Public derivative delivery requires approved D1 state and complete current derivatives.
- Public recipe reads remain restricted to `published`.
- Relational contributor replacement remains atomic and revision guarded.
- Schedule mutations, due promotion, archive, and restore are revision guarded and audit recorded.

## Acceptance matrix

1. Unverified accounts cannot create sessions.
2. Anonymous recipe/editorial/processor requests return 401.
3. Non-editor scheduling and processing return 403.
4. Invalid origin or CSRF returns 403.
5. Invalid media/content creates no partial authoritative state.
6. Pending, rejected, quarantined, stale-checksum, or incomplete-derivative media cannot publish or schedule.
7. Stale recipe revisions return 409.
8. Scheduling increments revision and records the matching schedule revision.
9. Later content/status changes invalidate an old schedule.
10. Cancel schedule clears schedule fields and records an event.
11. Concurrent processors cannot publish one revision twice.
12. Due processing repeats content/media/derivative gates.
13. Archive clears schedule state.
14. Restore without a reason fails and successful restore returns only to review.
15. Disabling recipe submissions closes all recipe writes without deleting schedules, snapshots, normalized rows, or audit history.

See [`RECIPE_EDITORIAL.md`](RECIPE_EDITORIAL.md) and [`RECIPE_PUBLICATION_WORKFLOW.md`](RECIPE_PUBLICATION_WORKFLOW.md) for the detailed matrices.

## Rollback

Redeploy checked-in false flags to close authentication, registration, uploads, submissions, revisions, publication, scheduling, processing, archive, and restore writes.

Existing approved derivative media and published recipes remain available through their existing public gates. Pending rows, schedules, normalized content, snapshots, and audit history remain stored.

Migration `0009` is additive. Roll back application behavior rather than deleting applied schema history.

No deployment, D1 activation, account provisioning, real content operation, or production change was performed while updating this guide.
