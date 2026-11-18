#!/usr/bin/env bash
# 在服务器上以 haokee 用户执行：部署信令服务（root 引导之后）。
set -euo pipefail
ROOT="$HOME/apps/crazyshoot-signal"
UNIT_DIR="$HOME/.config/systemd/user"
mkdir -p "$ROOT" "$UNIT_DIR"
cp "$(dirname "$0")/../dist-signal/server.cjs" "$ROOT/server.cjs"
cp "$(dirname "$0")/systemd/crazyshoot-signal.service" "$UNIT_DIR/crazyshoot-signal.service"
systemctl --user daemon-reload
systemctl --user enable --now crazyshoot-signal.service
systemctl --user --no-pager status crazyshoot-signal.service | head -20
