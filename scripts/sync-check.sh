#!/usr/bin/env bash
# Silent when this machine matches GitHub; prints only when out of sync.
# Works on both the PC (Git Bash) and the Mac. Run from anywhere in the repo.
cd "$(git rev-parse --show-toplevel)" || exit 1
git fetch --quiet origin || { echo "SYNC: cannot reach GitHub (offline?)"; exit 1; }
branch=$(git rev-parse --abbrev-ref HEAD)
read -r ahead behind < <(git rev-list --left-right --count "HEAD...origin/$branch" 2>/dev/null || echo "0 0")
msgs=()
[ "$behind" -gt 0 ] && msgs+=("BEHIND GitHub by $behind commit(s): run git pull")
[ "$ahead" -gt 0 ] && msgs+=("AHEAD of GitHub by $ahead commit(s): unpushed work, push so the other machine gets it")
[ -n "$(git status --porcelain)" ] && msgs+=("UNCOMMITTED changes: $(git status --porcelain | wc -l | tr -d ' ') file(s), commit+push or the other machine will not have them")
[ "$branch" != "main" ] && msgs+=("on branch '$branch', not main")
if [ ${#msgs[@]} -gt 0 ]; then
  echo "OUT OF SYNC ($(hostname)):"; printf ' - %s\n' "${msgs[@]}"; exit 1
fi
