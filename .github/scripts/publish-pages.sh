#!/usr/bin/env bash
# Кладёт собранную игру в ветку gh-pages: publish-pages.sh <подпапка или пусто> <папка сборки> <подпись коммита>
#   подпапка пусто — корень сайта (сборка main); при этом подпапки веток (work, style, b-*) сохраняются;
#   подпапка work / style / b-<ветка> — сборка ветки; остальное содержимое сайта не трогается.
# История gh-pages не копится: каждая публикация — один новый корневой коммит (force-with-lease), старые объекты сервер удаляет сам.
# Права: GITHUB_TOKEN рабочего процесса (contents: write); новых ключей нет.
set -euo pipefail

SLUG="${1:-}"
DIST="$(cd "${2:?нужна папка сборки}" && pwd)"
MSG="${3:-публикация}"
# PUBLISH_URL — только для проверки скрипта на локальном репозитории
URL="${PUBLISH_URL:-https://x-access-token:${GITHUB_TOKEN:?нет GITHUB_TOKEN}@github.com/${GITHUB_REPOSITORY:?нет GITHUB_REPOSITORY}.git}"
WORK="$(mktemp -d)"

for attempt in 1 2 3 4 5; do
  rm -rf "$WORK/site"
  if git ls-remote --exit-code --heads "$URL" gh-pages >/dev/null 2>&1; then
    git clone --quiet --depth 1 --branch gh-pages "$URL" "$WORK/site"
    OLD="$(git -C "$WORK/site" rev-parse HEAD)"
  else
    mkdir -p "$WORK/site"
    git -C "$WORK/site" init --quiet
    OLD=""
  fi
  cd "$WORK/site"
  git config user.name "github-actions[bot]"
  git config user.email "41898282+github-actions[bot]@users.noreply.github.com"

  if [ -z "$SLUG" ]; then
    # корень: всё, кроме подпапок веток и служебной папки .git
    find . -mindepth 1 -maxdepth 1 ! -name .git ! -name work ! -name style ! -name 'b-*' -exec rm -rf {} +
    cp -R "$DIST"/. .
  else
    rm -rf "./$SLUG"
    mkdir -p "./$SLUG"
    cp -R "$DIST"/. "./$SLUG/"
  fi
  touch .nojekyll

  git add -A
  TREE="$(git write-tree)"
  COMMIT="$(git commit-tree "$TREE" -m "$MSG")" # корневой коммит без родителей
  if git push --quiet --force-with-lease="gh-pages:${OLD}" "$URL" "${COMMIT}:refs/heads/gh-pages"; then
    echo "Опубликовано: ${SLUG:-корень} (попытка $attempt)"
    exit 0
  fi
  echo "Ветка gh-pages изменилась во время публикации, повтор $attempt из 5"
  sleep $((attempt * 5))
done
echo "Не удалось опубликовать за 5 попыток" >&2
exit 1
