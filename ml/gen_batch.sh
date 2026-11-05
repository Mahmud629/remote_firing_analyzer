#!/bin/bash
# Render N synthetic scenes with SEED and turn them into training patches.
# usage: ml/gen_batch.sh SEED N   -> /tmp/ds/syn_SEED.{u8,json}
set -e
cd "$(dirname "$0")/.."
D=/tmp/syn_$1
rm -rf $D; mkdir -p $D
python3 ml/render.py $D $2 $1
python3 ml/lists.py synth $D /tmp/ds/syn_$1_list.json
npx jiti ml/extract.ts /tmp/ds/syn_$1_list.json /tmp/ds/syn_$1 --gt-cal
rm -rf $D
