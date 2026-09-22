#!/usr/bin/env bash
#
# Whether Vercel should build this commit. Exit 0 skips the build, exit 1 builds it.
#
# Measured 2026-09-22: 600 deployments and 10,596 build minutes in thirty days, 386 of them
# previews of branches nobody opens (their URLs are SSO-gated, nothing in CI reads one, and
# the duplicate deploy workflow has been disabled for months).
#
# This lived inline in vercel.json for one hour and broke every deployment: the schema caps
# `ignoreCommand` at 256 characters, and a deployment that fails validation never reaches a
# build log, so it errors with no output at all. It is a file now, and a file can be tested.
set -u

# A `bisect/` branch is how a change to what gets deployed is proven before it reaches
# production (see the header of .vercelignore). Those keep their preview build; it is the
# only way left to measure a build-configuration change without risking production.
# The commits to compare; a test passes an empty range to get a deterministic answer.
RANGE=${VERCEL_IGNORE_RANGE:-"HEAD^ HEAD"}

case "${VERCEL_GIT_COMMIT_REF:-}" in
  main) ;;
  bisect/*) echo "build: ${VERCEL_GIT_COMMIT_REF} is a deployment experiment"; exit 1 ;;
  *)
    # No previews at all (D21, 2026-09-22). Branches that touched the money pages built one
    # so a rendered page could be walked (D10); no gate ever read those previews, they are
    # SSO-gated so nobody opens them, and thirteen of them ran in one hour at about nineteen
    # minutes each. A preview comes back the day a gate exists that reads it.
    echo "skip: ${VERCEL_GIT_COMMIT_REF:-no branch} is not main"; exit 0 ;;
esac

# Nothing the site serves changed: a tracker line, a lesson, a test, a workflow.
# A git failure (a clone too shallow for HEAD^) leaves the condition false, and builds.
# shellcheck disable=SC2086
if git diff --quiet $RANGE -- . \
  ':(exclude)docs/**' ':(exclude)tasks/**' ':(exclude)tests/**' \
  ':(exclude).github/**' ':(exclude)*.md' 2>/dev/null; then
  echo "skip: only docs, tests or workflows changed"
  exit 0
fi

echo "build"
exit 1
