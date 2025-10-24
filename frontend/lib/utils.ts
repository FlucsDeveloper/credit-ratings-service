import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatRating(rating: string, normalized: number): string {
  return `${rating} (${normalized}/21)`;
}

export function getRatingColor(normalized: number): string {
  if (normalized === 0) return "text-gray-500";
  if (normalized <= 4) return "text-green-600 dark:text-green-400";
  if (normalized <= 7) return "text-blue-600 dark:text-blue-400";
  if (normalized <= 10) return "text-yellow-600 dark:text-yellow-400";
  if (normalized <= 16) return "text-orange-600 dark:text-orange-400";
  return "text-red-600 dark:text-red-400";
}

export function getRatingBadgeColor(normalized: number): string {
  if (normalized === 0) return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300";
  if (normalized <= 4) return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
  if (normalized <= 7) return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400";
  if (normalized <= 10) return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400";
  if (normalized <= 16) return "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400";
  return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
}

export function getBucketColor(bucket: string): string {
  if (bucket === "Investment Grade") return "text-green-700 bg-green-100";
  if (bucket === "Speculative") return "text-orange-700 bg-orange-100";
  if (bucket === "Default") return "text-red-700 bg-red-100";
  return "text-gray-700 bg-gray-100";
}

export function getOutlookIcon(outlook: string | null): string {
  if (!outlook) return "→";
  if (outlook === "Positive") return "↗";
  if (outlook === "Negative") return "↘";
  if (outlook === "Stable") return "→";
  return "◇";
}

export function exportToPDF(data: any, companyName: string) {
  // Will implement with jsPDF
  console.log("Exporting to PDF:", companyName, data);
}

export function exportToExcel(data: any, companyName: string) {
  // Will implement with xlsx
  console.log("Exporting to Excel:", companyName, data);
}