import {
  disable_logs,
  formatCurrency,
  notify,
  TAIL_BODY_FONT_SIZE,
  TAIL_HEIGHT_MULT,
  TAIL_TITLEBAR_OFFSET,
  TAIL_WIDTH_MULT,
} from '../helpers/cli.js';
import { SERVER_RAM_PORT } from '../helpers/ports.js';
import { setupMonitor } from '../utils/port_monitor.js';

function buy_cost(ns: NS, ram: number): number {
  return ns.getPurchasedServerCost(ram);
}

function grow_cost(ns: NS, ram: number, hostname: string): number {
  return ns.getPurchasedServerUpgradeCost(hostname, ram);
}

function monitorMessage(ns: NS, count: number, ram: number) {
  ns.clearPort(SERVER_RAM_PORT);
  ns.writePort(SERVER_RAM_PORT, `${count}x${ns.formatRam(ram, 0)}`);
}

export async function main(ns: NS) {
  disable_logs(ns, [
    'sleep',
    'getPurchasedServerLimit',
    'getPurchasedServerLimit',
    'getServerMoneyAvailable',
    'getServerMaxRam',
    'getPurchasedServers',
    'getPurchasedServerCost',
    'getPurchasedServerUpgradeCost',
    'purchaseServer',
  ]);
  setupMonitor(ns, SERVER_RAM_PORT, 'Servers', {
    x: -25.5 - (71 * TAIL_BODY_FONT_SIZE * TAIL_WIDTH_MULT) / 2,
    y: -32 - TAIL_TITLEBAR_OFFSET - 7 * TAIL_BODY_FONT_SIZE * TAIL_HEIGHT_MULT,
    align: 'center',
  });
  notify(ns, 'SERVER FARM STARTED');

  // C2C action takes 1.7GB so 2 is enough to start
  const first_ram = 2;
  let waiting = false;

  notify(ns, 'Initial RAM ' + first_ram + ' GB');

  while (ns.getPurchasedServers().length < ns.getPurchasedServerLimit()) {
    const neededMoney = buy_cost(ns, first_ram);
    if (ns.getServerMoneyAvailable('home') > neededMoney) {
      waiting = false;

      const hostname = ns.purchaseServer('pserv', first_ram);
      if (!hostname || hostname === '') break;

      notify(ns, `Buy ${hostname} with ${first_ram} GB`, 'bs');
    } else if (!waiting) {
      notify(ns, `Waiting for ${formatCurrency(ns, neededMoney)}`);
      waiting = true;
    }

    monitorMessage(ns, ns.getPurchasedServers().length, first_ram);
    await ns.sleep(1000);
  }

  let ram = first_ram;
  const servers = ns.getPurchasedServers();
  while (ram < ns.getPurchasedServerMaxRam()) {
    let i = 0;
    while (i < servers.length) {
      const hostname = servers[i];

      if (ns.getServerMaxRam(hostname) >= ram) {
        i++;
        continue;
      }

      const neededMoney = grow_cost(ns, ram, hostname);
      if (ns.getServerMoneyAvailable('home') > neededMoney) {
        waiting = false;

        if (!ns.upgradePurchasedServer(hostname, ram)) {
          continue;
        }
        notify(ns, `Upgrade ${hostname} to ${ram} GB`, 'bs');

        i++;
      } else if (!waiting) {
        notify(ns, `Waiting for ${formatCurrency(ns, neededMoney)}`);
        waiting = true;
      }

      monitorMessage(ns, i, ram);
      await ns.sleep(1000);
    }

    monitorMessage(ns, servers.length, ram);
    notify(ns, servers.length + ' servers now ' + ram + ' GB', 'bs');

    ram = ram * 2; // RAM goes up in steps of power of 2
    await ns.sleep(1000);
  }

  ns.alert(
    'bs: All ' +
      ns.getPurchasedServerLimit() +
      ' servers maxed out with ' +
      ram +
      ' GB.'
  );
}
