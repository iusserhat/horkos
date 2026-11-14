# FAQ

### Why NEAR?

Three NEAR features do the work. **Function-call access keys** let the owner give the agent a key that can only call `create_order` and `cancel_order` on one contract and cannot attach money. **Asynchronous cross-contract calls with private callbacks** let the contract ask OutLayer for a verification and accept only its own call's result. **NEAR OutLayer** runs the verifier in a TEE. The receipts use NEP-171 and the budget NEP-141.

### Why OutLayer, and what does it guarantee?

The verifier needs to see the decrypted data without the buyer or the seller seeing the other's secrets, and its result must reach the contract. OutLayer runs pinned WASM (by sha256) in Intel TDX and returns the output to the calling contract. What it does not give: an attestation the contract can check. The contract trusts OutLayer's operator for the result; the TEE run can be audited off-chain. See [security.md](security.md).

### How is this different from x402?

x402 is a way to pay for an HTTP request at the moment it is made. Horkos is what happens around a purchase: a mandate the contract enforces, escrow until a condition is met, a receipt, and a refund path. They could work together (an x402 endpoint as a Horkos seller's data source, or Horkos as the settlement behind an x402-style request), but Horkos does not implement x402 today, and the demo does not use it. Horkos also targets orders of roughly $1 or more; cent-sized per-call payments are a better fit for x402.

### Where can money get stuck?

Nowhere permanently, by design. An order's price stays in the contract until it reaches a final state. If the seller never delivers, the delivery fails, or OutLayer never answers, `refund_expired` returns it after the deadline and anyone may call it. Seller earnings sit in an internal balance until `withdraw`; a failed token transfer restores the balance. One edge: if `on_verified` fails for a non-result reason (e.g. gas), the order stays `Verifying` until its deadline and then refunds.

### What if the agent is prompt-injected?

It can only spend within the mandate: allowed sellers, per-order cap, total cap, expiry, open-order cap. On testnet a listing whose description told the agent to buy from a seller outside the mandate was rejected by the contract with "Seller not allowed by mandate" (demo 3; again on 14 Nov from a fresh account through MCP).

### What exactly is verified?

That the delivered JSON validates against the JSON Schema fixed when the listing was created, that the ciphertext is exactly what the seller committed to, and that the condition is the listing's. Not that the data is true or good. See [verifier.md](verifier.md).

### Can the admin take the funds?

The admin can only append verifier versions; open orders keep the version they were created with. But the contract account still has a full-access key held by the team, and whoever holds it could redeploy the code. That is stated as a limitation; removing the key or putting upgrades behind a DAO or timelock is on the roadmap.

### Who pays the fees?

The owner pays order storage (≈ 0.0152 NEAR per order) from a deposit made with the mandate. The seller pays OutLayer's fee per verification attempt (0.01 NEAR attached, ≈ 0.0015 NEAR charged on testnet, rest refunded). Gas is paid by whoever signs.

### Can the buyer read the data without paying?

No. The data is encrypted; the key reaches the buyer only inside the settlement that pays the seller, re-sealed to the buyer's public key by the verifier.

### Can I try it without installing anything?

Yes: the live explorer at https://horkos-escrow.netlify.app/explorer.html reads the contract over RPC. To run everything locally with no accounts: `npm run sandbox` (README, Quick start a). To use your own agent on testnet: [faucet.md](faucet.md) and [mcp.md](mcp.md).

### Is it on mainnet?

No. Testnet only; nothing in this repository claims otherwise.
