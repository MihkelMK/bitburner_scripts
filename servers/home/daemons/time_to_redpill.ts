import {
  disable_logs,
  TAIL_TITLEBAR_OFFSET,
  TAIL_BODY_FONT_SIZE,
  TAIL_HEIGHT_MULT,
} from '../helpers/cli';
import { RED_PILL_PORT } from '../helpers/ports';
import { setupMonitor } from '../utils/port_monitor';

export async function main(ns: NS) {
  ns.ui.openTail();
  disable_logs(ns, [
    'getServerMaxRam',
    'getServerMoneyAvailable',
    'sleep',
    'stock.sellStock',
    'stock.buyStock',
    'stock.purchaseWseAccount',
    'stock.purchase4SMarketData',
    'stock.purchaseTixApi',
    'stock.purchase4SMarketDataTixApi',
    'run',
  ]);

  setupMonitor(ns, ns.pid, RED_PILL_PORT, 'Red Pill time', {
    x: -9,
    y:
      -32 -
      (TAIL_TITLEBAR_OFFSET + TAIL_BODY_FONT_SIZE * 2 * TAIL_HEIGHT_MULT + 11) *
        2 -
      (TAIL_TITLEBAR_OFFSET + TAIL_BODY_FONT_SIZE * 3 * TAIL_HEIGHT_MULT + 11),
  });

  while (true) {
    const current = ns.singularity.getFactionRep('Daedalus');
    const cost = ns.singularity.getAugmentationRepReq('The Red Pill');
    const needed = cost - current;

    const shareMult = 1.5773377036471274;
    const repMult = ns.getPlayer().mults.faction_rep;
    const rate = 34 * (repMult * shareMult);
    ns.print(rate);

    const doneInSec = needed / rate;
    const timer = new Date(1000 * doneInSec).toISOString().substr(11, 8);

    ns.clearPort(RED_PILL_PORT);
    ns.writePort(RED_PILL_PORT, timer);
    await ns.sleep(1000 * 30);
  }
}
