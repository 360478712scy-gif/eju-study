#!/bin/zsh
# 常驻 Carbon（gemini-4-carbon-high）：应用内所有界面文字由它写。用户 2026-11-18：「应用内文字都交给 Gemini 4 Carbon 去做」。
# 同一个会话接着往下做，不必每次重新读一遍文档；会话编号记在 design/agents/.carbon_conversation。
#   tools/agents/carbon.sh "指令"            追加一条指令（没有会话时新开）
#   CARBON_NEW=1 tools/agents/carbon.sh "…"  另开新会话
set -euo pipefail
cd "$(dirname "$0")/../.."
mkdir -p design/agents
idfile=design/agents/.carbon_conversation
args=(-p "$1" --model "${CARBON_MODEL:-gemini-4-carbon-high}" --dangerously-skip-permissions --output-format json)
[[ -n "${CARBON_ADD_DIR:-}" ]] && args+=(--add-dir "$CARBON_ADD_DIR")
if [[ -s "$idfile" && -z "${CARBON_NEW:-}" ]]; then args+=(--conversation "$(cat "$idfile")"); fi
out=$(agy "${args[@]}")
print -r -- "$out" >> design/agents/carbon.jsonl
print -r -- "$out"
id=$(print -r -- "$out" | python3 -c 'import json,sys
try: print(json.loads(sys.stdin.read()).get("conversation_id",""))
except Exception: print("")')
[[ -n "$id" ]] && print -r -- "$id" > "$idfile"
exit 0
