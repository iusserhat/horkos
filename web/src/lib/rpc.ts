import { CONTRACT, RPC_URLS } from "./config";

/** JSON-RPC POST with fallback over RPC_URLS; returns the parsed body. */
export async function rpcPost(payload: unknown, timeoutMs = 8000): Promise<any> {
  let last: unknown;
  for (const url of RPC_URLS) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, signal: ctrl.signal, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      last = e;
    } finally {
      clearTimeout(timer);
    }
  }
  throw last;
}

/** Calls a view method on the Horkos contract over testnet JSON-RPC. Throws on timeout or RPC error. */
export async function view<T>(method: string, args: Record<string, unknown> = {}, contract = CONTRACT, timeoutMs = 8000): Promise<T> {
  const body = await rpcPost(
    {
      jsonrpc: "2.0",
      id: "horkos-web",
      method: "query",
      params: { request_type: "call_function", finality: "final", account_id: contract, method_name: method, args_base64: btoa(JSON.stringify(args)) },
    },
    timeoutMs,
  );
  if (body.error) throw new Error(body.error.cause?.name ?? body.error.message ?? "RPC error");
  if (body.result?.error) throw new Error(body.result.error);
  const bytes = new Uint8Array(body.result.result as number[]);
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
}
