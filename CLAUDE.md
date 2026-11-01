# Horkos — Claude Code için proje rehberi

Bu dosya her oturumda okunur. Ayrıntılar `docs/` altında. Kullanıcıyla **Türkçe** konuş; kod, commit mesajları, README ve kod yorumları **İngilizce**.

## Proje bir cümlede

Horkos, AI ajanları için programlanabilir bir emanet (escrow) protokolüdür: ajanın her satın alması, parası kontratta kilitli duran bir NFT makbuza dönüşür; para satıcıya yalnızca zincir üstü harcama yetkisi ve makine tarafından doğrulanabilir teslim koşulu birlikte sağlandığında geçer, sağlanmazsa süre dolunca kendiliğinden alıcıya döner.

İlke: **Anlaşmazlıkları çözmüyoruz, oluşmalarını engelliyoruz.**

## Hackathon

- NEAR HACKATHON, geliştirme **1–14 Kasım 2026** (son teslim 14 Kasım 23:59 UTC = 15 Kasım 02:59 TSİ). Kurallar: `HACKATHON.md` (kopya; başvurmadan önce canlı sürümü oku).
- **Geliştirme penceresi açık:** kurallar (Q-001) duyurudan itibaren (19 Ekim 2026) yazılan kodu sayıyor. Kodlamaya hemen başlanabilir.
- Track'ler: `nfts` (ana), `agents`, `realworld`, `security`. Birden fazla track'te ödül alınıp alınamayacağı henüz teyit edilmedi.
- **Önce Claude Code ve Codex tarar (Q-017):** projenin çalıştığını ve README'nin söylediğini yaptığını kontrol edip ön puan verir; kararı insanlar verir. README "do X → see Y" adımlarıyla, temiz bir makinede tekrarlanabilir olmalı. Pazarlama dili yok.
- **README zorunlulukları:** kullanılan kütüphane, şablon ve **AI tarafından üretilen kod** listelenir (Q-005); repo kökünde `LICENSE` dosyası olmalı (Q-014); repo karar açıklanana kadar herkese açık kalmalı.
- **Demo:** X paylaşımında video şart, ekran görüntüsü yetmez (Q-012). Barındırılan (hosted) demo artı puan; en az 18 Kasım'a, mümkünse 25 Kasım'a kadar açık kalmalı.
- **Testnet yeterli (Q-010).** NEAR Intents'in testnet'i yok (Q-007): Intents kullanılırsa mainnet'te ayrı geliştirme hesabıyla, çok küçük tutarlarla ve önce dry-run ile.
- Çalışmayan hiçbir özellik README'de, başvuru metninde veya demoda iddia edilmez.

## Kesin kurallar (kullanıcının açık onayı olmadan asla)

- Mainnet'e deploy, işlem imzalama, token harcama
- Başvuruyu gönderme (`HACKATHON.md`'deki API dahil) — önce tam JSON'u göster, onay bekle
- Repoyu herkese açık yapma, push / force-push
- X'te veya başka yerde paylaşım
- Anahtarlar, kurtarma kelimeleri, `.env` içerikleri asla repoya girmez; kullanıcıdan kurtarma kelimesi isteme
- Testnet varsayılandır. Testnet hesabı: `horkos.testnet` (oluşturuldu 1 Kasım 2026, faucet; anahtar `~/.near-credentials/testnet/`, legacy keychain). Ödül hesabı mainnet `horkos.near` (kullanıcı kendisi açacak). Testnet deploy (1 Kasım): `escrow.horkos.testnet` (kontrat, admin `horkos.testnet`), `tusdc.horkos.testnet` (test token); ayrıntı `docs/TESTNET.md`.

## Mimari (kesinleşen kararlar)

1. **Tek kontrat + NFT makbuz.** Fonlar kontratta sipariş bazında tutulur; NFT (NEP-171) siparişin kimliğini ve durumunu temsil eder. Her sipariş için ayrı alt hesap **P2**.
2. **Yetki (mandate) kontratta zorunlu.** Kullanıcı bütçeyi NEP-141 `ft_transfer_call` ile yatırır, `set_mandate` ile limit/satıcı listesi/süre tanımlar. Ajanın function-call key'i yalnızca `create_order` ve `cancel_order` çağırabilir. Function-call key para ekleyemez ve token limitini kendisi uygulamaz: **limit kontrolünü kontrat yapar.**
3. **Teslim koşulu makine tarafından kontrol edilebilir olmalı:** JSON şeması, test paketi veya yeniden hesaplanabilir çıktı. Horkos kaliteyi değil koşula uygunluğu garanti eder.
4. **Adil takas.** Satıcı veri anahtarını Horkos doğrulayıcısının açık anahtarıyla şifreleyip `submit_delivery` ile (OutLayer ücreti ekli) teslim eder; kontrat OutLayer'da `request_execution` yapar, sipariş `Verifying` olur. TEE içindeki doğrulayıcı (gizli anahtarı OutLayer secrets'ta, TEE'de üretilmiş) veriyi açar, koşulu kontrol eder, veri anahtarını alıcının `buyer_pubkey`'i ile yeniden şifreleyip çıktı verir (≤ 900 bayt). Ayrıntı: `docs/DESIGN.md` §6b.
5. **Kesinleşme atomik ve dış transfer yapmaz.** `on_verified` callback'i, sonuç geçerliyse ve sipariş hâlâ `Verifying` ve `now < deadline` ise aynı çağrıda ödemeyi satıcının **iç bakiyesine** yazar ve şifreli anahtarı alıcı için kaydeder. Satıcı sonra `withdraw` ile çeker. (NEAR'da kontratlar arası çağrılar asenkron ve ayrı ayrı başarısız olabilir; bu yüzden dış transfer kesinleşmenin içinde değil.)
6. **Tek iade yolu zaman aşımı.** `refund_expired` herkes tarafından çağrılabilir. Hatalı teslimat doğrulamayı geçemediği için ayrı bir anlaşmazlık mekanizması yok.
7. **İptal kuralı.** `cancel_order` yalnızca `Open` durumunda (satıcı teslimat yüklemeden önce). `Delivered` sonrası iptal yok.
8. **Durum makinesi:** `Open → Verifying → Settled`; doğrulama geçmezse ya da sonuç gelmezse `Verifying → Delivered`, satıcı son tarihe kadar yeniden gönderebilir (`Delivered → Verifying`); `Open|Delivered|Verifying → Refunded` (süre); `Open → Cancelled`. Her sipariş yalnızca bir son duruma ulaşır; çift settle/iade engellenir; geç gelen callback yok sayılır.
9. **Doğrulayıcı: NEAR OutLayer (Intel TDX TEE)** — 1 Kasım denemesinden sonra kesinleşti (`spikes/outlayer/REPORT.md`, DECISIONS #11). **Zincir üstü attestation doğrulaması yok ve iddia edilmez:** doğrulama OutLayer TEE'sinde çalışır, kontrat sonucu OutLayer operatörüne güvenerek alır (operatör hesabında full-access anahtarlar var), attestation zincir dışında, sonradan doğrulanabilir. Kendi servisimize göre fark: üçüncü taraf ve sonradan denetlenebilir.
10. **Ajan ayrı bir hesaptır** (`mandate.agent`); kontrat `create_order`/`cancel_order`'da `predecessor == agent` kontrol eder. Limitler kontratta olduğu için ajan anahtarı sızsa bile yalnızca yetki içinde sipariş açılabilir; function-call key ek bir katmandır. `set_mandate`, `revoke_mandate`, `withdraw` 1 yoctoNEAR ister (FC key deposit ekleyemez).
11. **Depolama sahibin depozitosundan ödenir.** `set_mandate` sırasında sahip NEAR depolama depoziti yatırır (NEP-145 mantığı); `create_order` eklediği depolamayı (`env::storage_usage` farkı × byte maliyeti) bu depozitodan düşer, yetmezse ret. `revoke_mandate` kalan depoziti iade eder. Mandate başına açık sipariş üst sınırı (varsayılan 50). `ft_on_transfer` yalnızca mevcut mandate'e yatırım kabul eder.

## Kapsam

- **P0:** tek test token'ı (kendi NEP-141'imiz, testnet), yetki + function-call key, `create_order` ve limit kontrolü, emanet + NFT makbuz, `settle` → iç bakiye, `refund_expired`, `withdraw`, çift işlem engeli, explorer'da ve basit panelde durum. Ajan SDK'sı (TypeScript) ve satıcı SDK'sı.
- **P1:** şifreli teslimat + OutLayer doğrulayıcısı (`submit_delivery` → `on_verified`), zincir dışı attestation doğrulama adımı (README'de), prompt injection demo senaryosu, MCP sunucusu (5 araç: `horkos_search_listings`, `horkos_create_order`, `horkos_get_order`, `horkos_open_delivery`, `horkos_cancel_order`).
- **P2:** NEAR Intents ile çapraz zincir ödeme/iade, sipariş başına alt hesap, alacağın kesinleşmeden devri, x402 uyumluluğu.
- P0 bitmeden P1'e, P1 bitmeden P2'ye geçilmez.

## Demo (90 saniyelik X videosu)

1. Başarılı alışveriş: 5 test-USDC'ye JSON veri; şema kontrolü geçer → Settled.
2. Hatalı teslimat: şemaya uymayan veri; doğrulama geçmez, alıcı veriyi göremez → süre dolunca Refunded.
3. Ele geçirilen ajan: gizli komutla izinsiz satıcıdan 500 test-USDC; kontrat reddeder, sipariş oluşmaz.
(İsteğe bağlı 4.: kod taşeronluğu, test paketinin bir kısmı geçmez.)

## Repo düzeni (planlanan)

```
contracts/horkos/   Rust kontrat (near-sdk, cargo-near)
contracts/test-token/  testnet NEP-141
sdk/                TypeScript ajan + satıcı SDK'sı
mcp/                MCP sunucusu (P1)
verifier/           OutLayer'da çalışan doğrulayıcı WASM (WASI)
spikes/             zaman kutulu denemeler (ürün kodu değil)
app/                basit dApp paneli
demo/               demo satıcıları ve senaryo betikleri
docs/               tasarım belgeleri
```

## Ortam

- WSL Ubuntu-22.04. Proje Windows diskinde: `C:\Users\a\horkos` = WSL'de `~/horkos` (symlink). `CARGO_TARGET_DIR=~/.cache/horkos-target` (`setup.sh` ayarlar).
- Kurulum tamamlandı (28 Ekim): Rust 1.99.1 + wasm32, cargo-near 0.22.0, near-cli-rs 0.30.1, Node 20.20.2 (sistemde ayrıca Node 22 var). Yeniden kurulum: `bash ~/horkos/setup.sh` (Rust, wasm32, cargo-near, near-cli-rs, Node 20).
- API'ler, sürümler ve adresler için dokümanı oku, tahmin etme: NEAR docs, OutLayer docs, NEP-141/171 standartları.

## Belgeler

- `docs/DESIGN.md` — tam tasarım: problem, terimler, yaşam döngüsü, tehdit modeli, kontrat arayüzü, veri modeli, entegrasyon
- `docs/DECISIONS.md` — alınan kararlar ve neden (reddedilen alternatifler dahil)
- `docs/SUBMISSION.md` — başvuru formu cevapları ve X paylaşımı taslağı
- Görsel rapor (diyagramlar): https://claude.ai/artifact/JVW6AKiJHdDt1aq7799m3r
