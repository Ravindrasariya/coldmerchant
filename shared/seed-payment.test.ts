import assert from "node:assert/strict";
import { test } from "node:test";
import { validateSeedPayment, seedMoneyCents, SeedPaymentValidationError } from "./seed-payment";

test("cash and petty clear the full due without inflating the cash amount", () => {
  assert.deepEqual(validateSeedPayment(63000, 78, 63078), {
    amountCents: 6300000, pettyCents: 7800, totalCents: 6307800,
  });
});

test("blank petty, zero petty and petty-only settlement are valid", () => {
  for (const petty of [undefined, null, "", 0, "0"]) {
    assert.equal(validateSeedPayment("10", petty, 10).pettyCents, 0);
  }
  assert.equal(validateSeedPayment(0, 78, 78).totalCents, 7800);
});

test("rejects zero settlement and payment against zero due", () => {
  assert.throws(() => validateSeedPayment(0, "", 100), SeedPaymentValidationError);
  assert.throws(() => validateSeedPayment(1, 0, 0), SeedPaymentValidationError);
});

test("rejects negative/nonfinite/malformed and overprecision components", () => {
  for (const value of [-1, Infinity, NaN, "Infinity", "1e3", "1oops", {}, true, "", " ", 1.001, "1.001"]) {
    assert.throws(() => validateSeedPayment(value, 1), SeedPaymentValidationError);
  }
  for (const value of [-1, Infinity, NaN, "1oops", {}, true, 0.001]) {
    assert.throws(() => validateSeedPayment(1, value), SeedPaymentValidationError);
  }
});

test("compares combined settlement against exact authoritative due", () => {
  assert.throws(() => validateSeedPayment(63000, 79, 63078), SeedPaymentValidationError);
  assert.throws(() => validateSeedPayment(100, 0.61, "100.60"), SeedPaymentValidationError);
  assert.equal(validateSeedPayment(100, 0.60, "100.60").totalCents, 10060);
  assert.equal(seedMoneyCents(0.29, "Amount"), 29);
});