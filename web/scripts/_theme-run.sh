#!/bin/bash
# One theme, end to end: restart the dev server under SITE_THEME, warm the
# images, run the light audit over the main public routes, the dark audit
# and the phone audit over the key ones, then take the gallery screenshot.
# usage: bash scripts/_theme-run.sh <theme>   (from web/)
T=$1; LOG=/c/Users/pradi/AppData/Local/Temp/claude/d--technoweb/f8f38b22-40e9-4772-ae7c-9756de8b4caf/scratchpad
PID=$(netstat -ano | grep ":3000 " | grep LISTEN | head -1 | awk '{print $NF}'); [ -n "$PID" ] && taskkill //PID $PID //F >/dev/null 2>&1; sleep 2; rm -rf .next
(SITE_THEME=$T nohup npm run dev > $LOG/dev.log 2>&1 &)
sleep 15; curl -s -o /dev/null -m 300 http://localhost:3000/; curl -s -o /dev/null -m 200 http://localhost:3000/team
for i in 1 2 3; do n=$(npm run warm-images 2>&1 | grep -c 504); [ "$n" = "0" ] && break; done
echo "== $T light" > $LOG/theme-$T.log
MSYS_NO_PATHCONV=1 node scripts/audit.mjs / /solutions /solutions/networking /services /industries /products /products/switches /resources /blog /case-studies /knowledge-base /about /contact /team /clients /certifications /support /careers /gallery /store /search?q=switch /this-page-does-not-exist >> $LOG/theme-$T.log 2>&1; echo "light exit $?" >> $LOG/theme-$T.log
echo "== $T dark" >> $LOG/theme-$T.log
AUDIT_SCHEME=dark MSYS_NO_PATHCONV=1 node scripts/audit.mjs / /solutions/networking /products/switches /team /store /gallery /contact /careers /about >> $LOG/theme-$T.log 2>&1; echo "dark exit $?" >> $LOG/theme-$T.log
echo "== $T mobile" >> $LOG/theme-$T.log
MSYS_NO_PATHCONV=1 node scripts/mobile-audit.mjs / /solutions/networking /products/switches /team /store /gallery /contact /about >> $LOG/theme-$T.log 2>&1; echo "mobile exit $?" >> $LOG/theme-$T.log
ADMIN_LOGIN_EMAIL=probe-session@example.test ADMIN_LOGIN_PASSWORD='Probe-Session-2026!' THEMES=$T node --experimental-strip-types scripts/theme-shots.mjs >> $LOG/theme-$T.log 2>&1
echo "== $T done" >> $LOG/theme-$T.log
