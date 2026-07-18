import { env } from "cloudflare:workers";

const bindings = env as unknown as { DB?: D1Database };

export async function listContributorActivePublishedChangeSets(userId: string, limit = 100) {
  const database = bindings.DB;
  if (!database) return [];
  const bounded = Math.min(Math.max(limit, 1), 100);
  const result = await database.prepare(
    `SELECT cs.id, cs.recipe_id, cs.status, cs.revision, cs.base_recipe_revision,
            cs.base_content_revision, cs.editorial_reason, cs.submitted_at, cs.updated_at,
            m.moderation_status AS media_moderation_status
     FROM recipe_change_sets cs
     LEFT JOIN media_assets m ON m.id = cs.media_asset_id
     WHERE cs.owner_id = ?
       AND cs.status IN ('draft', 'review', 'changes_requested')
     ORDER BY cs.updated_at DESC
     LIMIT ?`,
  ).bind(userId, bounded).all();
  return result.results ?? [];
}
