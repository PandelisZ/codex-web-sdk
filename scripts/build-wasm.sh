#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="$ROOT_DIR/packages/codex-web-sdk/src/generated/wasm"
PROFILE="${CARGO_PROFILE:-dev}"
TOOLCHAIN="${RUSTUP_TOOLCHAIN_NAME:-stable-aarch64-apple-darwin}"
CARGO_BIN="$(rustup which cargo --toolchain "$TOOLCHAIN")"
export RUSTC="$(rustup which rustc --toolchain "$TOOLCHAIN")"
export PATH="$HOME/.cargo/bin:$PATH"

run_cargo() {
  "$CARGO_BIN" "$@"
}

if ! command -v wasm-bindgen >/dev/null 2>&1; then
  echo "wasm-bindgen CLI is required. Install it with:" >&2
  echo "cargo install wasm-bindgen-cli --version 0.2.118" >&2
  exit 1
fi

mkdir -p "$OUT_DIR"

ARTIFACT_SUBDIR="debug"
if [[ "$PROFILE" == "release" ]]; then
  ARTIFACT_SUBDIR="release"
  run_cargo build -p codex-web-sdk-wasm --target wasm32-unknown-unknown --release
else
  run_cargo build -p codex-web-sdk-wasm --target wasm32-unknown-unknown
fi

wasm-bindgen \
  "$ROOT_DIR/target/wasm32-unknown-unknown/$ARTIFACT_SUBDIR/codex_web_sdk_wasm.wasm" \
  --out-dir "$OUT_DIR" \
  --target web \
  --typescript
