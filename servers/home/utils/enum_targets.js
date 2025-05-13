function scan(ns, parent, server, list) {
  const children = ns.scan(server);
  for (let child of children) {
    if (parent == child) {
      continue;
    }
    list.push(child);

    scan(ns, server, child, list);
  }
}

export function list_servers(ns) {
  const list = [];
  scan(ns, '', 'home', list);
  return list;
}

/** @param {NS} ns */
export async function main(ns) {
  const servers = list_servers(ns).filter(
    (s) => ns.hasRootAccess(s) && !s.includes('pserv')
  );

  servers.forEach((server) => {
    ns.tprint('-- ' + server + ' --');
    ns.tprint(
      'Max Money: ' + Math.round(ns.getServerMaxMoney(server) / 1000000) + 'M'
    );
    ns.tprint(
      'Cur Money: ' +
        Math.round(ns.getServerMoneyAvailable(server) / 1000000) +
        'M'
    );
    ns.tprint('Min Secur: ' + Math.round(ns.getServerMinSecurityLevel(server)));
    ns.tprint(
      'Base Secr: ' + Math.round(ns.getServerBaseSecurityLevel(server))
    );
    ns.tprint('Curr Secr: ' + Math.round(ns.getServerSecurityLevel(server)));
    ns.tprint('Grothrate: ' + Math.round(ns.getServerGrowth(server)));
    ns.tprint('Hack time: ' + Math.round(ns.getHackTime(server)));
    // ns.tprint(ns.ls(server))
  });
}

