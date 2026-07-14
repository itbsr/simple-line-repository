import type { DateComponents } from "./types.ts";

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

function pad2(n: number): string {
  return String(n).padStart(2, "0");
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
