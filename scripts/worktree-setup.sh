#!/bin/bash

git fetch origin
direnv allow
corepack install
pnpm install
git submodule update --init --recursive
