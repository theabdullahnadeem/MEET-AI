import { clsx, type ClassValue } from "clsx"
import humanizeDuration from "humanize-duration";
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDuration(seconds: number){
  return humanizeDuration(seconds * 1000, {
    largest:1,
    round: true,
    units: ["h", "m", "s"],
  });
}

/**
 * Escape LIKE/ILIKE metacharacters (%, _, \) so user-supplied search text is
 * matched literally instead of as a wildcard pattern (F-08). PostgreSQL uses
 * backslash as the default LIKE escape character.
 */
export function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (c) => `\\${c}`);
}