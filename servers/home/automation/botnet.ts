import { notify } from '../helpers/cli';
import { ALL_PORTS } from '../helpers/ports';

export async function main(ns: NS) {
  const args = ns.flags([['clear', false]]);
  const clearPorts = args['clear'] || false;

  if (clearPorts) {
    ALL_PORTS.forEach((portnr) => {
      ns.clearPort(portnr);
    });
  }
  let lastRam = 0;
  let homeRAM = ns.getServerMaxRam('home');
  let lastWorkersRam = 0;
  let workersRAM = ns
    .getPurchasedServers()
    .reduce((total, hostname) => total + ns.getServerMaxRam(hostname), 0);

  while (true) {
    // Crude calculation/magic number (25 servers with 4 GB and 32 GB home)
    if (homeRAM + workersRAM < 132) {
      ns.run('c2c/set_targets.js', 1, 'foodnstuff');
    } else {
      ns.run(
        'c2c/set_targets.js',
        1,
        'zer0',
        'omega-net',
        'max-hardware',
        'phantasy'
      );
    }

    if (lastRam !== homeRAM) {
      ns.scriptKill('daemons/buy_servers.js', ns.getHostname());
      ns.scriptKill('daemons/buy_hacks.js', ns.getHostname());
      ns.scriptKill('daemons/trade.js', ns.getHostname());

      ns.scriptKill('c2c/crawler.js', ns.getHostname());
      ns.scriptKill('c2c/server.js', ns.getHostname());

      // Always hack
      ns.run('c2c/set_goal.js', 1, 'hack');
      // Always buy servers
      ns.run('daemons/buy_servers.js', 1);

      if (homeRAM < 32) {
        ns.run('c2c/crawler.js', 1, true); // Run once
        ns.run('daemons/go.js', 1, 'Slum Snakes');
      } else {
        ns.run('daemons/buy_hacks.js', 1);
        ns.run('c2c/crawler.js');

        if (homeRAM === 64) {
          ns.run('c2c/reserve_home.js', 1, 6);
        } else {
          ns.run('c2c/reserve_home.js', 1, 24);
          ns.run('daemons/trade.js', 1);
        }
      }

      ns.run('c2c/server.js');
    }

    if (workersRAM !== lastWorkersRam) {
      ns.scriptKill('daemons/go.js', ns.getHostname());

      // Magic number of 25 servers with 64 GB
      if (workersRAM < 1600) {
        // Gives more hack money
        ns.run('daemons/go.js', 1, 'The Black Hand');
      } else {
        // Gives more reputation
        ns.run('daemons/go.js', 1, 'Daedalus');
      }
    }

    // This RAM is better used elsewhere
    if (homeRAM < 128) {
      notify(ns, 'Exited to free RAM', 'init');
      ns.exit();
    }

    // No other condition will trigger after this
    if (homeRAM > 64 && workersRAM > 1600) {
      notify(ns, 'Reached last stage', 'init');
      ns.exit();
    }

    lastRam = homeRAM;
    homeRAM = ns.getServerMaxRam('home');
    lastWorkersRam = workersRAM;
    workersRAM = ns
      .getPurchasedServers()
      .reduce((total, hostname) => total + ns.getServerMaxRam(hostname), 0);

    await ns.sleep(1000 * 60 * 3);
  }
}
