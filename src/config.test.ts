import assert from "node:assert/strict";
import { test } from "node:test";
import { validateConfig } from "./config.ts";

// --- timezone ---

test("defaults timezone to 9 (JST) when omitted", () => {
  const config = validateConfig({ participants: ["自分"] });

  assert.equal(config.timezone, 9);
});

test("keeps an explicit timezone offset", () => {
  const config = validateConfig({ participants: ["自分"], timezone: -5 });

  assert.equal(config.timezone, -5);
});

test("rejects a non-numeric timezone", () => {
  assert.throws(
    () => validateConfig({ participants: ["自分"], timezone: "Asia/Tokyo" }),
    /timezone must be a number/,
  );
});

test("rejects NaN as timezone", () => {
  // NaN is typeof "number" but every comparison with it is false, so a
  // naive range check (timezone < MIN || timezone > MAX) silently lets it
  // through instead of rejecting it.
  assert.throws(
    () => validateConfig({ participants: ["自分"], timezone: NaN }),
    /timezone must be a number/,
  );
});

test("accepts timezone -12 (lower boundary)", () => {
  const config = validateConfig({ participants: ["自分"], timezone: -12 });

  assert.equal(config.timezone, -12);
});

test("rejects timezone -13 (just past the lower boundary)", () => {
  assert.throws(
    () => validateConfig({ participants: ["自分"], timezone: -13 }),
    /timezone must be between -12 and 14/,
  );
});

test("accepts timezone 14 (upper boundary)", () => {
  const config = validateConfig({ participants: ["自分"], timezone: 14 });

  assert.equal(config.timezone, 14);
});

test("rejects timezone 15 (just past the upper boundary)", () => {
  assert.throws(
    () => validateConfig({ participants: ["自分"], timezone: 15 }),
    /timezone must be between -12 and 14/,
  );
});

// --- participants ---

test("rejects an empty participants list", () => {
  assert.throws(
    () => validateConfig({ participants: [] }),
    /participants must be a non-empty array/,
  );
});

test("rejects participants that isn't an array", () => {
  assert.throws(
    () => validateConfig({ participants: "自分" }),
    /participants must be a non-empty array/,
  );
});

test("rejects a participants array containing a non-string element", () => {
  assert.throws(
    () => validateConfig({ participants: ["自分", 123] }),
    /participants must be a non-empty array/,
  );
});

test("rejects a participants array containing an empty string", () => {
  assert.throws(
    () => validateConfig({ participants: ["自分", ""] }),
    /participants must be a non-empty array/,
  );
});

// --- top-level data shape ---

test("rejects config data that isn't an object (null)", () => {
  assert.throws(
    () => validateConfig(null),
    /config must be a JSON object/,
  );
});

test("rejects config data that isn't an object (primitive)", () => {
  assert.throws(
    () => validateConfig("not an object"),
    /config must be a JSON object/,
  );
});
