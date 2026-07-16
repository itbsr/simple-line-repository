import assert from "node:assert/strict";
import { test } from "node:test";
import { validateConfig } from "./config.ts";
import { parse } from "./parser.ts";

const config = validateConfig({
  participants: ["自分", "田中太郎"],
  timezone: 9,
});

// --- parse(): happy-path parsing ---

test("parses a date header followed by multiple messages", () => {
  const text = [
    "2026.06.01 Monday",
    "09:00 田中太郎 おはようございます",
    "09:05 自分 おはようございます、本日もよろしくお願いします",
  ].join("\n");

  const result = parse(text, config);

  assert.equal(result.ok, true);
  assert.equal(result.errors.length, 0);
  assert.deepEqual(result.messages, [
    {
      date: { year: 2026, month: 6, day: 1 },
      hour: 9,
      minute: 0,
      username: "田中太郎",
      content: "おはようございます",
    },
    {
      date: { year: 2026, month: 6, day: 1 },
      hour: 9,
      minute: 5,
      username: "自分",
      content: "おはようございます、本日もよろしくお願いします",
    },
  ]);
});

test("joins multi-line message content until the next header", () => {
  const text = [
    "2026.06.01 Monday",
    "09:00 田中太郎 会社のご案内です。",
    "",
    "以下の通りご確認ください。",
    "・日時：6/10 10:00",
    "09:10 自分 承知しました",
  ].join("\n");

  const result = parse(text, config);

  assert.equal(result.ok, true);
  assert.equal(result.messages.length, 2);
  assert.equal(
    result.messages[0].content,
    ["会社のご案内です。", "", "以下の通りご確認ください。", "・日時：6/10 10:00"].join(
      "\n",
    ),
  );
});

test("supports multiple date blocks in one paste", () => {
  const text = [
    "2026.06.01 Monday",
    "09:00 田中太郎 おはよう",
    "2026.06.02 Tuesday",
    "10:00 自分 昨日はありがとうございました",
  ].join("\n");

  const result = parse(text, config);

  assert.equal(result.ok, true);
  assert.equal(result.messages.length, 2);
  assert.deepEqual(result.messages[0].date, { year: 2026, month: 6, day: 1 });
  assert.deepEqual(result.messages[1].date, { year: 2026, month: 6, day: 2 });
});

test("returns an unresolved (date: null) message when the paste starts mid-day, before any date header", () => {
  const text = [
    "09:00 田中太郎 続きです",
    "2026.06.02 Tuesday",
    "10:00 自分 了解です",
  ].join("\n");

  const result = parse(text, config);

  assert.equal(result.ok, true);
  assert.equal(result.messages.length, 2);
  assert.equal(result.messages[0].date, null);
  assert.equal(result.messages[0].username, "田中太郎");
  assert.equal(result.messages[0].content, "続きです");
  assert.deepEqual(result.messages[1].date, { year: 2026, month: 6, day: 2 });
});

test("returns all messages as unresolved when no date header ever appears", () => {
  const text = ["09:00 田中太郎 おはよう", "09:05 自分 おはようございます"].join(
    "\n",
  );

  const result = parse(text, config);

  assert.equal(result.ok, true);
  assert.equal(result.messages.length, 2);
  assert.equal(result.messages[0].date, null);
  assert.equal(result.messages[1].date, null);
});

// --- splitLines(): line-ending normalization ---

test("normalizes CRLF line endings", () => {
  const text = ["2026.06.01 Monday", "09:00 田中太郎 hello"].join("\r\n");

  const result = parse(text, config);

  assert.equal(result.ok, true);
  assert.equal(result.messages.length, 1);
});

test("normalizes lone CR line endings", () => {
  const text = ["2026.06.01 Monday", "09:00 田中太郎 hello"].join("\r");

  const result = parse(text, config);

  assert.equal(result.ok, true);
  assert.equal(result.messages.length, 1);
});

test("strips all trailing blank lines, not just one", () => {
  const withTrailingBlank = parse("09:00 田中太郎 hello\n\n", config);
  const withoutTrailingBlank = parse("09:00 田中太郎 hello", config);

  assert.equal(withTrailingBlank.ok, true);
  assert.deepEqual(withTrailingBlank.messages, withoutTrailingBlank.messages);
});

test("accepts a paste that ends at a date boundary even with trailing blank lines", () => {
  const text = "09:00 田中太郎 今日はここまでです\n2026.06.02 Tuesday\n\n";

  const result = parse(text, config);

  assert.equal(result.ok, true);
  assert.equal(result.messages.length, 1);
});

// --- matchConfirmedDateHeader(): a date-header-shaped line only counts as a
// real date header when the next line (or EOF) looks like a message header;
// otherwise it's treated as an ordinary line (most likely continuation
// content of an open message) rather than a day change ---

test("accepts a paste that starts directly with a date header", () => {
  const text = ["2026.06.01 Monday", "09:00 田中太郎 おはよう"].join("\n");

  const result = parse(text, config);

  assert.equal(result.ok, true);
  assert.equal(result.messages.length, 1);
});

test("accepts a paste that is only a date header, producing zero messages", () => {
  // Nothing to reject here per the first-line/EOF rules, but callers (the
  // future storage/CLI layer) should treat an empty messages array as "no
  // new data", not silently assume something was imported.
  const result = parse("2026.06.01 Monday", config);

  assert.equal(result.ok, true);
  assert.equal(result.errors.length, 0);
  assert.equal(result.messages.length, 0);
});

test("rejects when the first line is neither a message header nor a date header", () => {
  const text = ["よろしくお願いします", "09:00 田中太郎 おはよう"].join("\n");

  const result = parse(text, config);

  assert.equal(result.ok, false);
  assert.equal(result.messages.length, 0);
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].line, 1);
});

test("rejects a date-header-shaped first line whose next line isn't a message header (nothing to attach it to)", () => {
  // Line 1 fails to be confirmed as a date header (its next line isn't a
  // message header) and isn't a message header itself, so no message ever
  // opens; line 2 then has nothing to attach to either, cascading into a
  // second error.
  const text = ["2026.06.02 Tuesday", "よろしくお願いします"].join("\n");

  const result = parse(text, config);

  assert.equal(result.ok, false);
  assert.equal(result.errors.length, 2);
  assert.equal(result.errors[0].line, 1);
});

test("treats a date-header-shaped line not followed by a message header as continuation content, not a day change", () => {
  // "2026.06.02 Tuesday" looks exactly like a real date header, but the
  // line after it is ordinary prose, not a message header, so it can't be
  // distinguished from a date quoted inside 田中太郎's message. It's folded
  // into that message's content instead of being treated as a day change
  // (and instead of rejecting the whole parse, which is what a plain
  // "the next line must be a message header" rule would otherwise do).
  const text = [
    "09:00 田中太郎 おはよう",
    "2026.06.02 Tuesday",
    "本日はよろしくお願いします",
  ].join("\n");

  const result = parse(text, config);

  assert.equal(result.ok, true);
  assert.equal(result.messages.length, 1);
  assert.equal(result.messages[0].date, null);
  assert.equal(
    result.messages[0].content,
    ["おはよう", "2026.06.02 Tuesday", "本日はよろしくお願いします"].join("\n"),
  );
});

test("accepts a paste that ends right at a date boundary (date header with nothing after it)", () => {
  const text = ["09:00 田中太郎 今日はここまでです", "2026.06.02 Tuesday"].join(
    "\n",
  );

  const result = parse(text, config);

  assert.equal(result.ok, true);
  assert.equal(result.errors.length, 0);
  assert.equal(result.messages.length, 1);
  assert.equal(result.messages[0].content, "今日はここまでです");
});

test("rejects empty input", () => {
  const result = parse("", config);

  assert.equal(result.ok, false);
  assert.equal(result.errors[0].line, 1);
});

// --- matchMessageHeader() / SEPARATOR: false-positive prevention ---

test("does not treat a participant-name prefix without a trailing separator as a header", () => {
  const prefixConfig = validateConfig({
    participants: ["自分", "田中"],
    timezone: 9,
  });

  // "田中" is a prefix of "田中太郎ではありません" but is not followed by a
  // separator, so this must not be recognized as a message header.
  const text = [
    "09:00 田中太郎ではありません、継続テキストです",
    "2026.06.02 Tuesday",
    "10:00 自分 了解です",
  ].join("\n");

  const result = parse(text, prefixConfig);

  assert.equal(result.ok, false);
  assert.equal(result.errors[0].line, 1);
});

test("does not treat a bare username at the end of a line as a new header", () => {
  // "10:00 自分" ends exactly at the username, with no separator/content
  // after it, so it must stay a continuation line of the open message
  // rather than being misread as a new (empty-content) message header.
  const text = [
    "09:00 田中太郎 資料の確認をお願いします",
    "10:00 自分",
    "09:10 自分 確認しました",
  ].join("\n");

  const result = parse(text, config);

  assert.equal(result.ok, true);
  assert.equal(result.messages.length, 2);
  assert.equal(
    result.messages[0].content,
    ["資料の確認をお願いします", "10:00 自分"].join("\n"),
  );
  assert.equal(result.messages[1].username, "自分");
  assert.equal(result.messages[1].content, "確認しました");
});

test("does not treat a participant name immediately followed by a suffix (no separator) as a header", () => {
  // "田中太郎様" is the participant name plus an honorific with no space in
  // between, so this must stay a continuation line rather than being
  // misread as a new message from 田中太郎 with content "様、ご確認をお願いします".
  const text = [
    "09:00 田中太郎 資料の件について",
    "10:00 田中太郎様、ご確認をお願いします",
    "09:10 自分 承知しました",
  ].join("\n");

  const result = parse(text, config);

  assert.equal(result.ok, true);
  assert.equal(result.messages.length, 2);
  assert.equal(
    result.messages[0].content,
    ["資料の件について", "10:00 田中太郎様、ご確認をお願いします"].join("\n"),
  );
});

test("accepts an empty-string message body (separator present, nothing after it)", () => {
  const result = parse("17:33 田中太郎 ", config);

  assert.equal(result.ok, true);
  assert.equal(result.messages[0].content, "");
});

// --- validateTimeComponents(): hour/minute range ---

test("accepts hour 0 (lower boundary, midnight)", () => {
  const result = parse("00:00 田中太郎 おはようございます", config);

  assert.equal(result.ok, true);
  assert.equal(result.messages[0].hour, 0);
});

test("accepts hour 23 (upper boundary)", () => {
  const result = parse("23:00 田中太郎 遅くにすみません", config);

  assert.equal(result.ok, true);
  assert.equal(result.messages[0].hour, 23);
});

test("rejects hour 24 (just past the upper boundary)", () => {
  const result = parse("24:00 田中太郎 hello", config);

  assert.equal(result.ok, false);
  assert.match(result.errors[0].reason, /時が不正/);
});

test("accepts minute 0 (lower boundary)", () => {
  const result = parse("09:00 田中太郎 hello", config);

  assert.equal(result.ok, true);
  assert.equal(result.messages[0].minute, 0);
});

test("accepts minute 59 (upper boundary)", () => {
  const result = parse("09:59 田中太郎 hello", config);

  assert.equal(result.ok, true);
  assert.equal(result.messages[0].minute, 59);
});

test("rejects minute 60 (just past the upper boundary)", () => {
  const result = parse("09:60 田中太郎 hello", config);

  assert.equal(result.ok, false);
  assert.match(result.errors[0].reason, /分が不正/);
});

// --- validateDateHeader(): calendar validity and weekday consistency ---

test("rejects month 00", () => {
  const text = ["2026.00.15 Thursday", "09:00 田中太郎 hello"].join("\n");

  const result = parse(text, config);

  assert.equal(result.ok, false);
  assert.match(result.errors[0].reason, /存在しない日付/);
});

test("accepts month 01 (January, lower boundary)", () => {
  // 2026-01-01 is really a Thursday.
  const text = ["2026.01.01 Thursday", "09:00 田中太郎 hello"].join("\n");

  const result = parse(text, config);

  assert.equal(result.ok, true);
  assert.deepEqual(result.messages[0].date, { year: 2026, month: 1, day: 1 });
});

test("accepts month 12 (December, upper boundary)", () => {
  // 2026-12-01 is really a Tuesday.
  const text = ["2026.12.01 Tuesday", "09:00 田中太郎 hello"].join("\n");

  const result = parse(text, config);

  assert.equal(result.ok, true);
  assert.deepEqual(result.messages[0].date, { year: 2026, month: 12, day: 1 });
});

test("rejects month 13 (just past the upper boundary)", () => {
  const text = ["2026.13.01 Thursday", "09:00 田中太郎 hello"].join("\n");

  const result = parse(text, config);

  assert.equal(result.ok, false);
  assert.match(result.errors[0].reason, /存在しない日付/);
});

test("rejects day 00", () => {
  const text = ["2026.06.00 Monday", "09:00 田中太郎 hello"].join("\n");

  const result = parse(text, config);

  assert.equal(result.ok, false);
  assert.match(result.errors[0].reason, /存在しない日付/);
});

test("accepts day 01 (lower boundary)", () => {
  // 2026-07-01 is really a Wednesday.
  const text = ["2026.07.01 Wednesday", "09:00 田中太郎 hello"].join("\n");

  const result = parse(text, config);

  assert.equal(result.ok, true);
  assert.deepEqual(result.messages[0].date, { year: 2026, month: 7, day: 1 });
});

test("rejects day 32", () => {
  const text = ["2026.01.32 Thursday", "09:00 田中太郎 hello"].join("\n");

  const result = parse(text, config);

  assert.equal(result.ok, false);
  assert.match(result.errors[0].reason, /存在しない日付/);
});

test("rejects day 31 for a 30-day month (June)", () => {
  // June only has 30 days; this must be rejected on a per-month basis, not
  // just against a fixed "day > 31" ceiling.
  const text = ["2026.06.31 Wednesday", "09:00 田中太郎 hello"].join("\n");

  const result = parse(text, config);

  assert.equal(result.ok, false);
  assert.match(result.errors[0].reason, /存在しない日付/);
});

test("accepts day 31 for a 31-day month (July)", () => {
  // 2026-07-31 is really a Friday.
  const text = ["2026.07.31 Friday", "09:00 田中太郎 hello"].join("\n");

  const result = parse(text, config);

  assert.equal(result.ok, true);
  assert.deepEqual(result.messages[0].date, { year: 2026, month: 7, day: 31 });
});

test("accepts a real leap-day date", () => {
  // 2028 is a leap year, and 2028-02-29 really is a Tuesday.
  const text = ["2028.02.29 Tuesday", "09:00 田中太郎 hello"].join("\n");

  const result = parse(text, config);

  assert.equal(result.ok, true);
  assert.deepEqual(result.messages[0].date, { year: 2028, month: 2, day: 29 });
});

test("rejects a date that does not exist on the calendar", () => {
  // 2026 is not a leap year, so 2026-02-29 does not exist.
  const text = ["2026.02.29 Sunday", "09:00 田中太郎 hello"].join("\n");

  const result = parse(text, config);

  assert.equal(result.ok, false);
  assert.match(result.errors[0].reason, /存在しない日付/);
});

test("rejects a date whose weekday does not match reality", () => {
  // 2026-06-01 is really a Monday, not a Tuesday.
  const text = ["2026.06.01 Tuesday", "09:00 田中太郎 hello"].join("\n");

  const result = parse(text, config);

  assert.equal(result.ok, false);
  assert.match(result.errors[0].reason, /曜日/);
});

// --- parse(): date monotonicity across confirmed date headers ---

test("accepts consecutive date headers that move forward", () => {
  const text = [
    "2026.06.01 Monday",
    "09:00 田中太郎 hello",
    "2026.06.02 Tuesday",
    "09:10 自分 world",
  ].join("\n");

  const result = parse(text, config);

  assert.equal(result.ok, true);
  assert.deepEqual(result.messages[1].date, { year: 2026, month: 6, day: 2 });
});

test("accepts the same date repeated (not a backward jump)", () => {
  const text = [
    "2026.06.01 Monday",
    "09:00 田中太郎 hello",
    "2026.06.01 Monday",
    "09:10 自分 world",
  ].join("\n");

  const result = parse(text, config);

  assert.equal(result.ok, true);
  assert.equal(result.errors.length, 0);
});

test("rejects a confirmed date header that jumps backward in time", () => {
  // 2026-06-10 is really a Wednesday, 2026-06-05 a Friday, so both headers
  // are individually well-formed -- the problem is only that the second one
  // moves earlier than the first, which a real single LINE paste can't do.
  const text = [
    "2026.06.10 Wednesday",
    "09:00 田中太郎 hello",
    "2026.06.05 Friday",
    "09:10 自分 world",
  ].join("\n");

  const result = parse(text, config);

  assert.equal(result.ok, false);
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].line, 3);
  assert.match(result.errors[0].reason, /後退/);
});

test("known limitation: a forward-jumping quoted date followed by a real message header still misreads as a day change", () => {
  // This is the residual gap accepted in issue #4: a quoted date inside
  // message content that (a) has a coincidentally-correct weekday and (b)
  // is immediately followed by a real message header is indistinguishable
  // from a genuine multi-day gap, since forward jumps are always valid in
  // real chat history. Accepted as an inherent limitation of parsing plain
  // pasted text rather than something monotonicity checking can catch.
  //
  // The full consequence is two-fold: message 2 gets the wrong date (6/10
  // instead of the real 6/1), AND the quoted date line is consumed as a
  // header, silently vanishing from message 1's stored content instead of
  // remaining part of what was actually written.
  const text = [
    "2026.06.01 Monday",
    "09:00 田中太郎 面接日程のご連絡です。",
    "2026.06.10 Wednesday",
    "09:10 自分 承知しました",
  ].join("\n");

  const result = parse(text, config);

  assert.equal(result.ok, true);
  assert.equal(result.messages.length, 2);
  assert.deepEqual(result.messages[0].date, { year: 2026, month: 6, day: 1 });
  assert.equal(result.messages[0].content, "面接日程のご連絡です。");
  assert.deepEqual(result.messages[1].date, { year: 2026, month: 6, day: 10 });
});

// --- parse(): error collection across multiple lines ---

test("collects multiple independent errors instead of stopping at the first", () => {
  const text = [
    "24:00 田中太郎 hello",
    "2026.06.01 Monday",
    "09:60 自分 world",
  ].join("\n");

  const result = parse(text, config);

  assert.equal(result.ok, false);
  assert.equal(result.errors.length, 2);
  assert.equal(result.errors[0].line, 1);
  assert.match(result.errors[0].reason, /時が不正/);
  assert.equal(result.errors[1].line, 3);
  assert.match(result.errors[1].reason, /分が不正/);
});

test("a semantically-rejected header leaves no message open, so a following plain line also errors", () => {
  // The invalid hour on line 1 means no message is opened; "foo" on line 2
  // then has no open message to attach to as a continuation, producing a
  // second, distinct error rather than being silently absorbed.
  const text = ["25:00 田中太郎 hello", "foo"].join("\n");

  const result = parse(text, config);

  assert.equal(result.ok, false);
  assert.equal(result.errors.length, 2);
  assert.equal(result.errors[0].line, 1);
  assert.match(result.errors[0].reason, /時が不正/);
  assert.equal(result.errors[1].line, 2);
  assert.match(result.errors[1].reason, /継続先/);
});
