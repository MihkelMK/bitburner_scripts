import { disable_logs, formatCurrency, notify } from '../helpers/cli.js';

/** @param {NS} ns */
function buy_cost(ns, ram) {
  return ns.getPurchasedServerCost(ram);
}

/** @param {NS} ns */
function grow_cost(ns, ram, hostname) {
  return ns.getPurchasedServerUpgradeCost(hostname, ram);
}

/** @param {NS} ns */
export async function main(ns) {
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
      notify(ns, `Waiting for ${formatCurrency(neededMoney)}`);
      waiting = true;
    }

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
        notify(ns, `Waiting for ${formatCurrency(neededMoney)}`);
        waiting = true;
      }

      await ns.sleep(1000);
    }

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

