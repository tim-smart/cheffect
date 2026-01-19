#!/bin/bash

git fetch origin
git checkout origin/main
direnv allow
corepack install
pnpm install
git submodule update --init --recursive
