import clsx, { type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cx(...args: ClassValue[]) {
  return twMerge(clsx(...args));
}

export const focusInput = [
  "focus:ring-1",
  "focus:ring-oc-border-strong",
  "focus:border-oc-strong",
];

export const focusRing = [
  "outline outline-offset-2 outline-0 focus-visible:outline-1",
  "outline-oc-strong",
];

export const hasErrorInput = [
  "ring-2",
  "border-red-500 dark:border-red-700",
  "ring-red-200 dark:ring-red-700/30",
];
