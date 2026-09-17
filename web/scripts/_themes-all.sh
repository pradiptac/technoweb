#!/bin/bash
# The four new themes, one after another, each through _theme-run.sh.
cd /d/technoweb/web
for T in enterprise summit horizon canvas; do bash scripts/_theme-run.sh $T; done
echo ALL_DONE > /c/Users/pradi/AppData/Local/Temp/claude/d--technoweb/f8f38b22-40e9-4772-ae7c-9756de8b4caf/scratchpad/themes-all.done
