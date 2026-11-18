#!/bin/zsh
# 用 codex 的出图工具生成一张场景图：gen.sh <名字> "<提示词>"
name=$1; prompt=$2
dir=_jobs/$name; rm -rf $dir; mkdir -p $dir
inst="Use your image generation tool to create exactly ONE image. Landscape orientation, 3:2 aspect ratio, the largest size available. Prompt:

$prompt

After the image is generated, copy the PNG file into the current working directory as ./out.png. Do nothing else and do not edit the prompt."
print -r -- "$inst" | codex exec -m gpt-6.2-sol -c model_reasoning_effort=\"high\" --skip-git-repo-check --ephemeral -s workspace-write --json -C $dir - > $dir/log.jsonl 2>&1
if [[ -f $dir/out.png ]]; then cp $dir/out.png $name.png; else
  tid=$(grep -m1 -o '"thread_id":"[^"]*"' $dir/log.jsonl | cut -d'"' -f4)
  f=$(ls -t ~/.codex/generated_images/$tid/*.png 2>/dev/null | head -1); [[ -n $f ]] && cp $f $name.png
fi
[[ -f $name.png ]] && print "$name ok $(sips -g pixelWidth -g pixelHeight $name.png | tail -2 | awk '{print $2}' | tr '\n' 'x')" || print "$name FAILED"
