#!/bin/zsh
# GPT（codex CLI，gpt-6.2-astra xhigh）跑一份委托书。用户 2026-11-18：代码与知识内容交给 GPT；不用重置卡，超了直接用现有额度。
#   tools/agents/gpt.sh <name> <brief.md>     新开会话执行委托书，会话编号记在 design/agents/<name>.thread
#   tools/agents/gpt.sh <name> - "追加指令"   在同一会话里继续
# 日志：design/agents/<name>.jsonl，最后一条回复：design/agents/<name>.last.md
set -uo pipefail
cd "$(dirname "$0")/../.."
name=$1; brief=$2; extra=${3:-}
dir=design/agents; mkdir -p $dir
log=$dir/$name.jsonl; last=$dir/$name.last.md; tfile=$dir/$name.thread
model=${GPT_MODEL:-gpt-6.2-astra}; effort=${GPT_EFFORT:-xhigh}
common=(-m $model -c web_search=\"live\" -c model_reasoning_effort=\"$effort\" --dangerously-bypass-approvals-and-sandbox --skip-git-repo-check --json -o $last)
run() {
  if [[ -s $tfile && ( $brief == - || -n ${RESUME:-} ) ]]; then
    codex exec resume $(cat $tfile) $common ${1} >> $log 2>&1 < /dev/null
  else
    codex exec $common - < $brief >> $log 2>&1
  fi
}
prompt=${extra:-继续完成委托书里还没做完的部分。}
attempt=0
while true; do
  attempt=$((attempt+1))
  if [[ $brief == - || $attempt -gt 1 ]]; then run "$prompt"; else run; fi
  code=$?
  tid=$(grep -m1 -o '"thread_id":"[^"]*"' $log | tail -1 | cut -d'"' -f4)
  [[ -n $tid && ! -s $tfile ]] && print -r -- $tid > $tfile
  if (( code != 0 )) && tail -c 4000 $log | grep -q -i -E 'usage.?limit|rate.?limit|usageLimitExceeded|429'; then
    node tools/agents/limits.mjs read >> $dir/limits.log 2>&1
    (( attempt > 3 )) && break
    sleep 120; brief=-; prompt="刚才因为额度中断了。接着上次停下的地方继续完成委托书。"; continue
  fi
  break
done
print "exit=$code thread=$(cat $tfile 2>/dev/null)"
