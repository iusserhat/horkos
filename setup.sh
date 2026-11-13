#!/usr/bin/env bash
# Horkos geliştirme ortamı kurulumu (WSL / Ubuntu)
# Kullanım: bash ~/horkos/setup.sh
# Kurulu olanları atlar; tekrar çalıştırmak güvenlidir.
set -euo pipefail

# Tüm çıktı ~/horkos/setup.log dosyasına da yazılır (Claude kontrol edebilsin diye)
exec > >(tee "$HOME/horkos/setup.log") 2>&1

say() { printf '\n\033[1;36m==> %s\033[0m\n' "$1"; }
have() { command -v "$1" >/dev/null 2>&1; }

say "1/6 Sistem paketleri (sudo şifresi istenebilir)"
sudo apt-get update -y
sudo apt-get install -y build-essential pkg-config libssl-dev libudev-dev curl git jq

say "2/6 Rust"
if ! have rustup; then
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
fi
# shellcheck disable=SC1091
source "$HOME/.cargo/env"
rustup update stable
rustup target add wasm32-unknown-unknown

say "3/6 cargo-near (kontrat derleme ve deploy)"
if ! have cargo-near; then
  curl --proto '=https' --tlsv1.2 -LsSf https://github.com/near/cargo-near/releases/latest/download/cargo-near-installer.sh | sh
fi

say "4/6 near-cli-rs (NEAR komut satırı)"
if ! have near; then
  curl --proto '=https' --tlsv1.2 -LsSf https://github.com/near/near-cli-rs/releases/latest/download/near-cli-rs-installer.sh | sh
fi

say "5/6 Node.js 20 (nvm ile)"
export NVM_DIR="$HOME/.nvm"
if [ ! -s "$NVM_DIR/nvm.sh" ]; then
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
fi
# shellcheck disable=SC1091
source "$NVM_DIR/nvm.sh"
nvm install 20
nvm alias default 20

say "6/6 Derleme hızlandırma: Rust çıktıları WSL diskine"
# Proje Windows diskinde (/mnt/c) duruyor; derleme çıktısını WSL'in
# kendi diskine yazmak derlemeyi belirgin şekilde hızlandırır.
LINE='export CARGO_TARGET_DIR="$HOME/.cache/horkos-target"'
grep -qxF "$LINE" "$HOME/.bashrc" || echo "$LINE" >> "$HOME/.bashrc"
mkdir -p "$HOME/.cache/horkos-target"

say "Kurulum tamam. Sürümler:"
source "$HOME/.cargo/env"
rustc --version
cargo near --version || true
near --version || true
node --version
npm --version
echo
echo "Yeni bir terminal aç ya da şunu çalıştır:  source ~/.bashrc"
