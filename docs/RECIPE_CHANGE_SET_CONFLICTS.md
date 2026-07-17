# Three-Way Conflict Assistance for Published Recipe Change Sets

Three-way comparison and audited private rebasing are implemented for the guarded D1 deployment but remain disabled in checked-in configuration.

```jsonc
"RECIPE_SUBMISSIONS_ENABLED": "false"
```

No real proposal was rebased and no live recipe, account, media object, deployment, or production environment was changed while implementing this phase.

## Safety objective

A stale private change set must never be approved, silently overwritten, or automatically merged into public content.

The conflict system compares three complete canonical recipe versions:

```text
stored baseline
current live published recipe
private proposed recipe
```

The output is assistance for a private rebase only. It never approves, publishes, or mutates the live recipe.

## Migration `0012_recipe_change_set_rebases`

The migration adds immutable `recipe_change_set_rebases` records containing:

- change-set, recipe, and actor identity;
- fixed strategy version `recipe-three-way-v1`;
- previous and resulting change-set revisions;
- previous and resulting base recipe/content revisions;
- proposal-only, live-only, same-change, and conflict counts;
- explicit conflict-resolution JSON;
- previous stored baseline JSON;
- current live JSON used for the rebase;
- previous private proposal JSON;
- resulting private proposal JSON;
- creation timestamp.

D1 rejects updates to rebase records. A second trigger requires each inserted audit row to match the resulting private `recipe_change_sets` state created by the same transaction.

## Comparison units

The strategy compares these units:

- title;
- summary;
- description;
- hero media asset;
- market;
- language;
- measurement system;
- preparation time;
- cooking time;
- servings;
- difficulty;
- categories;
- ingredients;
- directions.

Categories are compared as a set. Category, ingredient, and direction collections are deliberately treated as atomic units. The implementation does not attempt unsafe element-level matching, list insertion inference, or automatic text merging.

## Classification

Each unit receives one state:

```text
unchanged
proposal_only
live_only
same_change
conflict
```

Safe private-rebase behavior is deterministic:

| State | Resulting private value |
| --- | --- |
| `unchanged` | Current live value |
| `proposal_only` | Private proposed value |
| `live_only` | Current live value |
| `same_change` | Current live value, which equals the proposal |
| `conflict` | Explicitly selected live or proposed value |

Every true conflict requires a user choice. There is no default winner for conflicting content.

## Controller boundary

A rebase is available only to the account that currently controls the private change set:

- the owner controls a contributor-created `draft`;
- the owner controls any `changes_requested` proposal;
- an editor/admin controls an origin-backed editor-authored `draft`;
- a proposal in `review` is read-only and cannot be rebased.

A reviewer may move a stale `review` proposal to `changes_requested` with an explanatory reason. This is a private status handoff only. It does not update the baseline, proposal, or live recipe.

## Guarded rebase route

```text
POST /api/recipe-change-sets/:id/rebase
```

The endpoint requires:

- verified active session;
- same-origin request;
- JSON content type and bounded body size;
- purpose-bound `recipe-change-set-rebase` CSRF;
- current session CSRF;
- rate limiting;
- matching optimistic change-set revision;
- current control of the private proposal;
- live recipe still `published`;
- live recipe/content revisions different from the stored base;
- explicit `live` or `proposed` choices only for real conflicts.

Responses are `private, no-store`.

## Final private-rebase validation

Before writing, the service repeats:

- canonical validation of stored baseline and proposal;
- reconstruction of the actual current normalized live recipe;
- category existence validation for the merged proposal;
- owner-only hero-media validation;
- uploaded `recipe_hero` purpose;
- pending or approved drafting state;
- current source checksum;
- ready `recipe-images-v1` derivative job;
- complete required variants;
- no other recipe assignment;
- no other active change-set reservation.

The resulting merged proposal is passed through the canonical `RecipeDraft` validator again.

## Atomic private write

One D1 batch:

1. conditionally updates the private change set only when its revision, old base, controller, status, and current live revisions still match;
2. replaces the private base revisions with current live revisions;
3. replaces private baseline JSON with the current live recipe;
4. stores the resolved private proposal JSON and media reservation;
5. increments the private change-set revision;
6. inserts the immutable rebase audit with all before/live/after snapshots.

The migration trigger confirms that the audit exactly matches the resulting private row. Any failure rolls back the entire batch.

The operation does not update:

- live recipe scalar fields;
- live categories;
- live ingredients;
- live directions;
- public media references;
- publication timestamps;
- recipe status.

## Approval remains separate

Rebasing never approves the proposal. After rebase, contributors or editors may continue the normal private workflow and submit for independent review.

Final approval still uses the existing exact-base, approved-owner-media, checksum, derivative-policy, required-variant, reservation, optimistic-lock, and `revision_write_token` guarded atomic promotion checks.

A stale proposal remains impossible to approve.

## Private surfaces

- `/account/change-sets/:id/conflicts` — owner/editor three-way report and controller-only rebase controls;
- `/admin/recipe-change-sets/:id` — editorial baseline/live/proposal overview and stale conflict handoff;
- `/account/submissions/:id/change-set` — contributor stale-state lock and conflict link;
- `/admin/recipe-change-sets` — review and active-proposal conflict links;
- `POST /api/recipe-change-sets/:id/rebase` — guarded private rebase.

All applicable pages are noindex and private routes receive `private, no-store`.

## Health diagnostics

`/api/health` reports non-secret booleans for:

- three-way comparison;
- atomic collection units;
- explicit conflict choices;
- private-only rebase;
- immutable rebase audit;
- stale approval blocked;
- reviewer conflict handoff.

These diagnostics are validated in CI. The existing protected activation workflow was not modified in this phase because the connector rejected a full workflow-file replacement containing protected deployment/secret context; existing activation checks remain unchanged through the editor/historical-restore capabilities.

## Acceptance matrix

1. Anonymous requests fail.
2. An unrelated contributor cannot view or rebase the proposal.
3. Invalid origin, purpose CSRF, or session CSRF fails.
4. Invalid or oversized JSON fails.
5. A proposal in `review` cannot be rebased.
6. A non-controller cannot rebase a `draft` or `changes_requested` proposal.
7. A live recipe that is no longer `published` blocks rebase.
8. A current-base proposal reports that no rebase is required.
9. Proposal-only changes are retained automatically.
10. Live-only changes are retained automatically.
11. Equal live/proposed changes do not require a choice.
12. Every true conflict requires live/proposed selection.
13. Choices for non-conflicting fields are rejected.
14. Categories are compared as a set.
15. Categories, ingredients, and directions remain atomic collections.
16. Unknown categories block rebase.
17. Missing, foreign, stale, assigned, reserved, or derivative-incomplete media blocks rebase.
18. A stale change-set revision returns conflict.
19. A concurrent live revision change returns conflict.
20. Successful rebase increments only the private change-set revision and base.
21. Successful rebase leaves all public recipe rows unchanged.
22. The immutable audit stores before/live/after snapshots and explicit choices.
23. A failed audit insert rolls back the private row update.
24. Approval remains blocked until a current-base proposal returns to review.
25. Disabling recipe writes closes conflict handoff and rebase writes without deleting audit history.

## Rollback

Redeploying checked-in false flags closes all conflict-resolution writes. Existing private proposals and immutable rebase audit records remain stored. Public published recipes continue through existing read gates.

Migration `0012` is additive. Roll back application behavior rather than deleting applied migration history.
