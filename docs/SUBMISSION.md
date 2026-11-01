# Başvuru taslağı

Başvuru tek sefer gönderilir ve düzenlenemez. 14 Kasım sabahı, repo herkese açık ve X paylaşımı yayındayken gönder. Göndermeden önce her iddiayı demo ve README ile karşılaştır; çalışmayanı çıkar.

| Alan | Değer |
| --- | --- |
| Project name | Horkos |
| Team lead | (kullanıcı) |
| Email | (kullanıcı) |
| Team size | (kullanıcı) |
| Tracks | NFTs That Do Something, Agent Economy, Real-World Money, AI Security & Defense (`nfts`, `agents`, `realworld`, `security`) |
| NEAR wallet | `horkos.near` (açıldıktan sonra doğrula) |
| Repository | (herkese açık GitHub linki) |
| Demo post | (X paylaşımı linki) |
| Website | **BOŞ BIRAK** (spam tuzağı) |
| Onay | İşaretle |

## What did you build? (güncellenmiş taslak, < 2.000 karakter)

```
Horkos is a programmable escrow protocol for AI agents. Every purchase an agent makes becomes an NFT receipt backed by escrowed funds that are released only when on-chain spending policies and machine-verifiable delivery conditions are met.

Problem: agents can pay, but they can't get refunds. Stablecoin payments settle instantly and can't be reversed. There is no chargeback, no standard refund path, and when an agent spends beyond what its user allowed, nobody can prove who is liable.

How it works: the user deposits a budget and sets a mandate (spending limits, allowed sellers, expiry). The agent's function-call key can only create orders; the contract rejects anything outside the mandate. Each order is an NFT receipt backed by its own escrowed balance. The seller delivers encrypted data; a verifier running in a TEE on NEAR OutLayer checks it against conditions the seller published (a JSON schema or a test suite). If it passes, the contract's callback credits the seller and releases the decryption key to the buyer in one step. If not, the order refunds itself at the deadline. We don't resolve disputes; we prevent them.

How NEAR fits:
- NFT receipts (NEP-171) that carry the order, its mandate and its status
- Mandates enforced on-chain: the agent's function-call key can only create orders, and the contract rejects anything outside the user's budget and seller list
- Delivery verification runs in a TEE via NEAR OutLayer; the contract accepts the result from OutLayer's callback (it does not verify the attestation on-chain), and the TEE attestation can be checked off-chain afterwards
- Agents connect through a TypeScript SDK or an MCP server

Demo: an agent buys data from 3 sellers. One delivers and gets paid. One returns bad data and is refunded. One prompt-injected, out-of-mandate purchase is rejected and the order is never created.

Try it: the README has step-by-step "do X, see Y" instructions.
```

Yetişmezse metinden çıkar: OutLayer/TEE satırı (yedek doğrulayıcıyı yaz), MCP, "encrypted" teslimat.

**İddia sınırı:** hiçbir yerde "attestation verified on-chain" / "trustless verification" yazılmaz. Kontrat OutLayer operatörüne güvenir; attestation zincir dışında doğrulanır.

## X paylaşımı taslağı

```
AI agents can pay. They can't get refunds.

We built Horkos at NEAR HACKATHON: every agent purchase becomes an NFT receipt with escrowed funds, released only when the user's spending policy and a machine-verifiable delivery check both pass.

We don't resolve disputes. We prevent them.

Demo 👇
[video]
Repo: github.com/...
@NEARProtocol
```
