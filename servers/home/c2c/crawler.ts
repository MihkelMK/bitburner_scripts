import { disable_logs, notify } from '../helpers/cli';
import { HacksDictionary } from '../../../types/c2c';
import { connectWithHops } from '../utils/connect_with_hops';

const IGNORE = ['darkweb', 'home'];
const SLEEP_MIN = 2;

function run_hacks(ns: NS, server: string, hacks_dict: HacksDictionary) {
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

export function hack_target(ns: NS, target: string, hacks: HacksDictionary) {
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

async function backdoor_target(ns: NS, target: string) {
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

export async function main(ns: NS) {
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

  const runOnce = ns.args[0];

  while (true) {
    let hacks_dict = {
      brute: ns.fileExists('BruteSSH.exe'),
      ftp: ns.fileExists('FTPCrack.exe'),
      http: ns.fileExists('HTTPWorm.exe'),
      sql: ns.fileExists('SQLInject.exe'),
      smtp: ns.fileExists('relaySMTP.exe'),
    };
    let total_hacks = Object.entries(hacks_dict).filter(
      ([_, exists]) => exists
    ).length;

    let servers = Array(ns.scan())[0];
    let serv_set = new Set(servers);
    serv_set.add('home');

    let i = 0;
    let waiting = false;
    let serverAdded = false;
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
          if (!hack_target(ns, server, hacks_dict)) {
            waiting = true;
          }

          await ns.sleep(1000);
        }

        if (serverObj.hasAdminRights && !serverObj.backdoorInstalled) {
          waiting = false;
          notify(ns, 'Attempting to backdoor ' + server);
          if (await backdoor_target(ns, server)) {
            notify(ns, 'Backdoored ' + server);
          } else {
            waiting = true;
            notify(ns, "Couldn't backdoor " + server);
          }

          await ns.sleep(1000);
        }
      }

      // Look for new servers
      let s = ns.scan(server);
      for (let j in s) {
        let con = s[j];
        if (!serv_set.has(con)) {
          serv_set.add(con);
          servers.push(con);
          serverAdded = true;
        }
      }
      i += 1;
    }

    // We have hacked all servers available
    if (runOnce && !serverAdded) {
      ns.exit();
    }

    if (!waiting) {
      waiting = true;
      notify(ns, 'Nothing to do, waiting ' + SLEEP_MIN + ' minutes');
    }
    await ns.sleep(60000 * SLEEP_MIN);
  }
}
