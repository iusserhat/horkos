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
| TEE / attestation | Yalıtılmış çalışma alanı / donanım imzalı çalışma kanıtı | Doğrulamanın TEE'de çalıştığının sonradan, zincir dışında denetlenmesi (kontrat attestation doğrulamaz) |
| OutLayer | NEAR'da TEE içinde kod çalıştıran hackathon ortağı | Doğrulayıcının yeri (P1); sonucu kontratın callback'ine verir |
| İç bakiye | Kontrat içindeki alacak kaydı | Atomik settle; dış transfer ayrı (`withdraw`) |

## 4. Yaşam döngüsü

| Aşama | Ne olur | Kapattığı sorun |
| --- | --- | --- |
| 1. Yetki ve bütçe | `ft_transfer_call` ile bütçe; `set_mandate`; ajana function-call key | Sınırsız harcama |
| 2. Sipariş | `create_order`: yetki kontrolü → emanet → NFT makbuz; uygun değilse ret | Sınır dışı ödeme, önden ödeme |
| 2b. İptal | Yalnızca `Open` iken `cancel_order` → `Cancelled` | Kilitli kalan para; satıcı emeğinin bedava kullanımı |
| 3. Teslimat ve doğrulama | `submit_delivery` (şifreli, OutLayer ücreti ekli) → kontrat `request_execution` → `Verifying`; TEE koşulu kontrol eder | Alıcı ve satıcı dolandırıcılığı |
| 4. Kesinleşme | `on_verified` callback: geçerli + `Verifying` + süre dolmamış → satıcı iç bakiyesi + alıcıya şifreli anahtar (tek çağrı); değilse `Delivered`, yeniden gönderilebilir | Anahtar/ödeme boşluğu |
| 5. Zaman aşımı | `refund_expired` → `Refunded` | Teslim etmeyen satıcı |
| 6. Çekim | `withdraw` | Dış transfer hatasında kayıp |

Durumlar: `Open → Verifying → Settled`; `Verifying → Delivered` (geçersiz ya da sonuç yok) → `Verifying` (son tarihe kadar yeniden gönderim); `Open | Delivered | Verifying → Refunded`; `Open → Cancelled`. Her sipariş tek bir son duruma ulaşır.

## 5. Tehdit modeli

| Tehdit | Karşılık | Kalan varsayım |
| --- | --- | --- |
| Ele geçirilen ajan | Anahtar yalnızca sipariş açar; kontrat limit ve satıcı dışını reddeder | Yetkinin doğru tanımlanması |
| Yetki içinde kötü kullanım | Sipariş başı ve toplam limit; anında iptal | Limit içi kayıp sınırlanır, önlenmez |
| Teslim etmeyen satıcı | Emanet + zaman aşımı iadesi | Yok |
| Koşula uymayan teslimat | Doğrulama geçmez → iade | Koşulun iyi tanımlanması |
| Koşula uyan işe yaramaz veri | Kısmen; kalite değil uygunluk garanti edilir | Alıcı koşulları okumalı |
| Alıcı dolandırıcılığı | Veri anahtarı alıcıya ancak kesinleşmeyle verilir | OutLayer operatörü ve TEE |
| İptalin kötüye kullanımı | `Delivered` sonrası iptal yok | Yok |
| Anahtar/ödeme boşluğu | Atomik settle, iç bakiye | Yok |
| Sahte doğrulama sonucu | Sonuç yalnızca kontratın kendi `request_execution` çağrısının callback'inden kabul edilir (`#[private]`); çalışacak WASM hash ile sabitlenir | **Kontrat attestation doğrulamaz.** OutLayer operatörüne güvenilir; operatör hesabında (`worker.outlayer.testnet` / `.near`) full-access anahtarlar var, yani operatör TEE'den geçmeden sonuç yazabilir. TEE çalışması attestation ile zincir dışında, sonradan denetlenebilir |
| Doğrulayıcının başkası tarafından çağrılması (satıcının veri anahtarını kendi açık anahtarına yeniden şifretmek) | Proje manifestinde `callers: contract only [horkos]`; WASM `NEAR_PREDECESSOR_ID`'yi kontrol eder; `buyer_pubkey` kontratın sipariş kaydından gelir | OutLayer'ın caller kısıtını doğru uygulaması |
| Doğrulama ile iade yarışı | Kesinleşme yalnızca `Verifying` ve `now < deadline` iken; `refund_expired` `Verifying`'i de iade eder; geç callback yok sayılır | Yok |
| OutLayer kesintisi | Sonuç gelmezse (`null`) sipariş `Delivered`'a döner, son tarihte iade | Satıcının OutLayer ücreti yanar |
| Çift ödeme/iade | Durum makinesi | Yok |
| Depolama tüketme (ajan `create_order`/`cancel_order` döngüsüyle kontrat depolamasını doldurur; iptal bütçeyi geri açtığı için token limiti bunu durdurmaz) | Sipariş depolaması sahibin NEAR depozitosundan düşülür, yetmezse ret; mandate başına açık sipariş üst sınırı (varsayılan 50); `ft_on_transfer` mandate'i olmayan hesaba kayıt açmaz; `register_listing` kendi depolamasını öder | Kayıp sahibin yatırdığı depozitoyla sınırlı |

## 6. Kontrat arayüzü (taslak)

| Fonksiyon | Çağıran | Ne yapar |
| --- | --- | --- |
| `ft_on_transfer` | Token kontratı | Yatırılanı mevcut yetkinin bakiyesine yazar; yetki yoksa tutarı iade eder |
| `set_mandate` / `revoke_mandate` | Kullanıcı (1 yocto + depolama depoziti) | Yetkiyi tanımlar, ekli NEAR'ı depolama depozitosuna ekler / kapatır ve kalan depoziti iade eder |
| `register_listing` | Satıcı (depolama ücreti ekli) | Fiyat, teslim koşulu hash'i, teslim süresi |
| `create_order` | Ajan (FC key) | Yetki kontrolü (sipariş başı/toplam limit, satıcı listesi, süre, açık sipariş sınırı), emanet, depolama ücretini depozitodan düşme, NFT basımı |
| `cancel_order` | Ajan (FC key) | Yalnızca `Open` iken iptal |
| `set_verifier` | Admin (1 yocto) | OutLayer hesabı, doğrulayıcı WASM URL + sha256, secrets satırı, asgari ücret |
| `submit_delivery` | Satıcı (OutLayer ücreti ekli) | Şifreli veri referansı + hash; `Open`/`Delivered` → `Verifying`; OutLayer `request_execution`; `Verifying` iken ikinci istek ret |
| `on_verified` | Kontratın kendisi (`#[private]` callback) | Geçerli + `Verifying` + `now < deadline` → satıcı iç bakiyesi + alıcı için şifreli anahtar → `Settled`; geçersiz/`null` → `Delivered`; son durumdaysa hiçbir şey yapma |
| `refund_expired` | Herkes | Süresi geçmiş `Open`/`Delivered`/`Verifying` siparişi iade et |
| `withdraw` | Satıcı / kullanıcı | İç bakiyeyi cüzdana çek |
| `nft_token`, `nft_tokens_for_owner`, `nft_metadata` | Herkes | NEP-171 görüntüleme; `nft_transfer` bu sürümde reddedilir |

```rust
struct Mandate {
    owner: AccountId, agent: AccountId, balance: u128, spent: u128,
    max_total: u128, max_per_order: u128,
    allowed_sellers: Vec<AccountId>, expires_at: u64, active: bool,
    storage_deposit: u128,          // yoctoNEAR; order storage is charged here
    open_orders: u32, max_open_orders: u32,  // default cap 50
}
struct Listing { seller: AccountId, price: u128, condition_hash: String, delivery_window: u64 }
enum OrderStatus { Open, Verifying, Delivered, Settled, Refunded, Cancelled }
struct Order {
    id: u64, buyer: AccountId, seller: AccountId, amount: u128, listing_id: u64,
    deadline: u64, buyer_pubkey: String, delivery_ref: Option<String>,
    encrypted_key: Option<String>, status: OrderStatus,
    attempts: u32,   // verification requests; the callback must match it
}
```

Açık soru: alıcının açık anahtarı `create_order` içinde gönderilir (öneri).

## 6b. Doğrulama akışı (OutLayer)

Kaynak: 1 Kasım denemesi (`spikes/outlayer/REPORT.md`), OutLayer belgeleri ve `out-layer/outlayer` kaynak kodu.

**Güven modeli (iddia sınırı).** Kontrat attestation'ı ya da bir imzayı doğrulamaz; OutLayer callback'e yalnızca çıktı JSON'u verir (başarısızlıkta `null`). Kontrat şunlara dayanır: sonucun kendi `request_execution` çağrısının `#[private]` callback'inden gelmesi ve çalışacak WASM'ın sha256 ile sabitlenmesi. OutLayer operatörüne güvenilir (operatör hesabında full-access anahtarlar var). TEE çalışması attestation ile zincir dışında, sonradan doğrulanabilir (`outlayer-verify`, dashboard).

**Anahtarlar.**
- Doğrulayıcı anahtar çifti (X25519): gizli anahtar OutLayer secrets'ta TEE içinde üretilir (`outlayer secrets set --generate PROTECTED_VERIFIER_SK:hex32`), değeri kimse görmez; satır doğrulayıcı build'ine kilitlenir (`--build <sha256>`, yeni sürümde `secrets access --build` ile taşınır).
- Açık anahtar: doğrulayıcı WASM bir `pubkey` komutuyla gizli anahtardan türetip çıktı verir; kontrat bunu kendi OutLayer çağrısının callback'inde kaydeder (`verifier_pubkey` view).
- Alıcı: `create_order`'da `buyer_pubkey` (X25519) verir.

**Akış.**
1. Satıcı veriyi rastgele veri anahtarı `K` ile şifreler (simetrik AEAD), şifreli veriyi bir URL'ye koyar, `K`'yi doğrulayıcı açık anahtarına mühürler (sealed box).
2. Satıcı `submit_delivery(order_id, delivery_ref, sealed_key)` çağırır ve OutLayer ücretini ekler. Sipariş `Open`/`Delivered` olmalı ve süre dolmamış olmalı; `Verifying` iken ret.
3. Kontrat `request_execution` çağırır: `source` = doğrulayıcı WASM (hash sabit), `input_data` = `{order_id, delivery_ref, sealed_key, condition_hash, buyer_pubkey}` (`buyer_pubkey` sipariş kaydından), `secrets_ref` = doğrulayıcı satırı. Sipariş `Verifying`.
4. TEE: `NEAR_PREDECESSOR_ID == horkos` kontrolü; `K`'yi açar; veriyi indirir, çözer; koşulu (şema/test) kontrol eder; geçerse `K`'yi `buyer_pubkey`'e mühürler. Çıktı (≤ 900 bayt): `{order_id, valid, data_sha256, buyer_sealed_key}`.
5. `on_verified`: sipariş son durumdaysa (ör. iade edildi) hiçbir şey yapma. `Verifying` + `valid` + `order_id` eşleşir + `now < deadline` → satıcı iç bakiyesi += tutar, `encrypted_key = buyer_sealed_key`, `Settled`. Aksi halde `Delivered`.

**Depolama.** `create_order` sipariş kaydı + makbuz + rezervi tek seferde mandate depozitosundan düşer. Rezerv: `delivery_ref` ve `encrypted_key` (her biri ≤ `MAX_STRING_LEN` = 256 + 4 bayt), satıcının ilk iç bakiye kaydı (128 bayt) ve metadata yeniden yazımı (32 bayt). Ölçülen toplam: **sipariş başına ~1513 bayt ≈ 0,015 NEAR** (testnet byte maliyetiyle); 50 açık siparişlik bir yetki ≈ 0,76 NEAR depozit ister. `submit_delivery` ve `on_verified` yeni depolama ödemesi istemez (testle doğrulandı, en uzun alanlarla).

**Hata durumları.** `on_verified` sonuç dışında bir nedenle (ör. gas) başarısız olursa sipariş `Verifying`'de kalır; satıcı yeniden gönderemez, son tarihte `refund_expired` iade eder. `attempts` sayacı eski bir denemenin sonucunun yenisine uygulanmasını engeller.

**Henüz denenmedi:** OutLayer secrets ile `PROTECTED_*` üretimi, `callers` manifest kısıtı, büyük verinin WASM içinden HTTP ile çekilmesi (WASI P2 gerekir). P1'de ilk iş bunları denemek.

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
- ~~OutLayer attestation'ı NEAR kontratında nasıl doğrulanıyor?~~ Doğrulanmıyor; bkz. §6b ve `spikes/outlayer/REPORT.md`.
- OutLayer operatör hesabındaki full-access anahtarların amacı ve kaldırılma planı (OutLayer ekibine soruldu).
- Test token: kendi NEP-141'imiz (testnet).
