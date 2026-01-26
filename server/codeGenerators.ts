/**
 * Code generation utilities for unique business IDs
 * Format patterns:
 * - Merchant: MRYYYYMMDD{seq} - globally unique
 * - Buyer: BYYYYYMMDD{seq} - unique per merchant
 * - Cash Flow: CFYYYYMMDD{seq} - unique per merchant
 */

/**
 * Format a date as YYYYMMDD string with proper zero-padding
 */
export function formatDateForCode(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

/**
 * Generate merchant code: MRYYYYMMDD{seq}
 * Globally unique - seq is ever-increasing based on all merchants created on that date
 */
export function generateMerchantCode(dateStr: string, existingCount: number): string {
  const seq = existingCount + 1;
  return `MR${dateStr}${seq}`;
}

/**
 * Generate buyer code: BYYYYYMMDD{seq}
 * Unique per merchant - seq is based on buyers for that merchant created on that date
 */
export function generateBuyerCode(dateStr: string, existingCount: number): string {
  const seq = existingCount + 1;
  return `BY${dateStr}${seq}`;
}

/**
 * Generate cash flow code: CFYYYYMMDD{seq}
 * Unique per merchant - seq is based on all cash entries for that merchant created on that date
 */
export function generateTransactionCode(dateStr: string, existingCount: number): string {
  const seq = existingCount + 1;
  return `CF${dateStr}${seq}`;
}

/**
 * Parse date string to get YYYYMMDD format
 * Accepts ISO date string (YYYY-MM-DD) or Date object
 */
export function parseDateToCodeFormat(input: string | Date): string {
  if (input instanceof Date) {
    return formatDateForCode(input);
  }
  // Handle ISO date string YYYY-MM-DD
  const parts = input.split('-');
  if (parts.length === 3) {
    const [year, month, day] = parts;
    return `${year}${month.padStart(2, '0')}${day.padStart(2, '0')}`;
  }
  // Fallback to today
  return formatDateForCode(new Date());
}
