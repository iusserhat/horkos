# Horkos Sentinel

An owner-side watcher for Horkos orders. It reads the escrow contract, applies a few rules to every new order of the owners it watches, and logs alerts (optionally to a webhook). If the owner opts in (`"auto_cancel": true`), it cancels a suspicious order while it is still `Open`, before any delivery, with `cancel_order`, which the agent's function-call key already allows. It changes nothing in the contract and is not a service run by Horkos: you run it with your own agent key.

| Rule | Severity | Fires when |
| --- | --- | --- |
| `price_deviation` | block | The price is more than `price_deviation_pct` (default 50%) away from `reference_prices[condition_hash]`, or, if none is set, from the median price of other sellers' listings with the same condition hash |
| `lookalike_seller` | block | The seller is within `lookalike_max_distance` edits (default 2) of an allowed or trusted seller, or equal to one after folding look-alike characters (`1`/`l`, `0`/`o`, ...); also when the allow-list itself holds such a pair |
| `burst` | block | The owner has more than `burst_count` orders (default 3) within `burst_window_min` (default 10) |
| `new_seller` | warn | First order of this owner with this seller |
| `near_limit` | warn | The order uses at least `near_limit_pct` (default 80%) of the remaining budget or of `max_per_order` |

## Run

```bash
cd sentinel && npm ci
npm test                                                      # 14 unit tests for the rules
npm run sentinel -- --config examples/readonly.json --once --from 28
# Expected (no keys needed; auto_cancel is off in this config):
# … order 28 (hk-judge-1114.testnet → horkos-seller-b.testnet, 9 tUSDC): BLOCK price_deviation: order 28: 9 tUSDC is +80% vs 5 tUSDC (the median of 3 comparable listing(s))
# … WARN new_seller …   … WARN near_limit …
```

Watch continuously with auto-cancel: copy `examples/testnet-demo.json`, put your owner and agent in it, and run `npm run sentinel -- --config my.json`. The agent's function-call key is read from the near-cli legacy keychain (`~/.near-credentials/<network>/<agent>/`) or from `SENTINEL_AGENT_KEY_<AGENT>`.

## On testnet (14 Nov 2026, 16:37 to 16:38 UTC)

Seller B published the same NEAR/USD feed as listing 4 (same schema hash) at 9 tUSDC instead of 5 (listing 6). The owner `hk-judge-1114.testnet` had allowed seller B. Sentinel was watching with auto-cancel:

| Step | Tx |
| --- | --- |
| Listing 6, 9 tUSDC | [`FAzAABet…`](https://testnet.nearblocks.io/txns/FAzAABetHuNKTxNL13fFCAads5BFKwA9b2ghw3NmjDQG) |
| Owner adds seller B to its mandate | [`DG9JLLxL…`](https://testnet.nearblocks.io/txns/DG9JLLxLGMDPps1KnyumSLMeeT2XUoVHoaMuDE9YixtG) |
| Agent orders listing 6 → order 28 (`Open`) at 16:38:20 | [`47QfpY1g…`](https://testnet.nearblocks.io/txns/47QfpY1gGPUQKTDwwQER3n9XVVSK9fX1mNJUE1PKVxBv) |
| Sentinel: `BLOCK price_deviation … +80% vs 5 tUSDC`, then `cancel_order` with the agent's key at 16:38:26 → `Cancelled`, 9 tUSDC back in the budget | [`6AX2QHqL…`](https://testnet.nearblocks.io/txns/6AX2QHqLLjwuJ8iMcWdktw9VPFyVo7f7TXmQ4ArQH4rj) |

## Limits

- Advisory and opt-in. Anyone who does not run it gets only the contract's guarantees (mandate, timeout refund, verification before payment).
- It can only cancel `Open` orders. A seller who delivers within seconds can reach `Verifying` before Sentinel's next poll (default every 3 s).
- The price rule needs a reference: a configured price, or other sellers' listings with the same schema.
- It reads mandates and listings as they are now, so re-evaluating an old order can give slightly different numbers.
