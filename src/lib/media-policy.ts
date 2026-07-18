export const MEDIA_DERIVATIVE_POLICY_VERSION = "recipe-images-v1";
export const MEDIA_DERIVATIVE_WIDTHS = [320, 640, 960, 1280] as const;
export const MEDIA_AVIF_MAX_WIDTH = 960;
export const MEDIA_DERIVATIVE_LOCK_SECONDS = 5 * 60;

export const MEDIA_DERIVATIVE_FORMATS = {
  jpeg: { mimeType: "image/jpeg", extension: "jpg", quality: 82, required: true },
  webp: { mimeType: "image/webp", extension: "webp", quality: 82, required: true },
  avif: { mimeType: "image/avif", extension: "avif", quality: 72, required: false },
} as const;

export type MediaDerivativeFormat = keyof typeof MEDIA_DERIVATIVE_FORMATS;

export function mediaDerivativeCacheToken(sourceSha256: string): string {
  const safeChecksum = sourceSha256.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 20);
  return `${MEDIA_DERIVATIVE_POLICY_VERSION}.${safeChecksum}`;
}

export function mediaDerivativeWidths(sourceWidth: number): number[] {
  const boundedSource = Math.max(1, Math.min(Math.floor(sourceWidth), MEDIA_DERIVATIVE_WIDTHS.at(-1) ?? 1280));
  return [...new Set([
    ...MEDIA_DERIVATIVE_WIDTHS.filter((width) => width < boundedSource),
    boundedSource,
  ])].sort((left, right) => left - right);
}

export function mediaDeliveryUrl(r2Key: string, sourceSha256: string, preview = false): string {
  const path = r2Key.split("/").map((part) => encodeURIComponent(part)).join("/");
  const search = new URLSearchParams();
  if (preview) search.set("preview", "1");
  else search.set("v", mediaDerivativeCacheToken(sourceSha256));
  return `/media/${path}?${search.toString()}`;
}

export function mediaResponsiveSrcSet(url: string): string | undefined {
  if (!url.startsWith("/media/")) return undefined;
  return MEDIA_DERIVATIVE_WIDTHS
    .map((width) => {
      const parsed = new URL(url, "https://media.invalid");
      parsed.searchParams.set("w", String(width));
      return `${parsed.pathname}${parsed.search} ${width}w`;
    })
    .join(", ");
}
