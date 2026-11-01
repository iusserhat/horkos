# OutLayer denemesi — rapor (1 Kasım 2026)

Süre: ~1,5 saat. Ağ: testnet. Harcanan: ~0,002 NEAR (OutLayer ücreti 0,001 + gas).

## Soru

Kontrat, OutLayer TEE'sinde çalışan doğrulamanın attestation'ını ya da OutLayer imzasını zincir üstünde doğrulayabiliyor mu?

## Kısa cevap

**Hayır, tasarım gereği.** OutLayer çağrı başına zincir üstü quote doğrulamasını bilinçli olarak yapmıyor (gas). Çağıran kontratın callback'ine yalnızca çıktı JSON'u (başarısızlıkta `null`) gelir; imza, TDX quote, kod hash'i, girdi hash'i gelmez. Attestation zincir dışında, sonradan doğrulanır (dashboard, `outlayer-verify`).

Kontratın zincir üstünde kontrol edebildiği:
- Sonucun `outlayer.testnet`'e yaptığı kendi çağrısından geldiği (`#[private]` callback, promise index 0).
- Hangi kodun çalışacağı: `WasmUrl.hash` ile sabitleniyor; worker hash tutmayan dosyayı reddediyor (iddia, belge + kaynak).

Kontratın güvenmek zorunda olduğu:
- `outlayer.testnet` kontratı ve operatörü `worker.outlayer.testnet`. `resolve_execution` yalnızca `operator_id` tarafından çağrılabilir (`assert_operator`).
- **Operatör hesabında 3 full-access anahtar var** (testnet ve mainnet'te aynı: `worker.outlayer.near` 3 full + 3 kısıtlı). TEE worker anahtarları kısıtlı (yalnızca `resolve_execution`…), ama full-access anahtar sahibi (OutLayer ekibi) TEE'den geçmeden sonuç yazabilir. Yani zincir üstü güven = "TEE" değil, "OutLayer operatörü"; TEE iddiası sonradan attestation ile denetlenebilir.

## Ne çalıştı / çalışmadı

| Adım | Durum | Kanıt |
| --- | --- | --- |
| Belge + kaynak okuma (`out-layer/outlayer`, `outlayer-cli`) | ✅ | `contract/src/execution.rs`, `lib.rs::ExecutionResponse` |
| Şema kontrolcüsü WASM (wasm32-wasip1, 121 KB) | ✅ yerelde | `checker/`, sha256 `17ad13a9…38ab` |
| FastFS'e yükleme (`__fastdata_fastfs`, near-cli-rs, legacy keychain) | ✅ zincire girdi | horkos.testnet nonce +1 |
| FastFS'ten indirme | ❌ `test.fastfs.io` her istekte 502 (belgedeki örnek dosya dahil) | testnet altyapı kesintisi |
| Probe kontratı `probe.horkos.testnet` → `request_execution` | ✅ | tx `FTSPH9Q3GfJHNxJyEKwt3GpBkHgRR1eUH3qEoUmvr6x9`, request_id 6134 |
| Worker sonucu yazdı (~5 sn), callback çalıştı | ✅ | `execution_completed` event |
| TEE içinde kodun çalışması | ❌ | `"wasm_url could not be fetched"` → callback'e `null` |

Sonuç: istek → worker → resolve → callback hattı testnet'te canlı. Eksik tek parça WASM'ın worker'ın indirebileceği bir adreste olması.

## Horkos tasarımına etkisi

1. `settle`'ı "doğrulayıcı çağırır" modeli OutLayer'da şöyle olur: Horkos kontratı `request_execution` çağırır, `on_verified` callback'i `settle` mantığını çalıştırır. Kimse dışarıdan `settle` çağırmaz.
2. "Attestation kontratta doğrulanır" README'de iddia edilemez. Doğru ifade: "doğrulama OutLayer TEE'sinde çalışır; kontrat OutLayer operatörüne güvenir; attestation zincir dışında doğrulanabilir."
3. Çıktı ≤ 900 bayt: karar + alıcıya şifreli anahtar + girdi hash'i sığar.
4. Şifre çözme anahtarı TEE'ye OutLayer secrets (WASM hash'ine bağlı) ile gelmeli; büyük veri `input_data` yerine HTTP ile (wasip2) çekilmeli. Bu P1 tasarımı, denenmedi.
5. Yedek servisle karşılaştırma: zincir üstü güven iki durumda da "tek bir operatör". OutLayer'ın farkı, TEE çalışmasının sonradan attestation ile denetlenebilmesi.

## Kalan deneme için seçenekler (kullanıcı kararı)

WASM'ın herkese açık bir URL'de olması gerekiyor:
- (a) testnet FastFS düzelene kadar beklemek (yeni yayın yok; dosya zaten testnet zincirinde),
- (b) GitHub release / gist / IPFS (`ipfs://` destekleniyor) — herkese açık yayın,
- (c) mainnet FastFS (`main.fastfs.io` ayakta) — mainnet işlemi, açık onay gerekir.

Hazır olunca: `near contract call-function as-transaction probe.horkos.testnet set_wasm …` (probe hesabıyla) ve aynı `check` çağrısı.

## Dosyalar

- `checker/` — WASI şema kontrolcüsü
- `probe/` — çağrı + ham callback kaydı yapan test kontratı (`get_records` view)
