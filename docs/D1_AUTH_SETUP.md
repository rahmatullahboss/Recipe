# D1 Authentication and Trusted-Write Activation

The D1 account, private-media, recipe-submission, correction, publication, archive-restoration, contributor/editor private change-set, historical-restore, and private-rebase systems are implemented but disabled in checked-in configuration. The current public deployment remains D1-free.

Read [`PROJECT_HANDOFF.md`](PROJECT_HANDOFF.md) before changing activation procedures.

## Fail-closed defaults

```jsonc
"AUTH_ENABLED": "false",
"AUTH_REGISTRATION_ENABLED": "false",
"MEDIA_UPLOADS_ENABLED": "false",
"RECIPE_SUBMISSIONS_ENABLED": "false"
```

Enabling sign-in does not automatically enable registration, uploads, or recipe writes. Disabling recipe submissions closes initial submission, correction, publication, scheduling, archive/restore, contributor/editor change-set operations, historical restoration, conflict handoff, and private rebase while preserving stored rows and public published reads.

## Storage model

| Concern | Authority |
| --- | --- |
| Accounts, status, password records, consent, and audit | D1 |
| Sessions, CSRF, and lightweight rate-limit state | Workers KV |
| Original and derivative objects | Private R2 |
| Media ownership, moderation, checksums, derivative jobs, and reservations | D1 |
| Recipe rows, normalized relations, schedules, snapshots, private change sets, origins, rebases, and audit events | D1 |
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
migrations/d1/0011_editor_change_set_origins/migration.sql
migrations/d1/0012_recipe_change_set_rebases/migration.sql
```

Wrangler applies only the nested sequence selected by `migrations_pattern`. Root SQL files remain legacy references.

- `0009` adds scheduling, archive/restore, and publication history.
- `0010` adds isolated private baseline/proposal JSON, active/media constraints, cross-table reservation triggers, and change-set events.
- `0011` adds immutable editor origins, historical-source pointers, creator guards, and media-fallback recording.
- `0012` adds immutable before/live/after rebase snapshots, explicit resolution metadata, revision transitions, and a trigger requiring audit/private-state agreement.

## Controlled activation order

1. Keep all four trusted-write flags false.
2. Provision a controlled non-production D1, KV, private R2, and Images environment.
3. Apply all twelve migrations.
4. Verify D1 mode and bindings through `/api/health` while writes remain closed.
5. Configure approved authentication, bot-verification, and optional verification-delivery values.
6. Enable controlled sign-in first; keep registration, media, and recipe writes closed.
7. Provision controlled contributor/editor/admin accounts through an approved process.
8. Run the complete media derivative acceptance matrix.
9. Enable media uploads only in controlled runtime configuration.
10. Run initial submission, correction, scheduling, archive/restore, contributor/editor change-set, historical restore, private-rebase, concurrency, and rollback tests.
11. Enable recipe writes only after every gate passes.
12. Enable public registration separately and last, after legal and delivery approval.

The guarded workflows require exact manual confirmation. They validate the project, build the D1 Worker, deploy fail-closed configuration before migrations, apply migrations, create runner-only runtime files, verify health, and remove temporary files after success or failure.

## Recipe health requirements

`/api/health` reports non-secret capability booleans for:

- recipe pipeline readiness and approved-media publication;
- contributor correction, immutable snapshots, and optimistic locking;
- scheduled publishing, guarded processing, archive restoration, and schedule revision/media/atomic gates;
- automatic schedule cron reported as `false`;
- live published-row isolation and one active private change set per recipe;
- private baseline/proposed snapshots and exact base guards;
- proposed-media reservation and approval-time derivative revalidation;
- atomic normalized promotion and immutable change-set events;
- editor-authored proposals and historical restoration;
- immutable origins, contributor draft lock, current-live baseline, safe media fallback, and shared approval;
- three-way comparison;
- atomic category/ingredient/direction conflict units;
- explicit live/proposed conflict choices;
- private-only rebasing;
- immutable rebase audit;
- stale approval blocked;
- reviewer conflict handoff.

CI validates every listed field. The protected activation workflow currently verifies capabilities through editor/historical restoration. Its secret-bearing file was not rewritten in the conflict phase because the connector rejected the full replacement; this must be reviewed before any real activation.

## Publication and scheduling guarantees

A scheduled recipe remains private in `review`. Scheduling increments `revision` and stores the resulting value as `schedule_revision`. Due eligibility requires status `review`, due UTC time, and `schedule_revision = revision`.

Immediate and scheduled publication repeat complete content, approved media, checksum, policy, and mandatory derivative checks inside the final conditional D1 update. The manual processor is editor/admin-only, same-origin and purpose/session-CSRF protected, bounded, deterministic, and idempotent. Automatic Cron execution is not configured.

Archiving clears active schedule state. Restoration requires a reason and returns only to private `review`; it never republishes directly.

## Private published-recipe update guarantees

A proposed update is stored separately in `recipe_change_sets`; live scalar and normalized rows remain unchanged during draft, review, requested changes, cancellation, historical restoration, and private rebasing.

Contributor mutations require owner identity. Editor-authored mutations require editor/admin role and an immutable `recipe_change_set_origins` record. Both paths require same-origin, purpose/session CSRF, limits, canonical validation, exact base revisions, optimistic change-set revision, categories, and eligible owner media before review submission.

Historical restore uses current live content as the new baseline and selected historical content only as proposed JSON. Historical media is reused only when still eligible; otherwise current eligible owner media may be substituted and recorded, or submission remains blocked.

Contributor API/UI refuses writes to an origin-backed editor-controlled `draft`. After requested changes, the contributor controls correction of the same proposal.

Approval repeats live status/base, canonical JSON, categories, owner media approval/checksum/policy/required variants, and reservation checks. A unique `revision_write_token` guards scalar and normalized relational promotion in one D1 batch. Success keeps status `published`, increments recipe/content revisions, clears stale scheduling, approves the change set, and records history. Failure leaves live content unchanged.

See [`PUBLISHED_RECIPE_CHANGE_SETS.md`](PUBLISHED_RECIPE_CHANGE_SETS.md) and [`EDITOR_RECIPE_CHANGE_SETS.md`](EDITOR_RECIPE_CHANGE_SETS.md).

## Conflict and private-rebase guarantees

A stale proposal is compared against its stored baseline and the actual current normalized live recipe.

- Proposal-only changes are retained.
- Live-only changes use current live content.
- Equal live/proposed changes require no choice.
- Every true conflict requires explicit `live` or `proposed` selection.
- Categories are compared as a set.
- Categories, ingredients, and directions remain atomic units.
- Review proposals are read-only; reviewer request-changes performs only a private handoff.
- Only the current owner/editor controller can rebase a draft or requested-change proposal.
- Rebase repeats canonical content, category, owner-media, checksum, derivative, assignment, and reservation checks.
- One D1 batch updates only private base/proposal state and inserts immutable before/live/after audit snapshots.
- A trigger rejects an audit row that does not match the resulting private state.
- Rebase never approves or changes live content.
- Existing exact-base approval checks remain unchanged.

See [`RECIPE_CHANGE_SET_CONFLICTS.md`](RECIPE_CHANGE_SET_CONFLICTS.md).

## Security behavior

- Production sessions use a secure HTTP-only host cookie.
- CSRF tokens are signed, purpose-bound, and time-limited.
- Authentication and recipe-write routes are rate-limited where applicable.
- Login failures are generic and repeated failures trigger account lockout.
- Upload intents are one-time and store only token digests.
- Original media is never publicly served.
- Public derivatives require approved D1 state and complete current derivatives.
- Public recipe reads remain restricted to `published`.
- Relational replacement remains token guarded and atomic.
- Schedule, archive/restore, change-set, origin, and rebase transitions are revision guarded and audit recorded.
- Private JSON, origins, rebase snapshots, and previews remain no-store and unavailable through public queries.

## Acceptance matrix

1. Unverified accounts cannot create sessions.
2. Anonymous private recipe/change-set/editorial/processor/rebase requests return 401.
3. Non-editor scheduling, processing, editorial decisions, and editor-authored proposal writes return 403.
4. Invalid origin or CSRF returns 403.
5. Invalid media/content/history/resolution creates no partial authoritative state.
6. Pending/rejected/quarantined/stale-checksum/incomplete-derivative media cannot publish, rebase, or receive approval.
7. Stale recipe, schedule, change-set, or rebase revisions return conflict.
8. At most one active change set exists per recipe.
9. Active proposed media cannot be deleted or assigned elsewhere.
10. Contributor cannot alter an editor-controlled draft; editor cannot alter a contributor-controlled draft.
11. Historical restore leaves current live content unchanged and uses it as baseline.
12. Missing historical media triggers recorded safe fallback or blocked submission.
13. Stale review can be handed back without weakening approval checks.
14. Every true three-way conflict requires an explicit choice.
15. Collections remain atomic during rebase.
16. Successful rebase changes only private base/proposal state and writes immutable audit.
17. Failed audit insert rolls back the private update.
18. Successful approval atomically replaces scalar/normalized content while keeping status published.
19. Failed approval cannot partially delete normalized rows.
20. Disabling recipe writes closes all trusted operations without deleting schedules, snapshots, change sets, origins, rebases, normalized rows, or audit history.

## Rollback

Redeploy checked-in false flags to close authentication, registration, uploads, submissions, corrections, publication, scheduling, processing, archive/restore, historical restoration, conflict handoff, private rebasing, and all change-set writes.

Existing approved derivative media and published recipes remain available through existing public gates. Pending rows, schedules, normalized content, snapshots, private change sets, origins, rebases, and audit history remain stored.

Migrations `0009` through `0012` are additive. Roll back application behavior rather than deleting applied schema history.

No deployment, D1 activation, account provisioning, real content operation, or production change was performed while updating this guide.
