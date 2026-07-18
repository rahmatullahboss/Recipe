# Privacy-safe media derivative test matrix

This matrix is the activation gate for `recipe-images-v1`. It is documentation only until the guarded account/media workflow is intentionally executed. No real user media is required; use synthetic fixtures containing no personal data.

## Required fixture set

| Fixture | Purpose |
| --- | --- |
| JPEG orientation 1 | Baseline dimensions and metadata removal |
| JPEG orientations 2–8 | Mirror/rotation normalization and normalized width/height |
| JPEG with EXIF GPS, camera serial, XMP, ICC, IPTC and comment blocks | Privacy metadata removal |
| PNG with `eXIf`, text and ICC chunks | PNG metadata removal and conversion |
| WebP with EXIF, XMP and ICC chunks | WebP metadata removal and conversion |
| Transparent PNG | JPEG white-background fallback and WebP/AVIF transparency behavior |
| Minimum accepted image | Post-orientation 320 × 240 boundary |
| Oversized dimensions/pixels | 12,000-side and 40 MP rejection |
| Invalid signatures and MIME mismatches | Upload validation denial |
| Animated WebP | `anim: false` output behavior |

## Upload and normalization

| Case | Expected result |
| --- | --- |
| Valid JPEG/PNG/WebP below 8 MiB | Private original stored with `private, no-store`; D1 asset and pending job committed atomically |
| MIME declaration differs from signature | `422`; no media asset or public object |
| Dimensions become valid only before EXIF rotation, but invalid after rotation | Rejected using normalized dimensions |
| Orientation 5–8 | Normalized dimensions are swapped and generated pixels display upright |
| Source checksum or R2 ETag mismatch during generation | Job fails closed; no approval/public delivery |
| Duplicate upload token | Only one claim succeeds |

## Derivative outputs

For every bounded width selected from `320, 640, 960, 1280` plus the smaller source width:

| Case | Expected result |
| --- | --- |
| JPEG | Exact `image/jpeg`, bounded dimensions, no APP1/APP2/APP13/COM metadata, D1 checksum and R2 ETag recorded |
| WebP | Exact `image/webp`, no EXIF/XMP/ICCP chunks, D1 checksum and R2 ETag recorded |
| AVIF at or below 960 px | Stored only when runtime returns exact `image/avif` and metadata scan passes |
| AVIF runtime fallback or failure | AVIF skipped; mandatory JPEG/WebP matrix still completes |
| Source smaller than policy width | No upscaling; duplicate widths collapse deterministically |
| Transparent source rendered as JPEG | White background and correct aspect ratio |

## Race and idempotency

| Case | Expected result |
| --- | --- |
| Two generation requests start together | One D1 lease succeeds; the other returns busy |
| Worker stops during generation | Lease expires after five minutes; retry can claim the job |
| Same policy and checksum already ready | Non-forced request returns ready without rewriting objects |
| Forced editor regeneration | Same deterministic keys are replaced and current D1 checksum/ETag is updated |
| Policy version changes | New deterministic namespace is generated; old rows/objects are removed after successful current-policy completion |
| Source checksum changes | Job becomes pending, stale rows become deleting, and new variants are required before approval |

## Moderation and ownership

| Actor/state | Preview | Regenerate | Approve | Delete |
| --- | --- | --- | --- | --- |
| Anonymous, pending | 404 | 401 | 401 | 401 |
| Owner, pending | Private derivative only; `private, no-store` | Allowed | Forbidden | Allowed only when detached from recipes |
| Other contributor | 404 | 403 | Forbidden | 403 |
| Editor/admin | Private derivative only; `private, no-store` | Allowed; force supported | Allowed only after mandatory current-policy matrix | Allowed only when detached |
| Rejected/quarantined | 404 except editorial page state; derivatives cleaned | 409 | Requires return to pending and regeneration | Detached deletion allowed |
| Approved | Public derivative only | Owner/editor private regeneration remains guarded | Already approved conflict | Refused while assigned |

## Public delivery and cache

| Case | Expected result |
| --- | --- |
| Approved parent without ready current-policy job | 404; original never served |
| Ready derivative but parent pending/rejected/quarantined/deleted | 404 |
| URL lacks or has stale `v` policy/checksum token | 307 to canonical URL; no original fetch |
| `Accept: image/avif` and AVIF exists | AVIF derivative |
| AVIF absent | WebP when accepted, otherwise JPEG |
| Explicit valid `format` | Exact requested ready format or 404 |
| Width between generated variants | Smallest ready variant at or above request; otherwise largest |
| Matching `If-None-Match` | 304 with the same cache/privacy headers |
| R2 ETag or size differs from D1 | 503, `private, no-store` |
| Public response | Immutable one-year cache, `Vary: Accept`, checksum header, nosniff, same-site resource policy |
| Private preview | `private, no-store`, `Vary: Cookie, Accept` |

## Cleanup and replacement

| Case | Expected result |
| --- | --- |
| Moderation becomes rejected or quarantined | D1 trigger denies readiness immediately; route deletes derivative R2 objects and rows |
| Asset marked deleted | D1 denies delivery before object deletion; derivatives and private original are deleted |
| Cleanup partially fails | Asset remains non-public and job remains recoverable/cleaned on retry |
| Recipe image replacement | New immutable media asset is attached first; old asset is deletable only after no recipe references it |

## Build and static validation

Run on a clean checkout:

```bash
npm ci
npm run validate
npm run build
npm run build:d1
npm run db:migrate:local
```

The final PR head must also have a successful GitHub Actions CI run. Deployment, D1 activation, account provisioning, real media uploads and real moderation are outside this matrix and remain prohibited for this phase.
