/**
 * Seller A's data source: live NEAR/USD prices from CoinGecko's free public API
 * (no key). Price data by CoinGecko. Horkos does not pay CoinGecko and CoinGecko
 * is not a Horkos seller; it is seller A's data source.
 *
 * There is no fallback: if CoinGecko does not answer, this throws and the
 * seller delivers nothing.
 */
const URL = "https://api.coingecko.com/api/v3/coins/near/market_chart?vs_currency=usd&days=1";

async function fetchOnce(): Promise<Response> {
  return fetch(URL, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(15_000) });
}

/** The last `n` points of CoinGecko's 24 h NEAR/USD chart as `{ t, price }` rows (t in unix seconds). */
export async function nearUsdRows(n = 4): Promise<{ t: number; price: number }[]> {
  let res: Response;
  try {
    res = await fetchOnce();
    if (res.status === 429) {
      // Free API rate limit: one retry after a pause, then give up.
      await new Promise((r) => setTimeout(r, 20_000));
      res = await fetchOnce();
    }
  } catch (e) {
    throw new Error(`CoinGecko did not answer (${(e as Error).message}); no data delivered`);
  }
  if (!res.ok) throw new Error(`CoinGecko answered HTTP ${res.status}; no data delivered`);
  const body = (await res.json()) as { prices?: [number, number][] };
  const prices = body.prices ?? [];
  if (prices.length < n || prices.some((p) => typeof p[0] !== "number" || typeof p[1] !== "number")) {
    throw new Error(`CoinGecko returned ${prices.length} usable price points; no data delivered`);
  }
  return prices.slice(-n).map(([ms, price]) => ({ t: Math.floor(ms / 1000), price }));
}
