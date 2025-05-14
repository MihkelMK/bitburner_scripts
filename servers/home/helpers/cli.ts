import { TargetData } from '../types/c2c';

export const SUBLINE_INDENT = 4;

/**
 * Disable certain logs from appearing in CLI output. ALL silences everything.
 * @param ns The Netscript API object.
 * @param logs Log types to disable.
 */
export function disable_logs(ns: NS, logs: string[]): void {
  for (var i in logs) {
    ns.disableLog(logs[i]);
  }
  ns.clearLog();
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
 * Command log with indent and without timestamp to be used after a notify
 * @param ns The Netscript API object.
 * @param message The message to log.
 * @param indentLevel How many times to indent message
 */
export function inform(ns: NS, message: string, indentLevel: number = 0): void {
  if (!message) return;

  ns.print(' '.repeat(indentLevel * SUBLINE_INDENT) + message);
}

/**
 * Formats a number to abbreviated currency notation (K, M, B, T)
 * @param ns Netscript
 * @param value The monetary value to format.
 * @param decimals Number of decimal places to show (defaults to 3).
 * @param currency Currency symbol to prepend (defaults to '$').
 * @return Formatted currency string.
 */
export function formatCurrency(
  ns: NS,
  value: number | null | undefined,
  decimals: number | undefined = undefined,
  currency: string = '$'
): string {
  const formattedNumber: string = ns.formatNumber(value, decimals);
  return `${currency}${formattedNumber}`;
}

export function enum_target(ns: NS, server: string): TargetData {
  return {
    money: {
      max: ns.getServerMaxMoney(server),
      current: ns.getServerMoneyAvailable(server),
    },
    security: {
      min: ns.getServerMinSecurityLevel(server),
      base: ns.getServerBaseSecurityLevel(server),
      current: ns.getServerSecurityLevel(server),
    },
    growth: ns.getServerGrowth(server),
    time: ns.getHackTime(server),
    chance: ns.hackAnalyzeChance(server),
  };
}
