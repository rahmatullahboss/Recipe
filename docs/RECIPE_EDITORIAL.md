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
