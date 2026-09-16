#!/usr/bin/env bash
# Hook Stop: roda `npm run check` quando há mudança não commitada no front.
# Pula se nada mudou desde a última verificação aprovada. Se falhar, devolve
# a saída ao Claude para corrigir; numa segunda falha seguida, só avisa.
set -uo pipefail
input=$(cat)
root=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
cd "$root" || exit 0

paths=(src tests public index.html package.json package-lock.json playwright.config.ts vite.config.ts tsconfig.json eslint.config.js)
changes=$(git status --porcelain -- "${paths[@]}" 2>/dev/null)
[ -z "$changes" ] && exit 0

stamp="$(git rev-parse --git-dir)/claude-check-ok"
fingerprint=$( { git rev-parse HEAD; git diff HEAD -- "${paths[@]}"; git ls-files --others --exclude-standard -- "${paths[@]}" | xargs -r -d '\n' cat; } | sha256sum | cut -d' ' -f1)
[ -f "$stamp" ] && [ "$(cat "$stamp")" = "$fingerprint" ] && exit 0

if output=$(npm run check 2>&1); then
  echo "$fingerprint" > "$stamp"
  exit 0
fi

tail_out=$(printf '%s\n' "$output" | tail -n 40)
if printf '%s' "$input" | grep -q '"stop_hook_active":[[:space:]]*true'; then
  OUT="$tail_out" node -e 'console.log(JSON.stringify({ systemMessage: "npm run check ainda falha depois da tentativa de correção. Revise antes de aprovar.\n" + process.env.OUT }))'
  exit 0
fi
OUT="$tail_out" node -e 'console.log(JSON.stringify({ decision: "block", reason: "npm run check falhou. Corrija antes de encerrar e rode de novo. Saída:\n" + process.env.OUT }))'
