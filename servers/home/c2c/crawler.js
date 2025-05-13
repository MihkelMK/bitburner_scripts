import { disable_logs, notify } from '../helpers/cli.js';
import { connectWithHops } from '../utils/connect_with_hops.js';

const IGNORE = ['darkweb', 'home'];
const SLEEP_MIN = 2;

/** @param {NS} ns */
function run_hacks(ns, server, hacks_dict) {
  let hacks = 0;
  for (let hack in hacks_dict) {
    if (hacks_dict[hack]) {
      hacks += 1;
      switch (hack) {
        case 'brute':
          ns.brutessh(server);
          break;
        case 'ftp':
          ns.ftpcrack(server);
          break;
        case 'http':
          ns.httpworm(server);
          break;
        case 'sql':
          ns.sqlinject(server);
          break;
        case 'smtp':
          ns.relaysmtp(server);
          break;
      }
    }
  }
  return hacks;
}

/** @param {NS} ns */
export function hack_target(ns, target, hacks) {
  // Make sure we can actually NUKE this server
  let ports_needed = ns.getServerNumPortsRequired(target);

  const hacked_ports = run_hacks(ns, target, hacks);

  if (ports_needed > hacked_ports) {
    notify(ns, 'Not enough open ports to hack ' + target);
    return false;
  }

  // Get root access to target server
  ns.nuke(target);

  if (ns.hasRootAccess(target)) {
    notify(ns, target + ' has been nuked', 'crawl');
    return true;
  }

  notify(ns, 'Failed to hack ' + target, 'crawl', 'error');
  return false;
}

/** @param {NS} ns */
async function backdoor_target(ns, target) {
  try {
    if (!connectWithHops(ns, ns.getHostname(), target)) {
      return false;
    }

    await ns.singularity.installBackdoor();
    ns.singularity.connect('home');

    return true;
  } catch (e) {
    ns.print(e);
    return false;
  }
}

/** @param {NS} ns */
export async function main(ns) {
  disable_logs(ns, [
    'scan',
    'run',
    'getServerRequiredHackingLevel',
    'getHackingLevel',
    'getServerNumPortsRequired',
    'sleep',
    'nuke',
    'singularity.installBackdoor',
    'brutessh',
    'ftpcrack',
    'httpworm',
    'sqlinject',
    'relaysmtp',
  ]);
  while (true) {
    let hacks_dict = {
      brute: ns.fileExists('BruteSSH.exe'),
      ftp: ns.fileExists('FTPCrack.exe'),
      http: ns.fileExists('HTTPWorm.exe'),
      sql: ns.fileExists('SQLInject.exe'),
      smtp: ns.fileExists('relaySMTP.exe'),
    };
    let total_hacks = Object.entries(hacks_dict).filter(
      ([name, exists]) => exists
    ).length;

    let servers = Array(ns.scan())[0];
    let serv_set = Array(servers);
    serv_set.push('home');

    let i = 0;
    let waiting = false;
    while (i < servers.length) {
      let server = servers[i];
      let serverObj = ns.getServer(server);

      if (
        !serverObj.purchasedByPlayer &&
        serverObj.requiredHackingSkill <= ns.getHackingLevel() &&
        !IGNORE.includes(server) &&
        serverObj.numOpenPortsRequired <= total_hacks
      ) {
        if (!serverObj.hasAdminRights) {
          waiting = false;
          notify(ns, 'Attempting to hack ' + server);
          hack_target(ns, server, hacks_dict);

          await ns.sleep(1000);
        }

        if (serverObj.hasAdminRights && !serverObj.backdoorInstalled) {
          waiting = false;
          notify(ns, 'Attempting to backdoor ' + server);
          if (await backdoor_target(ns, server)) {
            notify(ns, 'Backdoored ' + server);
          } else {
            notify(ns, "Couldn't backdoor " + server);
          }

          await ns.sleep(1000);
        }
      }

      // Look for new servers
      let s = ns.scan(server);
      for (let j in s) {
        let con = s[j];
        if (!serv_set.includes(con)) {
          //if (serv_set.indexOf(con) < 0) {
          serv_set.push(con);
          servers.push(con);
        }
      }
      i += 1;
    }

    if (!waiting) {
      waiting = true;
      notify(ns, 'Nothing to do, waiting ' + SLEEP_MIN + ' minutes');
    }
    await ns.sleep(60000 * SLEEP_MIN);
  }
}
