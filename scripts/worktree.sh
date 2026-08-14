#!/bin/sh
# Bootstraps one worker's worktree for parallel work
# (docs/standards/parallel-work.md § Isolation: one worktree per worker).
#
# Usage: scripts/worktree.sh <slice-name>
#
# Creates ../avash-<slice> on a new feat/<slice> branch, links pnpm's
# content-addressable store (no reinstall), copies in the three gitignored
# env files, and rewrites their port-bearing values by a deterministic
# offset so N worktrees can run their dev stacks side by side without
# colliding on 5173 / 8787 / 54322.
#
# POSIX sh: this repo is developed on Windows via Git Bash.

set -e

slice="$1"
if [ -z "$slice" ]; then
  echo "Usage: scripts/worktree.sh <slice-name>"
  exit 1
fi

repo_root=$(git rev-parse --show-toplevel)
worktree_dir="$repo_root/../avash-$slice"
branch="feat/$slice"

if [ -e "$worktree_dir" ]; then
  echo "worktree-new: $worktree_dir already exists — remove it first (git worktree remove)."
  exit 1
fi

# A stable offset per slice, derived from the total worktree count
# (including the main checkout, which is why this starts at 10, not 0 —
# block 0 is reserved for the main checkout's own unmodified ports).
existing=$(git -C "$repo_root" worktree list --porcelain | grep -c '^worktree ' || true)
offset=$(( existing * 10 ))

vite_port=$((5173 + offset))
api_port=$((8787 + offset))
db_port=$((54322 + offset))

echo "worktree-new: creating $worktree_dir on $branch (port offset +$offset)"
git -C "$repo_root" worktree add "$worktree_dir" -b "$branch"

( cd "$worktree_dir" && pnpm install )

# Env files git worktree add does not copy (all gitignored, CLAUDE.md § Local env files).
for f in .env apps/api/.dev.vars apps/web/.env; do
  src="$repo_root/$f"
  dest="$worktree_dir/$f"
  if [ -f "$src" ]; then
    cp "$src" "$dest"
  else
    example="$repo_root/$f.example"
    [ -f "$example" ] && cp "$example" "$dest"
  fi
done

# Docker Compose reads a root .env automatically — this is also where
# COMPOSE_PROJECT_NAME lives, so containers and fixed container names
# (`smoke`, `api-parity`) don't collide with the main checkout's.
if [ -f "$worktree_dir/.env" ]; then
  {
    echo ""
    echo "# --- scripts/worktree.sh: per-worktree overrides ---"
    echo "COMPOSE_PROJECT_NAME=avash-$slice"
    echo "POSTGRES_PORT=$db_port"
    echo "DATABASE_URL_LOCAL=postgresql://postgres:postgres@127.0.0.1:$db_port/avash"
  } >> "$worktree_dir/.env"
fi

if [ -f "$worktree_dir/apps/web/.env" ]; then
  sed -i.bak "s#^VITE_PUBLIC_API_BASE_URL=.*#VITE_PUBLIC_API_BASE_URL=http://localhost:$api_port#" \
    "$worktree_dir/apps/web/.env"
  rm -f "$worktree_dir/apps/web/.env.bak"
fi

if [ -f "$worktree_dir/apps/api/.dev.vars" ]; then
  sed -i.bak "s#http://localhost:5173#http://localhost:$vite_port#" \
    "$worktree_dir/apps/api/.dev.vars"
  rm -f "$worktree_dir/apps/api/.dev.vars.bak"
fi

cat <<EOF

worktree-new: ready.
  cd $worktree_dir
  pnpm --filter web dev -- --port $vite_port
  pnpm --filter api dev -- --port $api_port

Remove when the slice lands: git worktree remove $worktree_dir
EOF
