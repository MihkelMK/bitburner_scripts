const TARGET_PORT = 9000

/** @param {NS} ns */
async function run_on_target(ns, target, type) {
  switch (type) {
    case "grow":
      await ns.grow(target);
      return;
    case "weaken":
      await ns.weaken(target);
      return;
    case "hack":
      await ns.hack(target);
      return;
    default:
      return;
  }
}

/** @param {NS} ns */
export async function main(ns) {
  // Defines the "target server", which is the server
  // that we're going to hack. In this case, it's "n00dles"
  const growEnd = 4;
  let targets = [];

  let i = 0;
  while (true) {
    const target_port_data = ns.peek(TARGET_PORT);

    if (target_port_data != "" && target_port_data !== "NULL PORT DATA") {
      const new_targets = JSON.parse(target_port_data);
      const target_names = new_targets.map(t => t.hostname).sort();

      if (target_names !== targets) {
        targets = target_names;
        ns.print("hack: Set targets to " + target_names.join(", "))
      }
    }

    if (!targets) {
      ns.sleep(1000 * 2);
      break
    }

    const stage = i <= growEnd ? "grow" : "weaken";
    ns.print("Stage " + stage + " i=" + i)

    for (let t = 0; t < targets.length; t++) {
      await run_on_target(ns, targets[t], stage);

      const max_money = ns.getServerMaxMoney(targets[t]);
      const curr_money = ns.getServerMoneyAvailable(targets[t]);

      if (curr_money / max_money > 0.95) {
        await run_on_target(ns, targets[t], "hack");
      }
    }

    i = (i + 1) % 10;
  }
}
