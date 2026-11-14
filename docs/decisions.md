# Architecture decision records

English version of [tr/DECISIONS.md](tr/DECISIONS.md), in ADR form (context / decision / consequences). Numbers match the original. Status: accepted unless noted. New decisions go at the end.

### ADR-001: The project is an escrow with NFT receipts for agent orders
- **Context:** 50 ideas were scored on 9 criteria for the NEAR Hackathon.
- **Decision:** Build Horkos: escrow + NFT receipt for purchases made by AI agents.
- **Consequences:** Targets a global, current problem (refunds and accountability in agent payments). Rejected: key rental (NEAR OutLayer already does it, ToS risk), memory vault (existing projects), local ideas (small audience).

### ADR-002: Main track NFTs; also agents, real world, security
- **Context:** Estimated entries: NFT 12–24, Agent Economy 60–120, same prize.
- **Decision:** Submit to `nfts`, with `agents`, `realworld`, `security` as extra tracks.
- **Consequences:** Rejected `open` (most crowded), `business`, `defi` (weak fit).

### ADR-003: Name: Horkos
- **Context:** Needed a short name without collisions.
- **Decision:** Horkos, the Greek spirit of oaths: every agent purchase is an oath.
- **Consequences:** No collision found. Rejected: Maat, Mitra, Forseti, Janus, Fides.

### ADR-004: One contract, orders as NFT receipts
- **Context:** One sub-account per order would hold funds separately but costs account creation and complexity.
- **Decision:** A single contract holds all escrows; each order is an NFT receipt.
- **Consequences:** Cheap orders; per-order accounts moved to a later phase.

### ADR-005: Limits are checked by the contract
- **Context:** A function-call key cannot attach money and cannot enforce token limits.
- **Decision:** The contract checks every mandate limit on `create_order`.
- **Consequences:** Corrected an earlier wrong claim that the function-call key "enforces the mandate".

### ADR-006: Fair exchange with encrypted delivery and a neutral verifier
- **Context:** If the buyer judges the delivery, lying pays.
- **Decision:** The seller delivers encrypted data; a neutral verifier checks it before payment.
- **Consequences:** Rejected: release on buyer approval.

### ADR-007: Atomic settlement with internal balances
- **Context:** Cross-contract calls on NEAR are asynchronous; a key could be released while a payment fails.
- **Decision:** Settlement credits an internal balance; `withdraw` moves tokens separately.
- **Consequences:** No `ft_transfer` inside settlement; sellers withdraw in a second call.

### ADR-008: Delivery conditions must be machine-checkable
- **Context:** A hash proves integrity, not correctness; "AI judges quality" is not provable.
- **Decision:** Conditions are machine-checkable (JSON Schema today).
- **Consequences:** Horkos guarantees conformance, not quality. Rejected: AI quality scoring.

### ADR-009: The only refund path is the timeout
- **Context:** Fair exchange catches bad deliveries before payment.
- **Decision:** No dispute system; refunds happen at the deadline.
- **Consequences:** Arbitration (AI or human) moved to the roadmap.

### ADR-010: One test token first
- **Context:** The NEP-141 flow is enough work for the first version.
- **Decision:** One testnet token (tUSDC).
- **Consequences:** Multiple tokens and NEAR Intents later.

### ADR-011: Verifier on NEAR OutLayer, trust in the operator stated (updated 1 Nov 2026)
- **Context:** The OutLayer spike (`spikes/outlayer/REPORT.md`) showed the callback carries only the output, with no signature or quote; OutLayer does not verify attestations on chain per call.
- **Decision:** Verification runs in OutLayer's TEE; the contract accepts the result trusting OutLayer's operator (whose account holds full-access keys); the attestation can be checked off-chain later.
- **Consequences:** No claim of on-chain attestation. Compared with our own service: third party, auditable afterwards. Rejected: our own verifier service (kept as fallback), on-chain quote verification (unsupported, expensive).

### ADR-012: Cancel only while `Open`
- **Context:** Cancelling after delivery would let buyers use the seller's work for free.
- **Decision:** `cancel_order` works only on `Open` orders.
- **Consequences:** After delivery the only way back is the timeout.

### ADR-013: An MCP server
- **Context:** "How do agents use it?" needs a concrete answer that judges (and AI judges) can try.
- **Decision:** Ship an MCP server in addition to the SDK.
- **Consequences:** `mcp/` with five tools.

### ADR-014: Say "protocol", not "standard"
- **Context:** A standard needs ecosystem adoption.
- **Decision:** Call Horkos a protocol; do not claim a NEP.
- **Consequences:** NEP proposal stays on the roadmap.

### ADR-015: Develop in WSL with a Windows path link
- **Context:** NEAR Rust tools work best on Linux; the assistant's file access needed a Windows path.
- **Decision:** Project at `C:\Users\a\horkos` linked to `~/horkos`.
- **Consequences:** Line-ending and file-mode care (`core.fileMode` false; scripts marked executable explicitly).

### ADR-016: Code with Claude Code; plan in claude.ai
- **Context:** Claude Code can run builds and tests itself.
- **Decision:** Code in Claude Code (WSL); planning and reports in chat.
- **Consequences:** AI use is listed in the README.

### ADR-017: Start coding on 29 Oct
- **Context:** Updated rules (Q-001): code written from the announcement (19 Oct) counts.
- **Decision:** Start before 1 Nov.
- **Consequences:** More time for testnet work.

### ADR-018: Stay on testnet
- **Context:** Testnet-only projects are eligible for all tracks (Q-010); NEAR Intents has no testnet (Q-007).
- **Decision:** Testnet only; Intents later, on mainnet with small amounts.
- **Consequences:** No mainnet claims.

### ADR-019: MIT license; libraries and AI code listed
- **Context:** Rules require a LICENSE (Q-014) and disclosure (Q-005).
- **Decision:** MIT; README lists libraries and AI use.
- **Consequences:** `LICENSE` at the root.

### ADR-020: The agent is a separate account
- **Context:** If the function-call key lived on the owner's account, owner and agent could not be told apart.
- **Decision:** The contract checks `predecessor == mandate.agent`; `set_mandate`, `revoke_mandate`, `withdraw` require 1 yoctoNEAR.
- **Consequences:** A leaked agent key is limited to the mandate and cannot call owner methods.

### ADR-021: Order storage is paid from the owner's deposit
- **Context:** A create/cancel loop reopens the budget and could fill contract storage without hitting token limits.
- **Decision:** `set_mandate` takes a NEAR storage deposit; each order's storage delta is charged to it; `revoke_mandate` refunds the rest; open orders per mandate capped (default 50); `ft_on_transfer` only credits existing mandates.
- **Consequences:** Spam costs the spammer's own deposit. Replaces the original plan where the contract paid storage.

### ADR-022: Pin `near-sdk = "=5.30.0"`
- **Context:** Current stable on 27 Oct 2026; avoid surprise upgrades.
- **Decision:** Exact version pin.
- **Consequences:** Fall back to 5.29.1 only if unit-test mocks break, with a note here.

### ADR-023: Receipts are non-transferable
- **Context:** The receipt owner is the escrow's buyer and the target of the sealed key; transfers would require redesigning refunds and key flow.
- **Decision:** `nft_transfer` and `nft_transfer_call` panic with "Receipts are non-transferable in this version".
- **Consequences:** Transferable receipts on the roadmap.

### ADR-024: Verification through OutLayer from `submit_delivery`
- **Context:** OutLayer returns its result to the calling contract's callback; an external verifier account calling `settle` would be an extra trust point.
- **Decision:** `submit_delivery` (with OutLayer's fee) → `request_execution` → `Verifying`; `on_verified` settles if valid, `Verifying`, and before the deadline, otherwise `Delivered`. No externally callable `settle`.
- **Consequences:** The seller pays per verification attempt.

### ADR-025: Settle only before the deadline; refund also from `Verifying`
- **Context:** Settlement and refund must not race; OutLayer may be slow.
- **Decision:** Settle only while `now < deadline`; `refund_expired` also refunds `Verifying`; a late callback does nothing.
- **Consequences:** The buyer's money returns at the deadline even if OutLayer never answers.

### ADR-026: Reserve delivery storage at order creation
- **Context:** `submit_delivery` and the callback should not need storage payments, and the callback must not fail on storage.
- **Decision:** Storage for `delivery_ref` and `encrypted_key` (each up to 256 bytes) is reserved at `create_order` from the mandate deposit.
- **Consequences:** ≈ 0.0065 NEAR per order reserved.

### ADR-027: Verifier key generated in the TEE; caller restricted
- **Context:** If anyone could call the verifier directly, they could re-seal a seller's data key to their own public key.
- **Decision:** The X25519 key pair is generated by OutLayer secrets inside the TEE (`PROTECTED_*`), locked to the verifier build; the WASM checks `NEAR_PREDECESSOR_ID`; `buyer_pubkey` comes only from the order record.
- **Consequences:** Nobody, including the team, sees the secret key. Rejected: generating and uploading the key ourselves.

### ADR-028: Results must match `(order_id, attempt)`
- **Context:** A second request while `Verifying` is already rejected; an old result must still never apply to a new attempt.
- **Decision:** `Order.attempts` increments on each `submit_delivery` and is passed to the callback.
- **Consequences:** Second line of defence besides the status check.

### ADR-029: Verifier config set by the admin
- **Context:** The WASM hash and OutLayer account must be fixed in the contract, not chosen by sellers or agents.
- **Decision:** `set_verifier` (admin, ≥ 1 yocto); `new(token, admin)`.
- **Consequences:** Admin trust bounded by ADR-031.

### ADR-030: The reserve covers the seller's first balance entry
- **Context:** `on_verified` must never need storage payment in any branch.
- **Decision:** Reserve 128 bytes for the seller's first internal balance record; ≈ 1,517 bytes per order in total.
- **Consequences:** ≈ 0.0152 NEAR per order.

### ADR-031: Verifier pinned per order, versions append-only
- **Context:** The admin must not redirect open orders to a verifier that pays a colluding seller; the agent must be protected against a change between its check and its order.
- **Decision:** `set_verifier` appends a version; orders store `verifier_version`; `submit_delivery` uses only that version; `create_order` optionally takes the expected version.
- **Consequences:** Rejected: copying the full config into each order (same guarantee, ~400 bytes more per order), a single mutable config.

### ADR-032: Separate OutLayer call failure from run failure
- **Context:** In OutLayer's code, a rejected `request_execution` returns the fee to the caller (Horkos), while a failed run is refunded by OutLayer to the payer and returns `null`.
- **Decision:** On `Err` the fee is forwarded to the seller whatever the order's state; `VerifierConfig.max_fee` bounds what Horkos could ever pay.
- **Consequences:** Sellers' fees do not get stuck in Horkos.

### ADR-033: Refund the unused delivery reserve
- **Context:** Orders closed without any delivery never used their 648-byte reserve.
- **Decision:** `Cancelled` or undelivered `Refunded` orders return the reserve to the mandate deposit; the 869-byte record and receipt stay.
- **Consequences:** Create/cancel loops still cost the deposit.

### ADR-034: Seller gateway checks locally before delivering (14 Nov 2026)
- **Context:** Sellers with an existing API should not write code, and a failing delivery still costs a verifier fee.
- **Decision:** `gateway/` reads one JSON config (no secrets; `env:NAME` references), calls the API per order, validates the answer against the listing's schema with ajv, and submits only if it passes.
- **Consequences:** A local pass is not a guarantee; the TEE verifier decides payment. [gateway.md](gateway.md).

### ADR-035: A capped faucet for test tUSDC (14 Nov 2026)
- **Context:** Judges need tUSDC without asking the team.
- **Decision:** `faucet.horkos.testnet`: 20 tUSDC per account per 24 h, total cap 10,000 tUSDC, pays token registration, owner-only refill/pause/cap.
- **Consequences:** The faucet spends a little NEAR per new account; abuse is bounded by the cap. [faucet.md](faucet.md).
