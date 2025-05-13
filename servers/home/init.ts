export async function main(ns: NS) {
  ns.scriptKill('c2c/server.js', ns.getHostname());
  ns.scriptKill('c2c/crawler.js', ns.getHostname());
  ns.scriptKill('daemons/buy_servers.js', ns.getHostname());
  ns.scriptKill('daemons/go.js', ns.getHostname());
  ns.scriptKill('daemons/trade.js', ns.getHostname());

  ns.run('daemons/go.js', 1);
  ns.run('daemons/buy_servers.js', 1);
  ns.run('daemons/buy_hacks.js', 1);
  // ns.run("daemons/trade.js", 1)

  ns.run('c2c/crawler.js', 1);
  ns.run('c2c/server_simple.js', 1);

  ns.run('c2c/set_goal.js', 1, 'hack');
  ns.run('c2c/reserve_home.js', 1, 4);
  ns.run(
    'c2c/set_targets.js',
    1,
    'rothman-uni',
    'omega-net',
    'silver-helix',
    'phantasy'
  );
  // ns.run('c2c/set_targets.js', 1, 'foodnstuff');
  // ns.run("c2c/find_targets.js", 1, 1, "early")
}
