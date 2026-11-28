#!/bin/zsh -l
cd "${0:A:h}" || exit 1
if ! command -v node >/dev/null && [[ -r "${NVM_DIR:-$HOME/.nvm}/nvm.sh" ]]; then
  source "${NVM_DIR:-$HOME/.nvm}/nvm.sh"
fi
if ! command -v node >/dev/null || ! command -v cloudflared >/dev/null; then
  print '开房的 Mac 需要 Node.js 22 或更新版本，以及 cloudflared。'
  exit 1
fi
exec node game/https-preview.js --open
