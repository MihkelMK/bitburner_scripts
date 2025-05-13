import { TARGET_PORT } from '../helpers/ports.js';

/**
 * @param data - context about the game, useful when autocompleting
 * @param args - current arguments, not including "run script.js"
 * @returns - the array of possible autocomplete options
 */
export function autocomplete(data: AutocompleteData, args: string[]): string[] {
  const servers = data.servers;
  const newServers = servers.filter((server) => !args.includes(server));

  const lastComplete = servers.includes(args.at(-1));

  if (args.at(-1) && !lastComplete) {
    return newServers.filter((server) => server.startsWith(args.at(-1)));
  }

  return newServers;
}

interface TargetData {
  money: { max: number; current: number };
  security: { min: number; base: number; current: number };
  growth: number;
  time: number;
  chance: number;
}

interface Target {
  hostname: string;
  score: number;
  data: TargetData;
}

function enum_target(ns: NS, server: string): TargetData {
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
    chance: ns.hackAnalyzeChance(server),
  };
}

function find_targets(ns: NS, servers: string[]): Target[] {
  const analyzed_servers = servers.map((server: string) => {
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

export async function main(ns: NS) {
  const args = ns.flags([['help', false]]);

  if (args.help || ns.args.length < 1) {
    ns.tprint('Target the botnet on one specific targets.');
    ns.tprint(`Usage: run ${ns.getScriptName()} TARGET1 TARGET2`);
    ns.tprint('Example:');
    ns.tprint(`> run ${ns.getScriptName()} foodnstuff n00dles`);
    return;
  }

  const servers = args._ as string[];

  const targets = find_targets(ns, servers);

  const target_names = targets.map(
    (target: { hostname: string }) => target.hostname
  );
  const target_string = target_names.join(', ');

  ns.print('Sending ' + target_string + ' to port ' + TARGET_PORT);
  ns.toast('Setting new targets\n' + target_string);

  ns.clearPort(TARGET_PORT);
  ns.writePort(TARGET_PORT, JSON.stringify(targets));
}
