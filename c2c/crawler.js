const IGNORE = ["darkweb", "home"]
const SLEEP_MIN = 2

/** @param {NS} ns */
function disable_logs(ns) {
  var logs = ["scan", "run", 'getServerRequiredHackingLevel', 'getHackingLevel', 'getServerNumPortsRequired']
  for (var i in logs) {
    ns.disableLog(logs[i])
  }
}

/** @param {NS} ns */
function run_hacks(ns, server, hacks_dict) {
  let hacks = 0
  for (let hack in hacks_dict) {
    if (hacks_dict[hack]) {
      hacks += 1
      switch (hack) {
        case "brute": ns.brutessh(server); break;
        case "ftp": ns.ftpcrack(server); break;
        case "http": ns.httpworm(server); break;
        case "sql": ns.sqlinject(server); break;
        case "smtp": ns.relaysmtp(server); break;
      }
    }
  }
  return hacks
}


/** @param {NS} ns */
export function hack_target(ns, target, hacks) {
  // Make sure we can actually NUKE this server
  let ports_needed = ns.getServerNumPortsRequired(target);

  const hacked_ports = run_hacks(ns, target, hacks)

  if (ports_needed > hacked_ports) {
    ns.print("Not enough open ports to hack " + target, "error")
    return false
  }

  // Get root access to target server
  ns.nuke(target);

  if (ns.hasRootAccess(target)) {
    ns.toast(target + " has been nuked")
    return true
  }

  ns.toast("Failed to hack " + target, "error")
  return false
}

/** @param {NS} ns */
export async function main(ns) {
  disable_logs(ns)
  while (true) {
    let hacks_dict = {
      "brute": ns.fileExists("BruteSSH.exe"),
      "ftp": ns.fileExists("FTPCrack.exe"),
      "http": ns.fileExists("HTTPWorm.exe"),
      "sql": ns.fileExists("SQLInject.exe"),
      "smtp": ns.fileExists("relaySMTP.exe"),
    }

    let servers = Array(ns.scan())[0]
    let serv_set = Array(servers)
    serv_set.push("home")

    let i = 0
    while (i < servers.length) {
      let server = servers[i]
      if (!ns.hasRootAccess(server) && ns.getServerRequiredHackingLevel(server) <= ns.getHackingLevel() && !IGNORE.includes(server) && !server.includes("pserv")) {
        ns.print("attempting to hack ", server)
        hack_target(ns, server, hacks_dict)

        await ns.sleep(1000)
      }

      // Look for new servers
      let s = ns.scan(server)
      for (let j in s) {
        let con = s[j]
        if (!serv_set.includes(con)) {
          //if (serv_set.indexOf(con) < 0) {
          serv_set.push(con)
          servers.push(con)
        }
      }
      i += 1
    }

    await ns.sleep(60000 * SLEEP_MIN)
  }
}