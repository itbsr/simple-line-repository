export interface ParserConfig {
  participants: string[];
  /** UTC offset in hours (e.g. 9 for JST). Defaults to 9 when omitted. */
  timezone: number;
}

export interface DateComponents {
  year: number;
  month: number;
  day: number;
}

export interface ResolvedMessage {
  date: DateComponents;
  hour: number;
  minute: number;
  username: string;
  content: string;
}

export interface UnresolvedMessage {
  date: null;
  hour: number;
  minute: number;
  username: string;
  content: string;
}

export type ParsedMessage = ResolvedMessage | UnresolvedMessage;

export interface ParseError {
  line: number;
  raw: string;
  reason: string;
}

export interface ParseResult {
  ok: boolean;
  messages: ParsedMessage[];
  errors: ParseError[];
}
