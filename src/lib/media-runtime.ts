import { env } from "cloudflare:workers";

export type MediaRuntimeStatus = {
  uploadsEnabled: boolean;
};

export function getMediaRuntimeStatus(): MediaRuntimeStatus {
  const value = (env as unknown as { MEDIA_UPLOADS_ENABLED?: string }).MEDIA_UPLOADS_ENABLED;
  return {
    uploadsEnabled: value?.trim().toLowerCase() === "true",
  };
}
