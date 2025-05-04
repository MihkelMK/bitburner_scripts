const TARGET_PORT = 9000

/** @param {NS} ns */
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

/** @param {NS} ns */
export function list_servers(ns) {
  const list = [];
  scan(ns, '', 'home', list);
  return list;
}

function calculate_score(data, stage) {
  // Normalize some values to prevent division by zero
  const securityFactor = data.security.min / Math.max(data.security.current, 1);
  const moneyFactor = data.money.current / Math.max(data.money.max, 1);
  const hackTime = Math.max(data.time, 1);
  const moneyMax = Math.max(data.money.max, 1);
  const growth = Math.max(data.growth, 1);
  const minSecurity = Math.max(data.security.min, 1);

  let score = 0;

  switch (stage) {
    case "early":
      // Early game: Focus on low security and hack time, with some consideration for growth
      // Prioritize servers that are easier to hack, even if they have less money
      score = (moneyMax * growth) / (Math.pow(minSecurity, 2) * hackTime);
      break;

    case "mid":
      // Mid game: Balance between money, growth, and security
      // More emphasis on growth to build up money reserves
      score = (moneyMax * Math.pow(growth, 2)) /
        (minSecurity * Math.sqrt(hackTime));

      // Give bonus to servers that already have money
      score *= (0.5 + 0.5 * moneyFactor);
      break;

    case "late":
      // Late game: Focus primarily on maximum money and hack time
      // Security becomes less important as you have strong scripts to manage it
      score = Math.pow(moneyMax, 1.5) / hackTime;

      // Small bonus for servers with good growth
      score *= (1 + (growth / 100));

      // Slightly penalize high security servers
      score *= Math.pow(securityFactor, 0.5);
      break;

    default:
      // Default balanced approach if stage is not specified
      score = (moneyMax * growth) / (minSecurity * hackTime);
  }
  return score;
}

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
function find_targets(ns, servers, count, stage) {
  const analyzed_servers = servers.map(server => {
    const data = enum_target(ns, server);

    const score = calculate_score(data, stage);

    return {
      hostname: server,
      score: score,
      data: data,
    };
  });

  // Sort by score
  analyzed_servers.sort((a, b) => b.score - a.score);

  // Log the top targets for debugging
  ns.print("Top targets by score:");
  for (let i = 0; i < Math.min(5, analyzed_servers.length); i++) {
    const t = analyzed_servers[i];
    ns.print(`${t.hostname}: Score=${t.score.toFixed(2)}, $=${ns.formatNumber(t.data.money.max)}, Sec=${t.data.security.min.toFixed(2)}, Growth=${t.data.growth}`);
  }

  // Return top N targets or fewer if not enough candidates
  const numTargets = Math.min(count, analyzed_servers.length);
  return analyzed_servers.slice(0, numTargets);
}

/** @param {NS} ns */
export async function main(ns) {
  const args = ns.flags([["help", false]]);

  if (args.help || args._.length < 1) {
    ns.tprint("Finds n most profitable targets to hack in early/mid/late STAGE of the game.");
    ns.tprint(`Usage: run ${ns.getScriptName()} N STAGE`);
    ns.tprint("Example:");
    ns.tprint(`> run ${ns.getScriptName()} 2 late`);
    return;
  }

  const count = args._[0];
  const stage = args._[1];

  const servers = list_servers(ns).filter(s => (ns.hasRootAccess(s) && ns.getServerRequiredHackingLevel(s) <= ns.getHackingLevel() && !s.includes("pserv")));
  const targets = find_targets(ns, servers, count, stage);

  const target_names = targets.map(target => target.hostname);
  const target_string = target_names.join(", ")

  ns.print("Sending " + target_string + " to port " + TARGET_PORT)
  ns.toast("Setting new targets\n" + target_string)

  ns.clearPort(TARGET_PORT);
  ns.writePort(TARGET_PORT, JSON.stringify(targets));
}