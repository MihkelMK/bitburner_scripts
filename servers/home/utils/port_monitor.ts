import { calcTailHeight, calcTailWidth, TAIL_FONT_SIZE } from '../helpers/cli';
import { prettifyPortData } from './peek_port';

export function setupMonitor(ns: NS, port: number, title: string) {
  ns.run('/utils/port_monitor.js', 1, port, title);
  // Kill the monitoring script
  ns.atExit(() => {
    ns.clearPort(port);
    ns.writePort(port, 'QUIT MONITOR');
  });
}

export async function main(ns: NS) {
  const args = ns.flags([['help', false]]);
  ns.disableLog('ALL');

  if (args.help || ns.args.length < 2) {
    ns.tprint('Monitor value of PORT inside tail window.');
    ns.tprint(`Usage: run ${ns.getScriptName()} PORT TITLE`);
    ns.tprint('Example:');
    ns.tprint(`> run ${ns.getScriptName()} 8001 "Stock Bot"`);
    return;
  }

  const port = args._[0];
  const title = args._[1].trim();

  ns.ui.setTailTitle(title);
  ns.ui.setTailFontSize(TAIL_FONT_SIZE);
  ns.ui.openTail();

  while (true) {
    const data = ns.peek(port);

    if (data === 'QUIT MONITOR') {
      ns.ui.closeTail();
      ns.exit();
    }

    const prettyData = prettifyPortData(data);

    ns.clearLog();
    ns.print(prettyData);

    const rows = prettyData.split('\n');
    const maxRowLength = Math.max(...rows.map((row) => row.length));

    if (rows && rows.length > 0) {
      const windowWidth = calcTailWidth(maxRowLength);
      const windowHeight = calcTailHeight(rows.length);
      ns.ui.resizeTail(windowWidth, windowHeight);
    }

    await ns.sleep(1000 * 60);
  }
}
