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

if [ "${VERCEL_GIT_COMMIT_REF:-}" != "main" ]; then
  echo "skip: ${VERCEL_GIT_COMMIT_REF:-no branch} is not main"
  exit 0
fi

# Nothing the site serves changed: a tracker line, a lesson, a test, a workflow.
# A git failure (a clone too shallow for HEAD^) leaves the condition false, and builds.
if git diff --quiet HEAD^ HEAD -- . \
  ':(exclude)docs/**' ':(exclude)tasks/**' ':(exclude)tests/**' \
  ':(exclude).github/**' ':(exclude)*.md' 2>/dev/null; then
  echo "skip: only docs, tests or workflows changed"
  exit 0
fi

echo "build"
exit 1
