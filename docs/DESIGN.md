# Horkos — Tasarım

Durum: taslak (28 Ekim 2026). İsimler geliştirme sırasında değişebilir; değişince bu belgeyi güncelle.

## 1. Problem

AI ajanları ödeme yapabiliyor, ama ödeme ters gittiğinde ne olacağını belirleyen bir altyapı yok. Ödeme rayları hazır; eksik olan güven katmanı.

1. **Geri alınamayan ödeme.** Stablecoin ödemeleri saniyede kesinleşir; chargeback karşılığı ve standart iade yolu yok.
2. **Belirsiz sorumluluk.** Ajan yetkisini aşarsa kimin sorumlu olduğu belli değil; talimat ve yetki kaydı yok.
3. **Ele geçirilen ajanlar.** Mayıs 2026'da Grok'a bağlı bir cüzdan Morse koduyla gizlenmiş komutla ~150–174 bin $ kaybetti.
4. **Satıcı dolandırıcılığı.** Önden ödeme alıp teslim etmemek ya da işe yaramaz veri göndermek.
5. **Alıcı dolandırıcılığı.** Veriyi alıp "bozuk" deyip iade istemek. Teslimatı alıcı doğrularsa yalan söylemek onun çıkarına (fair exchange problemi).

Mevcut çözümler: Circle Refund Protocol (tek zincir, ERC-20 escrow + hakem, ajanlara özel değil), Google AP2 (yetki belgesi tanımlar, zincirde zorunlu kılmaz), AgentPMT (platform içi kredi ile iade). Hiçbiri alıcı dolandırıcılığını ve adil takası birlikte çözmüyor.

## 2. Çözüm

| Mekanizma | Ne yapar | Kapattığı sorun |
| --- | --- | --- |
| Zincir üstü yetki | Bütçe kontratta; limit, izinli satıcılar, süre kontratta kontrol edilir; ajanın anahtarı yalnızca sipariş açar | Belirsiz sorumluluk, ele geçirilen ajan |
| Emanet | Para satıcıya değil sipariş bakiyesine gider | Satıcı dolandırıcılığı |
| NFT makbuz | Sipariş kaydı: kim, neyi, kaça, hangi yetkiyle, hangi durumda | Kayıt ve kanıt eksikliği |
| Adil takas | Şifreli teslimat; ödeme ve anahtar aynı `settle` çağrısında | Alıcı dolandırıcılığı |
| Zaman aşımı iadesi | Süre dolarsa para kendiliğinden döner | Teslim etmeyen satıcı |

Alıcı veriye ancak doğrulama geçince erişebildiği için "aldım ama bozuk" durumu oluşmaz; makine tarafından doğrulanabilir ürünlerde tek iade yolu zaman aşımıdır.

## 3. Terimler

| Terim | Anlamı | Horkos'taki görevi |
| --- | --- | --- |
| Mandate (yetki) | Kullanıcının ajana verdiği sınırlı izin | Kontratta kayıtlı; her siparişte kontrol edilir |
| Function-call key | Yalnızca belirli kontrat fonksiyonlarını çağırabilen, para ekleyemeyen NEAR erişim anahtarı | Ajan yalnızca `create_order` / `cancel_order` çağırabilir |
| NEP-141 / `ft_transfer_call` | Değiştirilebilir token standardı ve kontrata token gönderip haber verme akışı | Bütçe yatırma |
| NEP-171 | NFT standardı | Sipariş makbuzu |
| Teslim koşulu | Makine tarafından kontrol edilebilir şart (şema, test paketi, yeniden hesaplama) | Doğrulamanın ölçütü |
| Hash | Verinin parmak izi | Teslim edilen = doğrulanan veri; doğruluğu kanıtlamaz |
| TEE / attestation | Yalıtılmış çalışma alanı / donanım imzalı çalışma kanıtı | Doğrulayıcının tarafsızlığı |
| OutLayer | NEAR'da TEE içinde kod çalıştıran hackathon ortağı | Doğrulayıcının yeri (P1) |
| İç bakiye | Kontrat içindeki alacak kaydı | Atomik settle; dış transfer ayrı (`withdraw`) |

## 4. Yaşam döngüsü

| Aşama | Ne olur | Kapattığı sorun |
| --- | --- | --- |
| 1. Yetki ve bütçe | `ft_transfer_call` ile bütçe; `set_mandate`; ajana function-call key | Sınırsız harcama |
| 2. Sipariş | `create_order`: yetki kontrolü → emanet → NFT makbuz; uygun değilse ret | Sınır dışı ödeme, önden ödeme |
| 2b. İptal | Yalnızca `Open` iken `cancel_order` → `Cancelled` | Kilitli kalan para; satıcı emeğinin bedava kullanımı |
| 3. Teslimat ve doğrulama | `submit_delivery` (şifreli) → doğrulayıcı koşulu kontrol eder | Alıcı ve satıcı dolandırıcılığı |
| 4. Kesinleşme | `settle`: attestation doğrula → satıcı iç bakiyesi → alıcıya şifreli anahtar (tek çağrı) | Anahtar/ödeme boşluğu |
| 5. Zaman aşımı | `refund_expired` → `Refunded` | Teslim etmeyen satıcı |
| 6. Çekim | `withdraw` | Dış transfer hatasında kayıp |

Durumlar: `Open → Delivered → Settled`; `Open | Delivered → Refunded`; `Open → Cancelled`. Her sipariş tek bir son duruma ulaşır.

## 5. Tehdit modeli

| Tehdit | Karşılık | Kalan varsayım |
| --- | --- | --- |
| Ele geçirilen ajan | Anahtar yalnızca sipariş açar; kontrat limit ve satıcı dışını reddeder | Yetkinin doğru tanımlanması |
| Yetki içinde kötü kullanım | Sipariş başı ve toplam limit; anında iptal | Limit içi kayıp sınırlanır, önlenmez |
| Teslim etmeyen satıcı | Emanet + zaman aşımı iadesi | Yok |
| Koşula uymayan teslimat | Doğrulama geçmez → iade | Koşulun iyi tanımlanması |
| Koşula uyan işe yaramaz veri | Kısmen; kalite değil uygunluk garanti edilir | Alıcı koşulları okumalı |
| Alıcı dolandırıcılığı | Veri ancak settle ile açılır | Doğrulayıcının tarafsızlığı |
| İptalin kötüye kullanımı | `Delivered` sonrası iptal yok | Yok |
| Anahtar/ödeme boşluğu | Atomik settle, iç bakiye | Yok |
| Sahte doğrulama | Yalnızca geçerli attestation kabul | TEE'ye ya da (yedek planda) doğrulayıcı servisine güven |
| Çift ödeme/iade | Durum makinesi | Yok |

## 6. Kontrat arayüzü (taslak)

| Fonksiyon | Çağıran | Ne yapar |
| --- | --- | --- |
| `ft_on_transfer` | Token kontratı | Yatırılanı yetki bakiyesine yazar |
| `set_mandate` / `revoke_mandate` | Kullanıcı | Yetkiyi tanımlar / kapatır |
| `register_listing` | Satıcı | Fiyat, teslim koşulu hash'i, teslim süresi |
| `create_order` | Ajan (FC key) | Yetki kontrolü, emanet, NFT basımı |
| `cancel_order` | Ajan (FC key) | Yalnızca `Open` iken iptal |
| `submit_delivery` | Satıcı | Şifreli veri referansı + hash → `Delivered` |
| `settle` | Doğrulayıcı | Attestation doğrula, iç bakiyeye yaz, şifreli anahtarı kaydet |
| `refund_expired` | Herkes | Süresi geçmiş siparişi iade et |
| `withdraw` | Satıcı / kullanıcı | İç bakiyeyi cüzdana çek |
| `nft_token`, `nft_tokens_for_owner` | Herkes | NEP-171 görüntüleme |

```rust
struct Mandate {
    owner: AccountId, agent: AccountId, balance: u128,
    max_total: u128, max_per_order: u128,
    allowed_sellers: Vec<AccountId>, expires_at: u64, active: bool,
}
struct Listing { seller: AccountId, price: u128, condition_hash: String, delivery_window: u64 }
enum OrderStatus { Open, Delivered, Settled, Refunded, Cancelled }
struct Order {
    id: u64, buyer: AccountId, seller: AccountId, amount: u128, listing_id: u64,
    deadline: u64, buyer_pubkey: String, delivery_ref: Option<String>,
    encrypted_key: Option<String>, status: OrderStatus,
}
```

Açık soru: alıcının açık anahtarı `create_order` içinde gönderilir (öneri).

## 7. Entegrasyon katmanları

| Katman | Kim kullanır | Kapsam |
| --- | --- | --- |
| Protokol (kontrat) | Herkes | P0 |
| Ajan SDK'sı (TypeScript) | Ajan geliştiricileri | P0 |
| Satıcı SDK'sı | API/veri satıcıları | P0 |
| dApp paneli | İnsanlar (sahip, satıcı) | P0 (basit) |
| MCP sunucusu | MCP destekli AI ajanları | P1 |
| x402 uyumluluğu, NEP önerisi | Ekosistem | Yol haritası |

Ajanlar dApp kullanmaz; SDK veya MCP ile bağlanır.

```ts
const order = await horkos.buy({ listingId: 42, maxPrice: "10", deadline: "30m" });
const data = await horkos.waitForDelivery(order.id);
```

## 8. Kullanım senaryoları

Uygun: kod taşeronluğu (test paketi), veri seti alımı (şema, satır sayısı, tazelik), veri etiketleme (gizli kontrol örnekleri), hesaplama işi (örneklem yeniden hesaplama), güvenlik açığı raporu (PoC tetikler), imzalı piyasa verisi.

Uygun değil: kuruşluk anlık API çağrıları (x402 ortalaması ~0,22 $), öznel kaliteli işler, fiziksel ürünler, süreye yayılan hizmetler. Hedef aralık kabaca 1 $ – birkaç yüz $.

## 9. Açık sorular

- Birden fazla track'te ödül mümkün mü? (Discord)
- OutLayer attestation'ı NEAR kontratında nasıl doğrulanıyor? (1–2 Kasım denemesi)
- Test token: kendi NEP-141'imiz (testnet).
