#!/bin/bash
set -e
npm install
npx tsx scripts/apply-seed-payment-migration.ts
npm run db:push
