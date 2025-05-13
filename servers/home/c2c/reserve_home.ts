import { HOME_RESERVE_PORT } from '../helpers/ports.js';

export async function main(ns: NS) {
  const args = ns.flags([['help', false]]);

  if (args.help || ns.args.length < 1) {
    ns.tprint('Set GB of RAM to keep free when C2C handles home');
    ns.tprint(`Usage: run ${ns.getScriptName()} GB`);
    ns.tprint('Example:');
    ns.tprint(`> run ${ns.getScriptName()} 12.5`);
    return;
  }

  const keepFree = parseFloat(args._[0]) || 0;

  ns.clearPort(HOME_RESERVE_PORT);
  ns.writePort(HOME_RESERVE_PORT, keepFree);
}
