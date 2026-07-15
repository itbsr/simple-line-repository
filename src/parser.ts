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
