import {
  calcTailHeight,
  calcTailWidth,
  enum_target,
  formatCurrency,
} from '../helpers/cli';
import { ENUM_PID_PORT, TARGET_PORT } from '../helpers/ports';
import { Target } from '../../../types/c2c';

const FONT_SIZE = 16;

function scan(ns: NS, parent: string, server: string, list: string[]) {
  const children = ns.scan(server);
  for (let child of children) {
    if (parent == child) {
      continue;
    }
    list.push(child);

    scan(ns, server, child, list);
  }
}

export function list_servers(ns: NS): string[] {
  const list = [];
  scan(ns, '', 'home', list);
  return list;
}

function printServerEnum(
  ns: NS,
  servers: Target[],
  targets: Target[]
): { height: number; width: number } {
  let size = { height: 0, width: 0 };

  try {
    // Create a safety check for empty or invalid serverData
    if (!servers) {
      ns.print('No servers found.');
      return;
    }

    const hostnameTitle = 'hostname';
    const moneyTitle = 'Max €';
    const securityTitle = 'Cur;Min';
    const growthTitle = 'Grow';
    const hacktimeTitle = 'Time';

    // Initialize column widths with minimum values
    const columnWidths: { [key: string]: number } = {
      hostname: hostnameTitle.length, // Min width for hostname column
      maxMoney: moneyTitle.length, // Min width for money column
      allSecurity: securityTitle.length, // Min width for security column
      minSecurity: 0,
      currentSecurity: 0,
      growth: growthTitle.length, // Min width for growth column
      hackTime: hacktimeTitle.length, // Min width for hack time column
      selected: 2, // Min width for selected checkmark col
    };

    // Store cell content for all rows to calculate width and reuse when printing
    const tableRows: any[] = [];

    // Helper function to update column width based on content
    function updateColumnWidth(
      column: keyof typeof columnWidths,
      content: string | number
    ) {
      const contentLength = content.toString().length;
      if (contentLength > columnWidths[column]) {
        columnWidths[column] = contentLength;
      }
    }

    // Process each server and update column widths
    servers.forEach((server) => {
      const hostname = server.hostname;

      const isTarget = targets.findIndex((t) => t.hostname === hostname) >= 0;
      const selected = isTarget ? 'x' : '';

      const maxMoney = formatCurrency(ns, server.data.money.max, 0);

      const minSecurity = ns.formatNumber(server.data.security.min, 0);
      const currentSecurity = ns.formatNumber(server.data.security.current, 0);

      const growth = ns.formatNumber(server.data.growth, 0);
      const hackTime = ns.formatNumber(server.data.time, 0);

      // Update column widths based on content
      updateColumnWidth('hostname', hostname);
      updateColumnWidth('maxMoney', maxMoney);
      updateColumnWidth('minSecurity', minSecurity);
      updateColumnWidth('currentSecurity', currentSecurity);
      updateColumnWidth('growth', growth);
      updateColumnWidth('hackTime', hackTime);

      // Store row data for later printing
      tableRows.push({
        hostname,
        maxMoney,
        minSecurity,
        currentSecurity,
        growth,
        hackTime,
        selected,
      });
    });

    // Helper function to pad strings to specified width
    function padStringLeft(str: string, width: number) {
      return str.toString().padEnd(width);
    }
    // Helper function to right-align string to specified width
    function padStringRight(str: string, width: number) {
      return str.toString().padStart(width);
    }
    // Helper function to right-align string to specified width
    function padStringCenter(str: string, width: number) {
      const text = str.toString();
      const textWidth = text.length;

      const totalPadding = width - textWidth;
      const halfPadded = textWidth + totalPadding / 2;

      return str.toString().padStart(halfPadded).padEnd(width);
    }

    // Calculate total column widths
    updateColumnWidth(
      'allSecurity',
      columnWidths.minSecurity + columnWidths.currentSecurity
    );
    updateColumnWidth(
      'hostname',
      columnWidths.hostname + columnWidths.selected
    );

    // Print table header
    const header = `| ${padStringLeft(hostnameTitle, columnWidths.hostname)}${' '.repeat(columnWidths.selected)} | ${padStringCenter(moneyTitle, columnWidths.maxMoney)} | ${padStringCenter(hacktimeTitle, columnWidths.hackTime)} | ${padStringCenter(growthTitle, columnWidths.growth)} | ${padStringCenter(securityTitle, columnWidths.allSecurity)} |`;
    const separator = `| ${'-'.repeat(columnWidths.hostname)}${'-'.repeat(columnWidths.selected)} | ${'-'.repeat(columnWidths.maxMoney)} | ${'-'.repeat(columnWidths.hackTime)} | ${'-'.repeat(columnWidths.growth)} | ${'-'.repeat(columnWidths.allSecurity)} |`;

    size.width = header.length;
    size.height += 1;

    ns.print(header);
    ns.print(separator);

    // Print each row with dynamic widths
    for (const row of tableRows) {
      const securityMiddlePadding =
        columnWidths.allSecurity -
        columnWidths.minSecurity -
        columnWidths.currentSecurity +
        1; // Add one for spacing

      // Format each cell with aligned percentages
      const securityText = `${padStringRight(row.currentSecurity, columnWidths.currentSecurity)} ${padStringRight(padStringRight(row.minSecurity, columnWidths.minSecurity), securityMiddlePadding)}`;

      const formattedRow = `| ${padStringLeft(row.hostname, columnWidths.hostname)}${padStringRight(row.selected, columnWidths.selected)} | ${padStringRight(row.maxMoney, columnWidths.maxMoney)} | ${padStringRight(row.hackTime, columnWidths.hackTime)} | ${padStringRight(row.growth, columnWidths.growth)} | ${padStringRight(securityText, columnWidths.allSecurity)} |`;
      ns.print(formattedRow);

      size.width = Math.max(formattedRow.length, size.width);
      size.height += 1;
    }

    return size;
  } catch (error) {
    // Catch any errors in the table printing
    ns.print(`Error printing table: ${error}`);
    return size;
  }
}

export async function main(ns: NS) {
  ns.disableLog('ALL');

  const servers = list_servers(ns)
    .filter((s) => ns.hasRootAccess(s) && !s.includes('pserv'))
    .map((server) => ({ hostname: server, data: enum_target(ns, server) }))
    .filter((server) => server.data.money.max > 0)
    .sort((a, b) => b.data.money.max - a.data.money.max);

  const targetsPortData = ns.peek(TARGET_PORT);
  const targets =
    targetsPortData !== 'NULL PORT DATA' ? JSON.parse(targetsPortData) : [];

  const { height, width } = printServerEnum(ns, servers, targets);

  // Close previous window if present
  const prevPID = ns.readPort(ENUM_PID_PORT);
  if (prevPID !== 'NULL PORT DATA' && typeof prevPID === 'number') {
    ns.ui.closeTail(prevPID);
  }

  ns.clearPort(ENUM_PID_PORT);
  ns.writePort(ENUM_PID_PORT, ns.pid);
  ns.ui.setTailFontSize(FONT_SIZE);
  ns.ui.openTail();

  if (height > 0 && width > 0) {
    const windowWidth = calcTailWidth(width, ns.getScriptName());
    const windowHeight = calcTailHeight(height);
    ns.ui.resizeTail(windowWidth, windowHeight);
  }
}
