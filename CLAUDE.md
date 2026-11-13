# Horkos — Claude Code rehberi

Kullanıcıyla **Türkçe**; kod, commit, README, yorumlar **İngilizce**. Yeni oturum: bu dosya + `docs/PROGRESS.md` yeterli.

## Proje

AI ajanları için emanet (escrow) protokolü: her satın alma, parası kontratta kilitli bir NFT makbuzdur; para satıcıya yalnızca mandate limiti ve makinece doğrulanabilir teslim koşulu sağlanınca geçer, yoksa süre dolunca alıcıya döner. İlke: anlaşmazlığı çözmüyoruz, engelliyoruz.

NEAR Hackathon, son teslim **14 Kasım 23:59 UTC**. Kurallar `HACKATHON.md`; README temiz makinede "do X → see Y" ile tekrarlanabilir olmalı, AI kodu/kütüphaneler listelenir, kökte `LICENSE`. Çalışmayan şey iddia edilmez. Ayrıntı: `docs/DESIGN.md`, `docs/DECISIONS.md`, `docs/SUBMISSION.md`, `docs/TESTNET.md`.

## Kesin kurallar (açık onay olmadan asla)

- Mainnet deploy, mainnet işlem imzalama, token harcama
- Başvuru gönderme (önce tam JSON'u göster), force-push, repoyu açma, X'te paylaşım (normal push serbest: kural 11)
- Anahtar, kurtarma kelimesi, `.env` repoya girmez; kurtarma kelimesi istenmez
- Testnet varsayılan: admin `horkos.testnet`, kontrat `escrow.horkos.testnet`, token `tusdc.horkos.testnet` (anahtarlar `~/.near-credentials/testnet/`)

## Mimari kararlar (ayrıntı DESIGN/DECISIONS)

1. Tek kontrat; fonlar sipariş bazında, NFT (NEP-171) makbuz.
2. Mandate kontratta: limit/satıcı listesi/süre kontratta kontrol edilir; ajan ayrı hesap, FC key yalnızca `create_order`/`cancel_order`.
3. Teslim koşulu makinece kontrol edilebilir (JSON şeması vb.).
4. Şifreli teslimat: `submit_delivery` → OutLayer `request_execution` → `Verifying`; TEE doğrulayıcı anahtarı alıcıya yeniden şifreler.
5. `on_verified` atomik, dış transfer yok: satıcı iç bakiyesi; `withdraw` ayrı.
6. Tek iade yolu zaman aşımı (`refund_expired`, herkes çağırır). İptal yalnızca `Open`.
7. Durumlar: `Open → Verifying → Settled`; `Verifying → Delivered → Verifying`; süre → `Refunded`; `Open → Cancelled`.
8. Doğrulayıcı NEAR OutLayer (TDX); zincir üstü attestation **yok, iddia edilmez**.
9. Depolama sahibin depozitosundan; mandate başına ≤ 50 açık sipariş.

## Ortam

WSL Ubuntu-22.04; `~/horkos` = `C:\Users\a\horkos`. `CARGO_TARGET_DIR=~/.cache/horkos-target`. Rust 1.99.1, cargo-near 0.22.0, near-cli-rs 0.30.1, Node 20. Kurulum: `bash ~/horkos/setup.sh`. API/sürüm tahmin etme; çalışan komutlar `docs/TESTNET.md`'de.

## Çalışma kuralları (token tasarrufu)

1. Dosyayı baştan sona okuma: önce `grep`/`rg`, sonra yalnızca ilgili satırlar. `Cargo.lock`, `package-lock.json`, `node_modules/`, `target/`, `setup.log`, derleme çıktıları asla okunmaz.
2. Testler sessiz: `cargo test -q 2>&1 | tail -20`, `npm test 2>&1 | tail -20`. Uzun loglar dosyaya, gerekirse grep.
3. Değişiklikten sonra yalnızca ilgili test (`cargo test -p horkos <ad>`); tam set commit öncesi bir kez.
4. Dosyaları baştan yazma; yerinde küçük düzenleme.
5. NEAR/OutLayer/near-cli komutlarını bir kez araştır, çalışanı `docs/TESTNET.md`'ye yaz, sonra oradan kullan.
6. Alt ajan kullanma.
7. Rapor ≤ 8 satır: yapılan, çalışan, çalışmayan, kullanıcıdan beklenen. Tablo/kod alıntısı yok; ayrıntı dosyaya.
8. Uzun işler arka planda; beklerken tekrar tekrar kontrol etme.
9. Belirsiz bir şeyde 30 dakikadan fazla deneme yok; dur ve sor.
10. `core.fileMode` false: yeni `.sh` dosyaları git'e çalıştırılabilir kaydedilmez. Her yeni betik için `git update-index --chmod=+x <dosya>`, sonra temiz klonda doğrula.
11. Her büyük adımdan sonra commit + `git push` (repo private; force-push yok, repoyu açmak onay ister).
