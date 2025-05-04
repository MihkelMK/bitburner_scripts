/** @param {NS} ns */
export async function main(ns) {
  ns.scriptKill("c2c/server.js", ns.getHostname())
  ns.scriptKill("c2c/crawler.js", ns.getHostname())
  ns.scriptKill("utils/buy_servers.js", ns.getHostname())
  ns.scriptKill("utils/go.js", ns.getHostname())

  ns.run("utils/buy_servers.js", 1)
  ns.run("utils/go.js", 1)

  ns.run("c2c/crawler.js", 1)
  ns.run("c2c/server.js", 1)
  ns.run("utils/runmaxthreads.js", 1, "utils/hack.js", 12)

  ns.run("c2c/set_goal.js", 1, "hack")
  ns.run("c2c/set_targets.js", 1, "omega-net", "phantasy", "silver-helix", "rothman-uni")
  // ns.run("c2c/find_targets.js", 1, 1, "early")
}