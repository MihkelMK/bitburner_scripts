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
  prefix: string | undefined = undefined,
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
 * @param ns Netscript
 * @param value The value to format.
 * @param decimals Number of decimal places to show (defaults to 1).
 * @return Formatted string.
 */
export function formatNumber(
  ns: NS,
  value: number | null | undefined,
  decimals: number | undefined = undefined
): string {
  const isInteger = decimals === 0;

  return ns.formatNumber(value, decimals, undefined, isInteger);
}

/**
 * Formats a number to abbreviated currency notation (K, M, B, T)
 * @param ns Netscript
 * @param value The monetary value to format.
 * @param decimals Number of decimal places to show (defaults to 1).
 * @param currency Currency symbol to prepend (defaults to '$').
 * @return Formatted currency string.
 */
export function formatCurrency(
  ns: NS,
  value: number | null | undefined,
  decimals: number = 1,
  currency: string = '$'
): string {
  const formattedNumber: string = formatNumber(ns, value, decimals);
  return `${currency}${formattedNumber}`;
}
