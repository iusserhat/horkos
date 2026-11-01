# Kararlar ve gerekçeleri

Tarih sırasıyla. Yeni karar alınınca en alta ekle.

| # | Karar | Neden | Reddedilen alternatif |
| --- | --- | --- | --- |
| 1 | Proje: Horkos (ajan siparişleri için emanet + NFT makbuz) | 50 fikir 9 kriterle puanlandı; az kalabalık NFT track'inde küresel ve güncel bir sorunu (ajan ödemelerinde iade/sorumluluk) çözen tek aday | Anahtar Kirala (NEAR OutLayer zaten yapıyor, ToS riski), Hafıza Kasası (Mnemo, Unibase var), yerel fikirler (küçük kitle) |
| 2 | Ana track `nfts`; ek `agents`, `realworld`, `security` | Tahmini başvuru: NFT 12–24, Agent Economy 60–120; aynı 15K $ ödül | `open` (en kalabalıklardan), `business` ve `defi` (zayıf uyum) |
| 3 | İsim: Horkos (Yunan mitolojisinde yemin tanrısı) | "Her ajan alımı bir yemin"; aramada çakışma bulunmadı | Maat, Mitra, Forseti, Janus, Fides (çakışma veya telaffuz) |
| 4 | Tek kontrat + NFT makbuz; sipariş başına alt hesap P2 | NFT basmak para tutan hesap oluşturmaz; her sipariş için hesap açmak maliyet ve karmaşıklık getirir | Her siparişin kendi alt hesabı olması (MVP için) |
| 5 | Limit kontrolü kontratta | Function-call key para ekleyemez, token limiti uygulamaz | "Function-call key mandate'i zorunlu kılar" ifadesi (yanlıştı, düzeltildi) |
| 6 | Adil takas: şifreli teslimat + tarafsız doğrulayıcı | Alıcı dolandırıcılığı: teslimatı alıcı doğrulayamaz | Alıcı onayıyla ödeme serbest bırakma |
| 7 | `settle` atomik, dış transfer yok, iç bakiye + `withdraw` | NEAR'da cross-contract çağrılar asenkron; anahtar açılıp ödeme başarısız olabilirdi | settle içinde `ft_transfer` |
| 8 | Teslim koşulu makine tarafından kontrol edilebilir olmalı | Hash veri doğruluğunu kanıtlamaz; iddia "AI kaliteye karar veriyor" değil "koşul makineyle doğrulanıyor" | AI ile kalite değerlendirmesi |
| 9 | Tek iade yolu zaman aşımı; ayrı anlaşmazlık sistemi yok | Adil takas hatalı teslimatı ödeme öncesi yakalıyor | AI/insan hakemli itiraz katmanı (yol haritasına) |
| 10 | Önce tek test token'ı | NEP-141 akışı yeterince iş; çoklu token ve Intents P2 | İlk demoda çapraz zincir |
| 11 | OutLayer önce, 2 Kasım akşamı karar noktası, yedek: kendi doğrulayıcı servisi | En riskli varsayımı ilk iki günde test etmek | OutLayer'ı son günlere bırakmak |
| 12 | `cancel_order` yalnızca `Open` iken | Teslimattan sonra iptal, satıcının emeğini bedava kullanmaya açar | Her zaman iptal |
| 13 | MCP sunucusu P1 | "Ajanlar nasıl kullanacak" sorusunun en net demosu; AI jüri deneyebilir | Yalnızca SDK |
| 14 | "Protocol" denir, "standard" denmez | Standart olmak için ekosistem kabulü gerekir | NEP olduğunu iddia etmek |
| 15 | Geliştirme WSL'de; proje `C:\Users\a\horkos` ↔ `~/horkos` (symlink) | NEAR Rust araçları Linux'ta sorunsuz; Claude'un dosya erişimi Windows yolu gerektiriyor (UNC yolu kabul edilmedi) | Proje WSL dosya sisteminde (bağlanamadı) |
| 16 | Kod aşamasında Claude Code (WSL); planlama ve rapor claude.ai sohbetinde | Claude Code derleme/test döngüsünü kendi çalıştırabilir | Her derleme çıktısını elle iletmek |
| 17 | Kodlamaya 29 Ekim'de başla (1 Kasım'ı bekleme) | Güncellenen kurallar (Q-001): duyurudan (19 Ekim) itibaren yazılan kod sayılıyor | 1 Kasım'a kadar yalnızca planlama |
| 18 | Testnet'te kal; Intents P2 ve yalnızca mainnet'te küçük tutarla | Testnet-only projeler tüm track'lere uygun (Q-010); Intents'in testnet'i yok (Q-007) | İlk sürümde mainnet |
| 19 | MIT lisans; README'de kütüphaneler ve AI ile üretilen kod listelenir | Q-014 LICENSE dosyası ister; Q-005 açıklama ister | Lisanssız repo |
