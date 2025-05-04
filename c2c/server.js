const IGNORE = ["darkweb", "home"]

const TARGET_PORT = 9000
const GOAL_PORT = 9001

const TIMEOUT_SEC = 10
const TIMEOUT_MIN = 2

const SCRIPTS_DIR = "c2c/actions/"
const COMMANDS = {
  hack: { src: "hack.js", mult: 0.1, targeted: true },
  grow: { src: "grow.js", mult: 0.7, targeted: true },
  weaken: {
    src: "weaken.js", mult: 0.2, targeted: true
  },
  ddos: { src: "grow.js", targeted: true },
  share: { src: "share_ram.js", targeted: false }
}

/** @param {NS} ns */
function disable_logs(ns) {
  var logs = ["scan", "exec", "scp", "killall", "kill", 'getServerRequiredHackingLevel', 'getHackingLevel', 'getServerNumPortsRequired', 'getServerUsedRam', 'getServerMaxRam', 'sleep']
  for (var i in logs) {
    ns.disableLog(logs[i])
  }
}

function determine_optimal_task(target_allocation) {
  let taskCounts = { hack: 0, grow: 0, weaken: 0 };

  if (target_allocation) {
    Object.entries(target_allocation.tasks).forEach(([task, count]) => {
      taskCounts[task] += count;
    });
  }

  const total = taskCounts.hack + taskCounts.grow + taskCounts.weaken;
  if (total === 0) {
    return "weaken"; // Start with weakening for a new botnet
  }

  const hackRatio = taskCounts.hack / total;
  const growRatio = taskCounts.grow / total;
  const weakenRatio = taskCounts.weaken / total;

  if (weakenRatio < COMMANDS.weaken.mult) return "weaken";
  if (growRatio < COMMANDS.grow.mult) return "grow";
  if (hackRatio < COMMANDS.hack.mult) return "hack";

  // Default strategy prioritizes growth
  return "grow";
}

/** @param {NS} ns */
function select_best_target(state, availableTargets, threadCount) {
  const targets = JSON.parse(JSON.stringify(availableTargets));

  // Apply diminishing returns based on current deployment
  targets.forEach(target => {
    // Analyze current state for this target
    const data = target.data;

    // Start with the base score
    let adjustedScore = target.score;

    // Apply diminishing returns if we already have bots on this target
    if (state.allocations && state.allocations[target.hostname]) {
      const deployedThreads = state.allocations[target.hostname].threads || 0;
      const deploymentFactor = 1 / Math.log(deployedThreads + Math.E); // Logarithmic diminishing returns
      adjustedScore *= deploymentFactor;
    }

    // Consider thread efficiency - some targets might be too small for many threads
    if (threadCount > 10) {
      // For large thread counts, prefer targets with more money
      adjustedScore *= Math.log10(Math.max(data.money.max, 10));
    }

    // Update the score
    target.adjustedScore = adjustedScore;
  });

  // Sort by adjusted score
  targets.sort((a, b) => b.adjustedScore - a.adjustedScore);

  // Return the best target, or null if no targets available
  return targets.length > 0 ? targets[0] : null;
}

const base_allocation = {
  grow: 0,
  weaken: 0,
  hack: 0,
  ddos: 0,
}

const base_c2c_state = {
  allocations: {},
  grow: [],
  weaken: [],
  hack: [],
  ddos: [],
  share: []
}

/** @param {NS} ns */
export function c2c_setup(ns, server, command, threads, target) {
  const script = SCRIPTS_DIR + command.src;

  ns.killall(server)
  ns.scp(script, server, "home")

  if (command.targeted) {
    ns.exec(script, server, threads, target);
  } else {
    ns.exec(script, server, threads);
  }
}

/** @param {NS} ns */
export async function main(ns) {
  disable_logs(ns)

  let goal = undefined;
  let targets = [];
  let useless = [...IGNORE];
  let c2c_state = structuredClone(base_c2c_state);

  while (true) {
    const target_port_data = ns.peek(TARGET_PORT)
    const goal_port_data = ns.peek(GOAL_PORT)

    if (goal_port_data !== "" && goal_port_data !== "NULL PORT DATA") {
      goal = typeof (goal_port_data) === "str" ? goal_port_data.strip() : goal_port_data;

      c2c_state = structuredClone(base_c2c_state);

      targets.forEach((target) => {
        target.tasks = structuredClone(base_allocation);
        c2c_state.allocations[target.hostname] = target
      })

      ns.print("c2c: Set goal to " + goal)
    }

    if (target_port_data != "" && target_port_data !== "NULL PORT DATA") {
      const new_targets = JSON.parse(target_port_data);

      targets = new_targets;
      c2c_state = structuredClone(base_c2c_state);

      targets.forEach((target) => {
        target.tasks = structuredClone(base_allocation);
        c2c_state.allocations[target.hostname] = target
      })

      const target_names = targets.map(t => t.hostname);
      ns.print("c2c: Set targets to " + target_names.join(", "))
    }

    if (targets.length === 0 || !goal) {
      const missing = !goal ? !targets ? "targets and goal" : "goal" : "targets"
      ns.print("c2c: No " + missing + ", waiting " + TIMEOUT_SEC + "s")
      ns.toast("c2c: No " + missing + ", waiting " + TIMEOUT_SEC + "s", "info")
      await ns.sleep(1000 * TIMEOUT_SEC)

      continue
    }

    let servers = Array(ns.scan())[0]
    let serv_set = Array(servers)
    serv_set.push("home")

    let i = 0
    while (i < servers.length) {
      let server = servers[i];

      if (!useless.includes(server) && ns.hasRootAccess(server)) {
        // New server
        if (!c2c_state.ddos.includes(server) && !c2c_state.share.includes(server) && !c2c_state.grow.includes(server) && !c2c_state.weaken.includes(server) && !c2c_state.hack.includes(server)) {

          const threads_guess = Math.floor(ns.getServerMaxRam(server) / 1.75);
          // const target = select_best_target(c2c_state, targets, threads_guess);
          const target = targets[Math.floor(Math.random() * targets.length)];
          let command_name = undefined;

          if (goal === "ddos" && !c2c_state.ddos.includes(server)) { command_name = "ddos" }
          if (goal === "share" && !c2c_state.share.includes(server)) { command_name = "share" }
          if (goal === "hack" && !c2c_state.grow.includes(server) && !c2c_state.weaken.includes(server) && !c2c_state.hack.includes(server)) {
            command_name = determine_optimal_task(c2c_state.allocations[target.hostname]);
          }

          if (!command_name) { continue }

          const command = COMMANDS[command_name];
          const threads = Math.floor(ns.getServerMaxRam(server) / ns.getScriptRam(SCRIPTS_DIR + command.src));

          if (threads <= 0) {
            ns.print("c2c: Skiping 0 RAM server " + server)
            ns.toast("c2c: Skiping 0 RAM server " + server, "warning")
            useless.push(server)
          } else {
            if (COMMANDS[command_name].targeted && !target) {
              ns.print("c2c: No valid target for " + server + " [" + command_name + "|" + threads + "]")
              ns.toast("c2c: No valid target for " + server + " [" + command_name + "|" + threads + "]", "error")
              continue
            }

            ns.print("c2c: " + server + " | " + command_name + "[" + threads + "]" + (target ? "@" + target.hostname : ""))
            ns.toast("c2c: " + server + " | " + command_name + "[" + threads + "]" + (target ? "@" + target.hostname : ""))

            c2c_setup(ns, server, command, threads, target.hostname)

            c2c_state[command_name].push(server);
            c2c_state.allocations[target.hostname].tasks[command_name] += threads
          }
        }
        else if ((ns.getServerMaxRam(server) - ns.getServerUsedRam(server)) > 1.75) {
          // There is a chance we can squeeze more threads out from this server
          // 1. Get the name of the script that is running
          const processes = ns.ps(server);
          if (processes.length === 0) {
            ns.print("c2c: Server " + server + " has no running scripts despite being in a c2c list");
            continue;
          }

          const process = processes[0]; // Assuming only one script per server in c2c design
          const scriptName = process.filename;
          const scriptArgs = process.args;

          // 2. Recalculate available threads
          const scriptRam = ns.getScriptRam(scriptName, server);
          const availableRam = ns.getServerMaxRam(server) - ns.getServerUsedRam(server);
          const additionalThreads = Math.floor(availableRam / scriptRam);

          if (additionalThreads <= 0) {
            continue; // Not enough RAM for even one more thread
          }

          // 3. If new calculation bigger than previous thread count, deploy again
          const currentThreads = process.threads;
          const totalThreads = currentThreads + additionalThreads;

          // Determine which command category this server belongs to
          let commandName = null;
          let targetHostname = null;

          if (c2c_state.hack.includes(server)) {
            commandName = "hack";
          } else if (c2c_state.grow.includes(server)) {
            commandName = "grow";
          } else if (c2c_state.weaken.includes(server)) {
            commandName = "weaken";
          } else if (c2c_state.ddos.includes(server)) {
            commandName = "ddos";
          } else if (c2c_state.share.includes(server)) {
            commandName = "share";
          }

          // Get target from args if it's a targeted command
          if (scriptArgs.length > 0 && COMMANDS[commandName].targeted) {
            targetHostname = scriptArgs[0];
          }

          // Terminate current script and start a new one with more threads
          ns.kill(scriptName, server, ...scriptArgs);

          if (COMMANDS[commandName].targeted && targetHostname) {
            ns.exec(scriptName, server, totalThreads, targetHostname);

            // Update allocation count in the state
            if (c2c_state.allocations[targetHostname]) {
              c2c_state.allocations[targetHostname].tasks[commandName] += additionalThreads;
            }
          } else {
            ns.exec(scriptName, server, totalThreads);
          }

          // 4. Print and toast appropriate message
          ns.print("c2c: Upgraded " + server + " | " + commandName + "[+" + additionalThreads + " → " + totalThreads + "]" + (targetHostname ? "@" + targetHostname : ""));
          ns.toast("c2c: Upgraded " + server + " | " + commandName + "[+" + additionalThreads + " → " + totalThreads + "]" + (targetHostname ? "@" + targetHostname : ""), "success");
        }
        await ns.sleep(1000)
      }

      // Find new servers
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

    await ns.sleep(60000 * TIMEOUT_MIN)
  }
}