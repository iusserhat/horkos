# tUSDC faucet

`contracts/faucet`, deployed at `faucet.horkos.testnet` (14 Nov 2026; txs in [testnet.md](testnet.md#tusdc-faucet-14-nov-2026-0900-utc)). It gives test tUSDC (`tusdc.horkos.testnet`, 6 decimals) to anyone who wants to try Horkos. Testnet only.

## Rules

- `claim()` sends 20 tUSDC to the caller.
- Once per account per 24 hours.
- Total distribution cap: 10,000 tUSDC (500 claims). Funded with 10,000 tUSDC.
- If the caller is not registered on the token, the faucet pays the NEP-145 storage deposit (0.00125 NEAR) from its own balance; if already registered, the deposit is refunded to the faucet.
- If the token transfer fails, the claim is released: the account can claim again and the amount is not counted.
- Only the owner (`horkos.testnet`) can refill, pause or change the cap. Tokens sent by anyone else are returned.

## Methods

| Method | Caller | Args | Deposit / gas | Errors |
| --- | --- | --- | --- | --- |
| `new(owner, token, amount, cap)` | Contract account, once | `AccountId`, `AccountId`, `U128`, `U128` | — | "Need 0 < amount <= cap" |
| `claim() -> Promise<bool>` | Anyone | — | No deposit; at least 30 Tgas (50 recommended) | "Faucet is paused"; "Attach at least 30 Tgas"; "Already claimed; next claim after {unix ms} ms"; "Faucet cap reached" |
| `set_paused(paused: bool)` | Owner | | | "Only the owner" |
| `set_cap(cap: U128)` | Owner | | | "Only the owner"; "Cap below distributed" |
| `ft_on_transfer(sender_id, amount, msg)` | The token (refill via `ft_transfer_call`) | | | Returns the full amount unless the predecessor is the token and the sender is the owner |
| `on_claim(...)` | Faucet itself (`#[private]`) | | | |
| `get_info()` (view) | | | | `{owner, token, amount, cap, distributed, paused, cooldown_ms}` |
| `next_claim_at(account_id)` (view) | | | | Unix ms of the next allowed claim, or `null` if it can claim now |

Logs: "Sent {amount} to {account}", "Transfer to {account} failed; claim released", "Refilled with {amount}", "Refill refused: only the owner can send {token} here".

## Use it

```bash
near contract call-function as-transaction faucet.horkos.testnet claim json-args '{}' prepaid-gas '50 Tgas' attached-deposit '0 NEAR' sign-as <you>.testnet network-config testnet sign-with-legacy-keychain send
near contract call-function as-read-only tusdc.horkos.testnet ft_balance_of json-args '{"account_id":"<you>.testnet"}' network-config testnet now   # "20000000"
near contract call-function as-read-only faucet.horkos.testnet get_info json-args '{}' network-config testnet now
```

A new testnet account comes from NEAR's faucet service:

```bash
near account create-account sponsor-by-faucet-service <you>.testnet autogenerate-new-keypair save-to-legacy-keychain network-config testnet create
```

The full judge path (two fresh accounts, claim, agent key, mandate, budget, MCP purchase) ran on 14 Nov 2026; commands and txs: [testnet.md](testnet.md#judge-path-run-with-fresh-accounts).

## Owner operations

```bash
# refill
near contract call-function as-transaction tusdc.horkos.testnet ft_transfer_call json-args '{"receiver_id":"faucet.horkos.testnet","amount":"1000000000","msg":""}' prepaid-gas '100 Tgas' attached-deposit '1 yoctoNEAR' sign-as horkos.testnet network-config testnet sign-with-legacy-keychain send
# pause / resume
near contract call-function as-transaction faucet.horkos.testnet set_paused json-args '{"paused":true}' prepaid-gas '30 Tgas' attached-deposit '0 NEAR' sign-as horkos.testnet network-config testnet sign-with-legacy-keychain send
```

## Tests

```bash
(cd contracts && cargo test -p faucet)                                  # 11 unit tests
contracts/scripts/test-sandbox.sh faucet_claim                          # 1 sandbox test: refill, claim with registration, 24 h limit, cap, pause
```

The faucet keeps one record per claiming account (paid from its own NEAR balance, under 0.001 NEAR each) and pays 0.00125 NEAR per new token registration, so it holds 3 NEAR for gas and storage.
