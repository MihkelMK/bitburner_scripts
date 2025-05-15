import {
  calcTailHeight,
  calcTailWidth,
  notify,
  TAIL_BODY_FONT_SIZE,
} from '../helpers/cli';
import { prettifyPortData } from './peek_port';

export function setupMonitor(
  ns: NS,
  port: number,
  title: string,
  pos?: { x: number; y: number; align?: 'left' | 'center' | 'right' }
) {
  // If we are already monitoring this with same arguments, keep previous
  const args = pos
    ? [port, title, pos.x, pos.y, pos?.align || 'right']
    : [port, title];
  if (ns.isRunning('utils/port_monitor.js', ns.getHostname(), ...args)) {
    return;
  }

  // Start new instance
  const pid = ns.run('utils/port_monitor.js', 1, ...args);

  ns.atExit(() => {
    // Stop monitoring when main script killed
    ns.kill(pid);
  });
}

export async function main(ns: NS) {
  const args = ns.flags([['help', false]]);
  ns.disableLog('ALL');

  if (args.help || ns.args.length < 2) {
    ns.tprint(
      'Monitor value of PORT inside tail window. Optionally position with X and Y cords.'
    );
    ns.tprint(`Usage: run ${ns.getScriptName()} PORT TITLE X Y`);
    ns.tprint('Example:');
    ns.tprint(`> run ${ns.getScriptName()} 8001 "Stock Bot"`);
    return;
  }

  const port = args._[0];
  const title = args._[1].trim();
  const xCord = args._[2] ? parseInt(args._[2]) : undefined;
  const yCord = args._[3] ? parseInt(args._[3]) : undefined;
  const align = args._[4] || 'right';

  // If monitoring is stopped, kill main script
  ns.atExit(() => {
    ns.ui.closeTail();
  });

  ns.ui.setTailTitle(title);
  ns.ui.setTailFontSize(TAIL_BODY_FONT_SIZE);
  ns.ui.openTail();

  while (true) {
    const [screenW, screenH] = ns.ui.windowSize();
    const data = ns.peek(port);

    if (data === 'NULL PORT DATA') {
      ns.exit();
    }

    const prettyData = prettifyPortData(data);

    ns.clearLog();
    notify(ns, prettyData);

    const rows = prettyData.split('\n');
    const rowLengths = rows.map((row) => row.length);
    rowLengths[0] += 11; // Account for timestamp
    const maxRowLength = Math.max(...rowLengths);

    if (rows && rows.length > 0) {
      const windowWidth = calcTailWidth(maxRowLength, title);
      const windowHeight = calcTailHeight(rows.length);
      ns.ui.resizeTail(windowWidth, windowHeight);

      if (yCord && xCord) {
        // Custom functionality to make it easier to allign with opposite window edge
        let xPos = 0;
        if (align === 'left') {
          xPos = xCord < 0 ? screenW + xCord : xCord;
        } else if (align === 'right') {
          xPos = xCord < 0 ? screenW - windowWidth + xCord : xCord;
        } else {
          xPos = xCord < 0 ? screenW + xCord - windowWidth / 2 : xCord;
        }
        const yPos = yCord < 0 ? screenH - windowHeight + yCord : yCord;

        ns.ui.moveTail(xPos, yPos);
      }
    }

    await ns.sleep(10000);
  }
}
