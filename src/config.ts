import { readFileSync } from "node:fs";
import type { ParserConfig } from "./types.ts";

const DEFAULT_TIMEZONE_OFFSET_HOURS = 9;
const MIN_TIMEZONE_OFFSET_HOURS = -12;
const MAX_TIMEZONE_OFFSET_HOURS = 14;

export function loadConfig(path: string): ParserConfig {
  const raw = readFileSync(path, "utf-8");
  return validateConfig(JSON.parse(raw));
}

export function validateConfig(data: unknown): ParserConfig {
  if (typeof data !== "object" || data === null) {
    throw new Error("config must be a JSON object");
  }
  const config = data as Partial<ParserConfig>;

  if (
    !Array.isArray(config.participants) ||
    config.participants.length === 0 ||
    !config.participants.every((p) => typeof p === "string" && p.length > 0)
  ) {
    throw new Error(
      "config.participants must be a non-empty array of non-empty strings",
    );
  }
  if (config.timezone !== undefined) {
    if (typeof config.timezone !== "number" || !Number.isFinite(config.timezone)) {
      throw new Error("config.timezone must be a number (UTC offset in hours)");
    }
    if (
      config.timezone < MIN_TIMEZONE_OFFSET_HOURS ||
      config.timezone > MAX_TIMEZONE_OFFSET_HOURS
    ) {
      throw new Error(
        `config.timezone must be between ${MIN_TIMEZONE_OFFSET_HOURS} and ${MAX_TIMEZONE_OFFSET_HOURS}`,
      );
    }
  }

  return {
    participants: [...config.participants],
    timezone: config.timezone ?? DEFAULT_TIMEZONE_OFFSET_HOURS,
  };
}
