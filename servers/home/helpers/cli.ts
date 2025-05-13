/**
 * Disable certain logs from appearing in CLI output. ALL silences everything.
 * @param ns The Netscript API object.
 * @param logs Log types to disable.
 */
export function disable_logs(ns: NS, logs: string[]): void {
  for (var i in logs) {
    ns.disableLog(logs[i]);
  }
}

/**
 * Command log and optional toast message with one command
 * @param ns The Netscript API object.
 * @param message The message to log/toast.
 * @param prefix Display toast message with this at the start (eg. "c2c").
 * @param variant Type of the toast message (default "info").
 */
export function notify(
  ns: NS,
  message: string,
  prefix?: string,
  variant: 'success' | 'warning' | 'error' | 'info' = 'info'
): void {
  if (!message) return;

  // Add timestamp to print calls
  const timestamp: string = new Date().toLocaleTimeString('et');
  ns.print(`[${timestamp}] ${message}`);

  // Only show toast if prefix is provided
  if (prefix) {
    ns.toast(prefix + ': ' + message, variant);
  }
}

/**
 * Formats a number to abbreviated notation (K, M, B, T)
 * @param value The value to format.
 * @param decimals Number of decimal places to show (defaults to 1).
 * @return Formatted string.
 */
export function formatNumber(
  value: number | null | undefined,
  decimals: number = 1
): string {
  if (value === null || value === undefined || isNaN(value)) {
    return '0';
  }

  // Handle negative values
  const isNegative: boolean = value < 0;
  const absValue: number = Math.abs(value);

  let result: string;

  if (absValue >= 1e12) {
    // 1 trillion
    result = `${(absValue / 1e12).toFixed(decimals)}T`;
  } else if (absValue >= 1e9) {
    // 1 billion
    result = `${(absValue / 1e9).toFixed(decimals)}B`;
  } else if (absValue >= 1e6) {
    // 1 million
    result = `${(absValue / 1e6).toFixed(decimals)}M`;
  } else if (absValue >= 1e3) {
    // 1 thousand
    result = `${(absValue / 1e3).toFixed(decimals)}K`;
  } else {
    result = absValue.toFixed(decimals);
  }

  // Remove trailing zeros after decimal point
  // Example: "1.500T" becomes "1.5T", "1.00" becomes "1"
  result = result.replace(/\.0+([KMBT])?$/, '$1');
  result = result.replace(/(\.\d*?[1-9])0+([KMBT])?$/, '$1$2'); // Remove trailing zeros after a non-zero digit

  return `${isNegative ? '-' : ''}${result}`;
}

/**
 * Formats a number to abbreviated currency notation (K, M, B, T)
 * @param value The monetary value to format.
 * @param decimals Number of decimal places to show (defaults to 1).
 * @param currency Currency symbol to prepend (defaults to '$').
 * @return Formatted currency string.
 */
export function formatCurrency(
  value: number | null | undefined,
  decimals: number = 1,
  currency: string = '$'
): string {
  // Use the existing formatNumber logic
  const formattedNumber: string = formatNumber(value, decimals);

  // formatNumber already handles negatives and returns '0' for invalid input,
  // so we just need to prepend the currency symbol.
  // formatNumber also handles the suffix (K, M, B, T).
  // Example: formatNumber(1234567, 2) -> "1.23M"
  // formatCurrency(1234567, 2, '€') -> "€1.23M"
  return `${currency}${formattedNumber}`;
}
