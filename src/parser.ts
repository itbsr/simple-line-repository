import type {
  DateComponents,
  ParseError,
  ParseResult,
  ParsedMessage,
  ParserConfig,
} from "./types.ts";

interface MessageHeaderMatch {
  hour: number;
  minute: number;
  username: string;
  content: string;
}

interface DateHeaderMatch extends DateComponents {
  weekday: string;
}

const DATE_HEADER_PATTERN =
  /^(?<year>20\d{2})\.(?<month>\d{2})\.(?<day>\d{2}) (?<weekday>Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)$/;
const TIME_PREFIX_PATTERN = /^(?<hour>\d{2}):(?<minute>\d{2}) /;
// Confirmed against real LINE data copied from the app: the header
// separator is always a single half-width space.
const SEPARATOR = /^ /;
const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

// Structural match only (does the line have the right shape). Whether the
// date/time is actually a real, self-consistent value is checked separately
// by validateDateHeader/validateTimeComponents — see parse(). This alone is
// NOT enough to treat a line as a genuine date header — see
// matchConfirmedDateHeader, which also requires the next line to look like
// a message header, since a quoted date inside message content is
// byte-identical to a real one.
export function matchDateHeader(line: string): DateHeaderMatch | null {
  const m = DATE_HEADER_PATTERN.exec(line);
  if (!m?.groups) return null;
  return {
    year: Number(m.groups.year),
    month: Number(m.groups.month),
    day: Number(m.groups.day),
    weekday: m.groups.weekday,
  };
}

// A date-header-shaped line only counts as a real date header when the
// line right after it (or end of input) looks like a message header.
// Otherwise it's indistinguishable from a quoted date inside a message's
// content, so it's left for the caller to treat as an ordinary line
// (continuation content, most likely) instead of a day change.
function matchConfirmedDateHeader(
  lines: string[],
  index: number,
  participants: string[],
): DateHeaderMatch | null {
  const match = matchDateHeader(lines[index]);
  if (!match) return null;
  const nextLine = lines[index + 1];
  if (nextLine !== undefined && !matchMessageHeader(nextLine, participants)) {
    return null;
  }
  return match;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function dateValue(d: DateComponents): number {
  return d.year * 10000 + d.month * 100 + d.day;
}

function validateDateHeader(match: DateHeaderMatch): string | null {
  const d = new Date(match.year, match.month - 1, match.day);
  const isRealDate =
    d.getFullYear() === match.year &&
    d.getMonth() === match.month - 1 &&
    d.getDate() === match.day;
  if (!isRealDate) {
    return `存在しない日付です: ${match.year}.${pad2(match.month)}.${pad2(match.day)}`;
  }
  const actualWeekday = WEEKDAYS[d.getDay()];
  if (actualWeekday !== match.weekday) {
    return `曜日が実際の日付と一致しません: ${match.year}.${pad2(match.month)}.${pad2(match.day)} は${actualWeekday}です（${match.weekday}と記載）`;
  }
  return null;
}

function validateTimeComponents(hour: number, minute: number): string | null {
  if (hour > 23) {
    return `時刻の時が不正です(0-23の範囲外): ${pad2(hour)}`;
  }
  if (minute > 59) {
    return `時刻の分が不正です(0-59の範囲外): ${pad2(minute)}`;
  }
  return null;
}

export function matchMessageHeader(
  line: string,
  participants: string[],
): MessageHeaderMatch | null {
  const timeMatch = TIME_PREFIX_PATTERN.exec(line);
  if (!timeMatch?.groups) return null;

  const rest = line.slice(timeMatch[0].length);
  for (const username of participants) {
    if (!rest.startsWith(username)) continue;
    const after = rest.slice(username.length);
    // A separator must follow the username, even for empty content
    // ("17:33 田中太郎 " -> content ""). Without it, a username sitting at
    // the end of an ordinary continuation line (e.g. a pasted schedule
    // row ending in "10:00 自分") would be misread as a new message.
    if (SEPARATOR.test(after)) {
      return {
        hour: Number(timeMatch.groups.hour),
        minute: Number(timeMatch.groups.minute),
        username,
        content: after.slice(1),
      };
    }
  }
  return null;
}

function splitLines(text: string): string[] {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const trimmed = normalized.replace(/\n+$/, "");
  return trimmed.split("\n");
}

export function parse(text: string, config: ParserConfig): ParseResult {
  const lines = splitLines(text);
  const participants = config.participants;

  const messages: ParsedMessage[] = [];
  const errors: ParseError[] = [];
  let currentDate: DateComponents | null = null;
  let lastConfirmedDate: DateComponents | null = null;
  let current: {
    hour: number;
    minute: number;
    username: string;
    contentLines: string[];
  } | null = null;

  const flush = () => {
    if (!current) return;
    const content = current.contentLines.join("\n");
    messages.push(
      currentDate
        ? {
            date: currentDate,
            hour: current.hour,
            minute: current.minute,
            username: current.username,
            content,
          }
        : {
            date: null,
            hour: current.hour,
            minute: current.minute,
            username: current.username,
            content,
          },
    );
    current = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const dateMatch = matchConfirmedDateHeader(lines, i, participants);
    if (dateMatch) {
      const dateError = validateDateHeader(dateMatch);
      if (dateError) {
        errors.push({ line: i + 1, raw: line, reason: dateError });
      } else if (
        lastConfirmedDate &&
        dateValue(dateMatch) < dateValue(lastConfirmedDate)
      ) {
        errors.push({
          line: i + 1,
          raw: line,
          reason: `日付が後退しています: ${lastConfirmedDate.year}.${pad2(lastConfirmedDate.month)}.${pad2(lastConfirmedDate.day)} の次に ${dateMatch.year}.${pad2(dateMatch.month)}.${pad2(dateMatch.day)} は指定できません`,
        });
      } else {
        flush();
        currentDate = {
          year: dateMatch.year,
          month: dateMatch.month,
          day: dateMatch.day,
        };
        lastConfirmedDate = currentDate;
      }
      continue;
    }

    const headerMatch = matchMessageHeader(line, participants);
    if (headerMatch) {
      const timeError = validateTimeComponents(
        headerMatch.hour,
        headerMatch.minute,
      );
      if (timeError) {
        errors.push({ line: i + 1, raw: line, reason: timeError });
      } else {
        flush();
        current = {
          hour: headerMatch.hour,
          minute: headerMatch.minute,
          username: headerMatch.username,
          contentLines: [headerMatch.content],
        };
      }
      continue;
    }

    if (current) {
      current.contentLines.push(line);
      continue;
    }

    errors.push({
      line: i + 1,
      raw: line,
      reason:
        i === 0
          ? "先頭行がメッセージ開始行または日付見出し行ではありません"
          : "メッセージ開始行でも日付行でもなく、継続先のメッセージもありません",
    });
  }
  flush();

  if (errors.length > 0) {
    return { ok: false, messages: [], errors };
  }

  return { ok: true, messages, errors: [] };
}
