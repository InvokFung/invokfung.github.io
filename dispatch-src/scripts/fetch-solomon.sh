#!/bin/sh
# Fetches a subset of the Solomon VRPTW instances (100 customers) and their
# best-known solutions from the PyVRP instances repository, which keeps them in
# VRPLIB format with BKS under the DIMACS convention (distances truncated to one
# decimal). `npm run eval` reads bench/solomon/ and skips the row if it is empty.
set -e
cd "$(dirname "$0")/../bench/solomon"
BASE="https://raw.githubusercontent.com/PyVRP/Instances/main/VRPTW/Solomon"
for name in C101 C102 C201 C202 R101 R102 R201 R202 RC101 RC102 RC201 RC202; do
  for ext in vrp sol; do
    curl -fsS --retry 2 -m 30 -o "$name.$ext" "$BASE/$name.$ext" || { echo "could not fetch $name.$ext"; rm -f "$name.$ext"; }
  done
done
ls
