-- Migration: Make quality column nullable in lots table
-- Task #18: Remove mandatory requirements from Variety, Potato Type, Quality in harvest stock entry
-- Applied: 2026-03-16

ALTER TABLE lots ALTER COLUMN quality DROP NOT NULL;
