export type Market = {
  code: string;
  name: string;
  locale: string;
  measurementSystem: "us" | "metric";
};

export const markets: Market[] = [
  { code: "US", name: "United States", locale: "en-US", measurementSystem: "us" },
  { code: "CA", name: "Canada", locale: "en-CA", measurementSystem: "metric" },
  { code: "GB", name: "United Kingdom", locale: "en-GB", measurementSystem: "metric" },
  { code: "AU", name: "Australia", locale: "en-AU", measurementSystem: "metric" },
  { code: "NZ", name: "New Zealand", locale: "en-NZ", measurementSystem: "metric" },
  { code: "FR", name: "France", locale: "fr-FR", measurementSystem: "metric" },
  { code: "DE", name: "Germany", locale: "de-DE", measurementSystem: "metric" },
  { code: "CH", name: "Switzerland", locale: "de-CH", measurementSystem: "metric" },
  { code: "SE", name: "Sweden", locale: "sv-SE", measurementSystem: "metric" },
  { code: "NL", name: "Netherlands", locale: "nl-NL", measurementSystem: "metric" },
];

const marketMap = new Map(markets.map((market) => [market.code, market]));
const DEFAULT_MARKET = marketMap.get("US")!;

function readCookie(request: Request, name: string): string | undefined {
  const cookie = request.headers.get("cookie");
  if (!cookie) return undefined;

  for (const part of cookie.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }

  return undefined;
}

export function normaliseMarketCode(value?: string | null): string | undefined {
  if (!value) return undefined;
  const code = value.trim().toUpperCase();
  return marketMap.has(code) ? code : undefined;
}

export function resolveMarket(request: Request, url: URL): Market {
  const queryOverride = normaliseMarketCode(url.searchParams.get("country"));
  if (queryOverride) return marketMap.get(queryOverride)!;

  const cookieOverride = normaliseMarketCode(readCookie(request, "preferred_country"));
  if (cookieOverride) return marketMap.get(cookieOverride)!;

  const cloudflareCountry = normaliseMarketCode(
    (request as Request & { cf?: { country?: string } }).cf?.country ?? request.headers.get("cf-ipcountry"),
  );

  return cloudflareCountry ? marketMap.get(cloudflareCountry)! : DEFAULT_MARKET;
}

export function getMarket(code?: string | null): Market {
  return marketMap.get(normaliseMarketCode(code) ?? "US") ?? DEFAULT_MARKET;
}

export function isSupportedMarket(code?: string | null): boolean {
  return Boolean(normaliseMarketCode(code));
}
