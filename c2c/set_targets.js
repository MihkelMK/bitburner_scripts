const TARGET_PORT = 9000

/** @param {NS} ns */
function enum_target(ns, server) {
  return {
    money: {
      max: ns.getServerMaxMoney(server),
      current: ns.getServerMoneyAvailable(server),
    },
    security: {
      min: ns.getServerMinSecurityLevel(server),
      base: ns.getServerBaseSecurityLevel(server),
      current: ns.getServerSecurityLevel(server),
    },
    growth: ns.getServerGrowth(server),
    time: ns.getHackTime(server),
    chance: ns.hackAnalyzeChance(server)
  }
}

/** @param {NS} ns */
function find_targets(ns, servers) {
  const analyzed_servers = servers.map(server => {
    const data = enum_target(ns, server);

    const score = 1;

    return {
      hostname: server,
      score: score,
      data: data,
    };
  });

  return analyzed_servers;
}

/** @param {NS} ns */
export async function main(ns) {
  const args = ns.flags([["help", false]]);

  if (args.help || args._.length < 1) {
    ns.tprint("Target the botnet on one specific targets.");
    ns.tprint(`Usage: run ${ns.getScriptName()} TARGET1 TARGET2`);
    ns.tprint("Example:");
    ns.tprint(`> run ${ns.getScriptName()} foodnstuff n00dles`);
    return;
  }

  const servers = args._;

  const targets = find_targets(ns, servers);

  const target_names = targets.map(target => target.hostname);
  const target_string = target_names.join(", ")

  ns.print("Sending " + target_string + " to port " + TARGET_PORT)
  ns.toast("Setting new targets\n" + target_string)

  ns.clearPort(TARGET_PORT);
  ns.writePort(TARGET_PORT, JSON.stringify(targets));
}