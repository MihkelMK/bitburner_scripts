const IGNORE = ["darkweb"]

const STATE_PORT = 9000
const GOAL_PORT = 9001
const TARGET_PORT = 9002
const HOME_RESERVE_PORT = 9003

const REBALANCE_INTERVAL = 10 * 60 * 1000; // Rebalance every 10 minutes
const TIMEOUT_SEC = 10
const TIMEOUT_MIN = 2

const SCRIPTS_DIR = "c2c/actions/"
const COMMANDS = {
  hack: { src: "hack.js", mult: 0.05, targeted: true },
  grow: { src: "grow.js", mult: 0.775, targeted: true },
  weaken: {
    src: "weaken.js", mult: 0.175, targeted: true
  },
  ddos: { src: "grow.js", targeted: true },
  share: { src: "share_ram.js", targeted: false }
}

function printServerTaskStats(ns, serverData) {
  try {
    notify(ns, "Printing C2C state")

    // Create a safety check for empty or invalid serverData
    if (!serverData || Object.keys(serverData).length === 0) {
      notify(ns, "No server allocation data available.");
      return;
    }

    // Initialize column widths with minimum values
    const columnWidths = {
      hostname: 8,      // Minimum width for 'hostname'
      growValue: 4,     // Minimum width for 'grow' 
      weakenValue: 6,   // Minimum width for 'weaken'
      hackValue: 4,     // Minimum width for 'hack'
      percent: 8,       // Width for percentage (fixed)
      total: 5          // Minimum width for 'total'
    };

    // Store cell content for all rows to calculate width and reuse when printing
    const tableRows = [];

    // Helper function to update column width based on content
    function updateColumnWidth(column, content) {
      const contentLength = content.toString().length;
      if (contentLength > columnWidths[column]) {
        columnWidths[column] = contentLength;
      }
    }

    // Update column widths based on header text
    updateColumnWidth('hostname', 'hostname');
    updateColumnWidth('total', 'total');

    // Process each server and update column widths
    for (const hostname in serverData) {
      // Skip if hostname is invalid or server data is missing
      if (!hostname || !serverData[hostname] || !serverData[hostname].tasks) {
        continue;
      }

      const server = serverData[hostname];
      const tasks = server.tasks;

      // Calculate totals
      const totalTasks = tasks.grow + tasks.weaken + tasks.hack;

      // Skip if there are no tasks
      if (totalTasks === 0) {
        continue;
      }

      // Calculate percentages
      const growPercent = (tasks.grow / totalTasks * 100).toFixed(1);
      const weakenPercent = (tasks.weaken / totalTasks * 100).toFixed(1);
      const hackPercent = (tasks.hack / totalTasks * 100).toFixed(1);

      // Format values
      const growValue = formatNumber(tasks.grow);
      const weakenValue = formatNumber(tasks.weaken);
      const hackValue = formatNumber(tasks.hack);
      const totalValue = formatNumber(totalTasks);

      // Update column widths based on content
      updateColumnWidth('hostname', hostname);
      updateColumnWidth('growValue', growValue);
      updateColumnWidth('weakenValue', weakenValue);
      updateColumnWidth('hackValue', hackValue);
      updateColumnWidth('total', totalValue);

      // Store row data for later printing
      tableRows.push({
        hostname,
        growValue,
        growPercent,
        weakenValue,
        weakenPercent,
        hackValue,
        hackPercent,
        totalValue
      });
    }

    // Helper function to pad strings to specified width
    function padStringLeft(str, width) {
      return str.toString().padEnd(width);
    }
    // Helper function to right-align string to specified width
    function padStringRight(str, width) {
      return str.toString().padStart(width);
    }
    // Helper function to right-align string to specified width
    function padStringCenter(str, width) {
      const text = str.toString()
      const textWidth = text.length;

      const totalPadding = width - textWidth;
      const halfPadded = textWidth + totalPadding / 2

      return str.toString().padStart(halfPadded).padEnd(width);
    }

    // Calculate total column widths
    const growColWidth = columnWidths.growValue + columnWidths.percent;
    const weakenColWidth = columnWidths.weakenValue + columnWidths.percent;
    const hackColWidth = columnWidths.hackValue + columnWidths.percent;

    // Print table header
    const header = `| ${padStringLeft('hostname', columnWidths.hostname)} | ${padStringCenter('grow', growColWidth)} | ${padStringCenter('weaken', weakenColWidth)} | ${padStringCenter('hack', hackColWidth)} | ${padStringRight('total', columnWidths.total)} |`;
    const separator = `| ${'-'.repeat(columnWidths.hostname)} | ${'-'.repeat(growColWidth)} | ${'-'.repeat(weakenColWidth)} | ${'-'.repeat(hackColWidth)} | ${'-'.repeat(columnWidths.total)} |`;

    ns.print(header);
    ns.print(separator);

    // Print each row with dynamic widths
    for (const row of tableRows) {
      // Format each cell with aligned percentages
      const growText = `${padStringRight(row.growValue, columnWidths.growValue)} (${row.growPercent}%)`;
      const weakenText = `${padStringRight(row.weakenValue, columnWidths.weakenValue)} (${row.weakenPercent}%)`;
      const hackText = `${padStringRight(row.hackValue, columnWidths.hackValue)} (${row.hackPercent}%)`;

      const formattedRow = `| ${padStringLeft(row.hostname, columnWidths.hostname)} | ${padStringRight(growText, growColWidth)} | ${padStringRight(weakenText, weakenColWidth)} | ${padStringRight(hackText, hackColWidth)} | ${padStringRight(row.totalValue, columnWidths.total)} |`;
      ns.print(formattedRow);
    }

    ns.print("\n")
  } catch (error) {
    // Catch any errors in the table printing
    notify(ns, `Error printing table: ${error}`);
  }
}

/** @param {NS} ns */
function disable_logs(ns) {
  var logs = ["scan", "exec", "scp", "killall", "kill", 'getServerRequiredHackingLevel', 'getHackingLevel', 'getServerNumPortsRequired', 'getServerUsedRam', 'getServerMaxMoney', 'getServerMaxRam', 'getServerGrowth', 'getServerMinSecurityLevel', 'sleep']
  for (var i in logs) {
    ns.disableLog(logs[i])
  }
}

/** @param {NS} ns */
function notify(ns, message, variant) {
  if (!message) return;

  // Add timestamp to print calls
  const timestamp = new Date().toLocaleTimeString("et");
  ns.print(`[${timestamp}] ${message}`);

  // Only show toast if variant is provided
  if (variant) {
    ns.toast("c2c: " + message, variant);
  }
}

// Helper function to format numbers with 'k' suffix if over 1000
function formatNumber(num) {
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'k';
  }
  return num.toString();
}

/** @param {NS} ns */
function killAndCopy(ns, server) {
  if (server === "home") {
    // Kill all instances of currently running C2C scripts
    Object.values(COMMANDS)
      .filter(cmd => cmd.targeted)
      .forEach(cmd => {
        ns.scriptKill(cmd.src, server)
      })
  } else {
    // Kill all current scripts on the server
    ns.killall(server)

    // Copy all necessary scripts to the server
    Object.values(COMMANDS)
      .filter(cmd => cmd.targeted)
      .forEach(cmd => {
        ns.scp(SCRIPTS_DIR + cmd.src, server, "home")
      })
  }
}

/** @param {NS} ns */
export function c2c_setup(ns, server, target, reserved_on_home) {
  killAndCopy(ns, server)

  // Calculate available RAM and allocate threads proportionally
  const availableRam = getFreeRAM(ns, server, reserved_on_home);
  const scriptRams = {
    hack: ns.getScriptRam(SCRIPTS_DIR + COMMANDS.hack.src),
    grow: ns.getScriptRam(SCRIPTS_DIR + COMMANDS.grow.src),
    weaken: ns.getScriptRam(SCRIPTS_DIR + COMMANDS.weaken.src)
  };

  // Calculate total RAM needed for one "set" of scripts in the desired ratio
  const setRam =
    COMMANDS.hack.mult * scriptRams.hack +
    COMMANDS.grow.mult * scriptRams.grow +
    COMMANDS.weaken.mult * scriptRams.weaken;

  // Calculate how many complete sets we can fit
  const sets = Math.floor(availableRam / setRam);

  let hackThreads = 0;
  let growThreads = 0;
  let weakenThreads = 0;

  if (sets <= 0) {
    notify(ns, `${server} | Not enough RAM for even set`);
    // Launch grow with max threads
    growThreads = Math.floor(availableRam / scriptRams.grow);
  } else {
    // Launch all scripts with calculated threads
    hackThreads = Math.floor(sets * COMMANDS.hack.mult);
    growThreads = Math.floor(sets * COMMANDS.grow.mult);
    weakenThreads = Math.floor(sets * COMMANDS.weaken.mult);
  }

  // Add randomized delays to prevent synchronization issues
  const hackDelay = Math.floor(Math.random() * 500);
  const growDelay = Math.floor(Math.random() * 500);
  const weakenDelay = Math.floor(Math.random() * 500);

  // Ensure we have at least 1 thread for each script type
  if (hackThreads > 0) {
    ns.exec(SCRIPTS_DIR + COMMANDS.hack.src, server, hackThreads, target, hackDelay);
  }

  if (growThreads > 0) {
    ns.exec(SCRIPTS_DIR + COMMANDS.grow.src, server, growThreads, target, growDelay);
  }

  if (weakenThreads > 0) {
    ns.exec(SCRIPTS_DIR + COMMANDS.weaken.src, server, weakenThreads, target, weakenDelay);
  }

  notify(ns, server + " | " + "g[" + formatNumber(growThreads) + "] " + "w[" + formatNumber(weakenThreads) + "] " + "h[" + formatNumber(hackThreads) + "] " + (target ? "@" + target : ""), "success")

  return {
    hack: hackThreads,
    grow: growThreads,
    weaken: weakenThreads
  };
}

// Helper function for single-script deployment (for ddos and share goals)
function c2c_setup_single(ns, server, command, threads, target = null) {
  const script = SCRIPTS_DIR + command.src;

  killAndCopy(ns, server)

  if (command.targeted && target) {
    ns.exec(script, server, threads, target);
  } else {
    ns.exec(script, server, threads);
  }
}

/** @param {NS} ns */
function optimize_server_allocation(ns, server, target, reserved_on_home) {
  try {
    // Get current processes
    const processes = ns.ps(server);

    // If no processes are running, do a full setup
    if (processes.length === 0) {
      return c2c_setup(ns, server, target);
    }

    // Group processes by script type
    const currentThreads = {
      hack: 0,
      grow: 0,
      weaken: 0
    };

    // Map script filenames to task types
    const scriptToTask = {};
    Object.entries(COMMANDS).forEach(([task, config]) => {
      if (config.targeted) {
        scriptToTask[SCRIPTS_DIR + config.src] = task;
      }
    });

    // Count current threads by task
    processes.forEach(proc => {
      const taskType = scriptToTask[proc.filename];
      if (taskType) {
        currentThreads[taskType] += proc.threads;
      }
    });

    // Calculate available RAM
    const usedRam = ns.getServerUsedRam(server);
    const maxRam = ns.getServerMaxRam(server);
    let availableRam = maxRam - usedRam;

    if (server === "home") availableRam -= reserved_on_home;

    if (availableRam < 1.75) {
      // Not enough RAM to do anything meaningful
      return false;
    }

    // Calculate script RAM requirements
    const scriptRams = {
      hack: ns.getScriptRam(SCRIPTS_DIR + COMMANDS.hack.src),
      grow: ns.getScriptRam(SCRIPTS_DIR + COMMANDS.grow.src),
      weaken: ns.getScriptRam(SCRIPTS_DIR + COMMANDS.weaken.src)
    };

    // Calculate total current threads and check ratios
    const totalCurrentThreads = currentThreads.hack + currentThreads.grow + currentThreads.weaken;

    // Current distribution
    const currentRatios = {
      hack: currentThreads.hack / totalCurrentThreads,
      grow: currentThreads.grow / totalCurrentThreads,
      weaken: currentThreads.weaken / totalCurrentThreads
    };

    // Target ratios
    const targetRatios = {
      hack: COMMANDS.hack.mult,
      grow: COMMANDS.grow.mult,
      weaken: COMMANDS.weaken.mult
    };

    // Find which script is most under its target ratio
    let mostDeficientTask = "grow"; // Default
    let biggestDeficit = 0;

    Object.entries(targetRatios).forEach(([task, targetRatio]) => {
      const deficit = targetRatio - currentRatios[task];
      if (deficit > biggestDeficit) {
        biggestDeficit = deficit;
        mostDeficientTask = task;
      }
    });

    // If no deficit, no need to adjust
    if (biggestDeficit <= 0) {
      return false;
    }

    // Calculate how many threads we can add for the deficient task
    const scriptRam = scriptRams[mostDeficientTask];
    const additionalThreads = Math.floor(availableRam / scriptRam);

    if (additionalThreads <= 0) {
      return false;
    }

    // Launch additional threads for the most deficient task
    try {
      ns.exec(SCRIPTS_DIR + COMMANDS[mostDeficientTask].src, server, additionalThreads, target);

      // Return the changes made
      const result = {
        hack: 0,
        grow: 0,
        weaken: 0
      };
      result[mostDeficientTask] = additionalThreads;

      return result;
    } catch (error) {
      notify(ns, `Error launching ${mostDeficientTask} on ${server}: ${error}`);
      return false;
    }
  } catch (error) {
    notify(ns, `Error optimizing ${server}: ${error}`);
    return false;
  }
}

function targets_have_changed(new_targets, targets) {
  const target_names = targets.map(t => t.hostname).sort();
  const new_target_names = new_targets.map(t => t.hostname).sort();

  if (target_names.length !== new_target_names.length) { return true }

  for (let target of target_names) {
    if (!new_target_names.includes(target)) {
      return true
    }
  }

  return false
}

/** 
 * Calculate value score for a server based on maximum money, growth, and security
 * @param {NS} ns - The Netscript API
 * @param {string} hostname - Server hostname
 * @returns {number} - Value score
 */
function calculateServerValue(ns, hostname) {
  // Skip if we can't hack it
  if (ns.getServerRequiredHackingLevel(hostname) > ns.getHackingLevel()) {
    return 0;
  }

  const maxMoney = ns.getServerMaxMoney(hostname);

  // Return 0 if server has no money
  if (maxMoney <= 0) return 0;

  // Simply return the max money as the value - no other factors
  return maxMoney;
}

/**
 * Select a target server using weighted selection based on value
 * @param {NS} ns - The Netscript API
 * @param {Array} targets - List of target servers
 * @returns {Object} - Selected target
 */
function selectWeightedTarget(ns, targets) {
  // Calculate values for all targets
  const targetsWithValues = targets.map(target => ({
    ...target,
    value: calculateServerValue(ns, target.hostname)
  }));

  // Get total value
  const totalValue = targetsWithValues.reduce((sum, server) => sum + server.value, 0);

  // If no valuable targets, return random one
  if (totalValue <= 0) {
    return targets[Math.floor(Math.random() * targets.length)];
  }

  // Pick a random point in the total value range
  const randomValue = Math.random() * totalValue;

  // Find which target this value falls into
  let accumulatedValue = 0;
  for (const target of targetsWithValues) {
    accumulatedValue += target.value;
    if (randomValue <= accumulatedValue) {
      return target;
    }
  }

  // Fallback in case of rounding errors
  return targetsWithValues[targetsWithValues.length - 1];
}

function distributeThreadsAcrossTargets(ns, c2c_state) {
  // Skip if no targets
  if (!c2c_state.targets || c2c_state.targets.length === 0) return;

  // Calculate total value of all targets
  let totalValue = 0;
  const targetsWithValues = [];

  for (const target of c2c_state.targets) {
    const value = calculateServerValue(ns, target.hostname);
    if (value > 0) {
      targetsWithValues.push({
        ...target,
        value
      });
      totalValue += value;
    }
  }

  // Skip if no valuable targets
  if (totalValue <= 0 || targetsWithValues.length === 0) return;

  // Calculate the desired proportion for each target based on max money
  const targetProportions = {};
  for (const target of targetsWithValues) {
    targetProportions[target.hostname] = target.value / totalValue;
  }

  // Calculate total threads currently allocated across all targets
  let totalHackThreads = 0;
  let totalGrowThreads = 0;
  let totalWeakenThreads = 0;

  for (const targetName in c2c_state.allocations) {
    const allocation = c2c_state.allocations[targetName];
    if (allocation && allocation.tasks) {
      totalHackThreads += allocation.tasks.hack || 0;
      totalGrowThreads += allocation.tasks.grow || 0;
      totalWeakenThreads += allocation.tasks.weaken || 0;
    }
  }

  // Calculate the total threads across all operations
  const totalThreads = totalHackThreads + totalGrowThreads + totalWeakenThreads;

  // If no threads are allocated yet, nothing to redistribute
  if (totalThreads <= 0) return;

  // Determine the desired number of threads for each target based on proportion
  const targetDesiredThreads = {};
  for (const targetName in targetProportions) {
    const proportion = targetProportions[targetName];
    const desiredThreads = Math.floor(totalThreads * proportion);

    targetDesiredThreads[targetName] = {
      total: desiredThreads,
      // Maintain the same h/g/w ratio for each target
      hack: Math.floor(desiredThreads * (totalHackThreads / totalThreads)),
      grow: Math.floor(desiredThreads * (totalGrowThreads / totalThreads)),
      weaken: Math.floor(desiredThreads * (totalWeakenThreads / totalThreads))
    };
  }

  return targetDesiredThreads;
}

function needsRebalancing(ns, c2c_state) {
  const targetDesiredThreads = distributeThreadsAcrossTargets(ns, c2c_state);
  if (!targetDesiredThreads) return false;

  // Check if any target's current allocation is significantly different from desired
  const THRESHOLD = 0.2; // 20% difference threshold to avoid constant rebalancing

  for (const targetName in targetDesiredThreads) {
    const desired = targetDesiredThreads[targetName].total;

    // Get current allocation
    const current = c2c_state.allocations[targetName]?.tasks
      ? c2c_state.allocations[targetName].tasks.hack +
      c2c_state.allocations[targetName].tasks.grow +
      c2c_state.allocations[targetName].tasks.weaken
      : 0;

    // Calculate the difference as a proportion
    if (current === 0) {
      if (desired > 0) return true;
    } else {
      const diff = Math.abs((desired - current) / current);
      if (diff > THRESHOLD) return true;
    }
  }

  return false;
}

function rebalanceTargets(ns, c2c_state) {
  const targetDesiredThreads = distributeThreadsAcrossTargets(ns, c2c_state);
  if (!targetDesiredThreads) return false;

  notify(ns, "Rebalancing target allocations based on max money...", "info");

  // We'll need to kill and reallocate resources
  // First, gather all server resources
  const allServers = [...new Set([...c2c_state.hack, ...c2c_state.grow, ...c2c_state.weaken])];

  // Kill all existing scripts
  for (const server of allServers) {
    killAndCopy(ns, server);
  }

  // Reset allocation state
  for (const targetName in c2c_state.allocations) {
    if (c2c_state.allocations[targetName].tasks) {
      c2c_state.allocations[targetName].tasks = structuredClone(base_allocation);
    }
  }

  // Reset server lists
  c2c_state.hack = [];
  c2c_state.grow = [];
  c2c_state.weaken = [];

  // Now reallocate based on desired distribution
  for (const server of allServers) {
    // Select target based on which one needs more threads to reach its desired allocation
    let bestTarget = null;
    let biggestDeficit = -1;

    for (const targetName in targetDesiredThreads) {
      const desired = targetDesiredThreads[targetName].total;
      const current = c2c_state.allocations[targetName]?.tasks
        ? c2c_state.allocations[targetName].tasks.hack +
        c2c_state.allocations[targetName].tasks.grow +
        c2c_state.allocations[targetName].tasks.weaken
        : 0;

      const deficit = desired - current;
      if (deficit > biggestDeficit) {
        biggestDeficit = deficit;
        bestTarget = targetName;
      }
    }

    if (bestTarget) {
      // Set up scripts on this server targeting the selected target
      const allocatedThreads = c2c_setup(ns, server, bestTarget, c2c_state.reserved_on_home);

      if (allocatedThreads) {
        // Update tracking lists
        if (allocatedThreads.hack > 0 && !c2c_state.hack.includes(server)) {
          c2c_state.hack.push(server);
        }
        if (allocatedThreads.grow > 0 && !c2c_state.grow.includes(server)) {
          c2c_state.grow.push(server);
        }
        if (allocatedThreads.weaken > 0 && !c2c_state.weaken.includes(server)) {
          c2c_state.weaken.push(server);
        }

        // Update allocation counts
        if (!c2c_state.allocations[bestTarget]) {
          c2c_state.allocations[bestTarget] = {
            hostname: bestTarget,
            tasks: structuredClone(base_allocation)
          };
        }

        c2c_state.allocations[bestTarget].tasks.hack += allocatedThreads.hack;
        c2c_state.allocations[bestTarget].tasks.grow += allocatedThreads.grow;
        c2c_state.allocations[bestTarget].tasks.weaken += allocatedThreads.weaken;
      }
    }
  }

  return true;
}

/** @param {NS} ns */
function getRAMUsedByC2C(ns, server) {
  let C2CRam = 0;
  // Get current processes
  const processes = ns.ps(server);

  if (processes.length === 0) {
    return 0;
  }

  // Map script filenames to task types
  const scriptToTask = {};
  Object.entries(COMMANDS).forEach(([task, config]) => {
    if (config.targeted) {
      scriptToTask[SCRIPTS_DIR + config.src] = task;
    }
  });

  // Add RAM used by any of our C2C actions
  processes.forEach(proc => {
    const taskType = scriptToTask[proc.filename];
    if (taskType) {
      // One of our scripts, add threads time RAM usage to total
      C2CRam += proc.threads * ns.getScriptRam(proc.filename);
    }
  });
  return C2CRam
}

/** @param {NS} ns */
function getFreeRAM(ns, server, reserved_on_home) {
  const maxRam = ns.getServerMaxRam(server);

  // RAM used by scripts we don't controll
  const allocated = ns.getServerUsedRam(server) - getRAMUsedByC2C(ns, server);

  return server === "home" ? maxRam - allocated - reserved_on_home : maxRam;
}

/** @param {NS} ns */
function enforceHomeReservation(ns, c2c_state) {
  if (c2c_state.reserved_on_home <= 0) return false;

  const maxRam = ns.getServerMaxRam("home");
  const usedRam = ns.getServerUsedRam("home");
  const currentlyFree = maxRam - usedRam;

  // Check if our reservation is violated
  if (currentlyFree < c2c_state.reserved_on_home) {
    const needToFree = c2c_state.reserved_on_home - currentlyFree;
    notify(ns, `home | Freeing ${needToFree.toFixed(2)}GB of RAM`, "info");

    // Get all C2C processes running on home
    const processes = ns.ps("home");
    const c2cProcesses = processes.filter(proc => {
      return Object.values(COMMANDS).some(cmd =>
        SCRIPTS_DIR + cmd.src === proc.filename
      );
    });

    // Create a mapping of script filenames to task types
    const scriptToTask = {};
    Object.entries(COMMANDS).forEach(([task, config]) => {
      scriptToTask[SCRIPTS_DIR + config.src] = task;
    });

    // Sort by RAM usage (highest first) to kill fewer processes
    c2cProcesses.sort((a, b) => {
      const aRam = ns.getScriptRam(a.filename) * a.threads;
      const bRam = ns.getScriptRam(b.filename) * b.threads;
      return bRam - aRam;
    });

    // Kill processes until we've freed enough RAM
    let freedRam = 0;
    for (const proc of c2cProcesses) {
      const procRam = ns.getScriptRam(proc.filename) * proc.threads;

      // Before killing, determine target server and task type
      const taskType = scriptToTask[proc.filename];
      let targetServer = null;

      // Extract target server from args (if it's a targeted task)
      if (proc.args && proc.args.length > 0) {
        targetServer = proc.args[0];
      }

      // Kill the process
      ns.kill(proc.pid);
      freedRam += procRam;

      // Update allocation counts in c2c_state
      if (targetServer && taskType && c2c_state.allocations[targetServer]) {
        // Decrement thread count for this task type
        if (c2c_state.allocations[targetServer].tasks[taskType]) {
          c2c_state.allocations[targetServer].tasks[taskType] -= proc.threads;
          // Ensure we don't go below zero
          if (c2c_state.allocations[targetServer].tasks[taskType] < 0) {
            c2c_state.allocations[targetServer].tasks[taskType] = 0;
          }
        }

        notify(ns, `Killed ${taskType} process (${proc.threads} threads) targeting ${targetServer} to free ${procRam.toFixed(2)}GB`, "warning");
      } else {
        notify(ns, `Killed process ${proc.filename} (${proc.threads} threads) to free ${procRam.toFixed(2)}GB`, "warning");
      }

      if (freedRam >= needToFree) break;
    }

    // Update the server lists
    const isHome = (server) => server === "home";
    c2c_state.hack = c2c_state.hack.filter(server => !isHome(server));
    c2c_state.grow = c2c_state.grow.filter(server => !isHome(server));
    c2c_state.weaken = c2c_state.weaken.filter(server => !isHome(server));
    c2c_state.ddos = c2c_state.ddos.filter(server => !isHome(server));
    c2c_state.share = c2c_state.share.filter(server => !isHome(server));

    return true;
  }

  return false;
}

const base_allocation = {
  grow: 0,
  weaken: 0,
  hack: 0,
  ddos: 0,
}

const base_c2c_state = {
  allocations: {},
  hack: [],
  grow: [],
  weaken: [],
  ddos: [],
  share: [],
  goal: undefined,
  targets: [],
  reserved_on_home: 0
}

/** @param {NS} ns */
export async function main(ns) {
  disable_logs(ns)

  let useless = [...IGNORE];
  let lastRebalanceTime = Date.now();

  let c2c_state = structuredClone(base_c2c_state);

  try {
    const savedStateData = ns.peek(STATE_PORT);
    if (savedStateData && savedStateData !== "NULL PORT DATA" && savedStateData !== "") {
      const savedState = JSON.parse(savedStateData);

      // Load saved state if it exists
      if (savedState && typeof (savedState) === "object" && Object.keys(base_c2c_state).every(key => savedState.hasOwnProperty(key))) {
        c2c_state = savedState;

        // Restore goal and targets from saved state if they exist
        if (savedState.goal) {
          notify(ns, "Restored goal: " + savedState.goal, "info");
        }

        if (savedState.targets && savedState.targets.length > 0) {
          const targetNames = savedState.targets.map(t => t.hostname);
          notify(ns, "Restored targets: " + targetNames.join(", "), "info");
        }
      }
    }
  } catch (error) {
    notify(ns, "Error loading saved state: " + error, "error");
    c2c_state = structuredClone(base_c2c_state);
  }

  while (true) {
    const goal_port_data = ns.peek(GOAL_PORT)
    const target_port_data = ns.peek(TARGET_PORT)
    const home_reserv_port_data = ns.peek(HOME_RESERVE_PORT)

    let targetsChanged = false;

    set_goal: if (goal_port_data !== "" && goal_port_data !== "NULL PORT DATA") {
      const new_goal = typeof (goal_port_data) === "str" ? goal_port_data.strip() : goal_port_data;

      if (!new_goal || new_goal === c2c_state.goal) { break set_goal }

      c2c_state.goal = new_goal;
      c2c_state.hack = [];
      c2c_state.grow = [];
      c2c_state.weaken = [];
      c2c_state.ddos = [];
      c2c_state.share = [];

      // Reset tasks for all targets
      if (c2c_state.targets && c2c_state.targets.length > 0) {
        c2c_state.targets.forEach((target) => {
          c2c_state.allocations[target.hostname].tasks = structuredClone(base_allocation);
        });
      }

      notify(ns, "Set goal to " + new_goal, "info")
    }

    set_home_reserv: if (home_reserv_port_data !== "" && home_reserv_port_data !== "NULL PORT DATA") {
      const new_reserv = parseFloat(home_reserv_port_data);

      if (!new_reserv || new_reserv === c2c_state.reserved_on_home) { break set_home_reserv }

      notify(ns, "Set home reserve to " + new_reserv + "GB", "info")

      c2c_state.reserved_on_home = new_reserv;
      enforceHomeReservation(ns, c2c_state);
    }

    set_targets: if (target_port_data != "" && target_port_data !== "NULL PORT DATA") {
      const new_targets = JSON.parse(target_port_data);

      if (!new_targets) { break set_targets }

      if (c2c_state.targets && !targets_have_changed(new_targets, c2c_state.targets)) { break set_targets }

      c2c_state.targets = new_targets;
      c2c_state.allocations = {};
      targetsChanged = true;

      // Reset tasks for all targets
      c2c_state.targets.forEach((target) => {
        const value = calculateServerValue(ns, target.hostname)
        const tasks = structuredClone(base_allocation);
        c2c_state.allocations[target.hostname] = { ...target, value, tasks };
      });

      const target_names = c2c_state.targets.map(t => t.hostname);
      notify(ns, "Set targets to " + target_names.join(", "), "info")
    }

    if (!c2c_state.targets || c2c_state.targets.length === 0 || !c2c_state.goal) {
      const missing = !c2c_state.goal ?
        (!c2c_state.targets || c2c_state.targets.length === 0) ? "targets and goal" : "goal"
        : "targets";
      notify(ns, "No " + missing + ", waiting " + TIMEOUT_SEC + "s", "info")
      await ns.sleep(1000 * TIMEOUT_SEC)

      continue
    }

    // If targets changed or it's time for a periodic rebalance, check if rebalancing is needed
    const timeForRebalance = Date.now() - lastRebalanceTime > REBALANCE_INTERVAL;
    if ((targetsChanged || timeForRebalance) && c2c_state.goal === "hack") {
      if (needsRebalancing(ns, c2c_state)) {
        rebalanceTargets(ns, c2c_state);
        lastRebalanceTime = Date.now();
      } else if (timeForRebalance) {
        notify(ns, "Checked target balance - no rebalancing needed", "info");
        lastRebalanceTime = Date.now();
      }
    }

    let servers = Array(ns.scan())[0]
    let serv_set = Array(servers)
    servers.push("home")
    serv_set.push("home")

    let i = 0
    while (i < servers.length) {
      let server = servers[i];

      if (!useless.includes(server) && ns.hasRootAccess(server)) {
        if (ns.getServerMaxRam(server) === 0) {
          notify(ns, server + " | 0 RAM, skipping", "info")
          useless.push(server)
          i++;
          continue
        }

        // Handle different goals
        if (c2c_state.goal === "ddos" && !c2c_state.ddos.includes(server)) {
          // DDOS logic remains unchanged
          const command = COMMANDS["ddos"];
          const threads = Math.floor(getFreeRAM(ns, server, c2c_state.reserved_on_home) / ns.getScriptRam(SCRIPTS_DIR + command.src));

          if (threads <= 0) {
            useless.push(server);
          } else {
            const target = c2c_state.targets[Math.floor(Math.random() * c2c_state.targets.length)];
            if (!target) {
              notify(ns, "No valid target for " + server + " [ddos]");
              i++;
              continue;
            }

            notify(ns, server + " | ddos[" + threads + "] @ " + target.hostname, "success");
            c2c_setup_single(ns, server, command, threads, target.hostname);
            c2c_state.ddos.push(server);
          }
        }
        else if (c2c_state.goal === "share" && !c2c_state.share.includes(server)) {
          // Share logic remains unchanged
          const command = COMMANDS["share"];
          const threads = Math.floor(getFreeRAM(ns, server, c2c_state.reserved_on_home) / ns.getScriptRam(SCRIPTS_DIR + command.src));

          if (threads <= 0) {
            useless.push(server);
          } else {
            notify(ns, server + " | share[" + threads + "]", "success");
            c2c_setup_single(ns, server, command, threads);
            c2c_state.share.push(server);
          }
        }
        else if (c2c_state.goal === "hack") {
          // For hack goal, check if server is already allocated to any task
          const isAllocated = c2c_state.grow.includes(server) ||
            c2c_state.weaken.includes(server) ||
            c2c_state.hack.includes(server) ||
            c2c_state.ddos.includes(server) ||
            c2c_state.share.includes(server);

          const target = selectWeightedTarget(ns, c2c_state.targets);
          if (!target) {
            notify(ns, "No valid target for " + server);
            i++;
            continue;
          }

          let allocatedThreads;

          if (!isAllocated) {
            // New server - set up all scripts in proper ratio
            allocatedThreads = c2c_setup(ns, server, target.hostname, c2c_state.reserved_on_home);

            if (allocatedThreads) {
              // Add server to all task lists since it's running all types
              c2c_state.hack.push(server);
              c2c_state.grow.push(server);
              c2c_state.weaken.push(server);
            } else {
              useless.push(server);
              i++;
              continue;
            }
          } else {
            // Existing server - optimize current allocation
            allocatedThreads = optimize_server_allocation(ns, server, target.hostname, c2c_state.reserved_on_home);

            if (!allocatedThreads) {
              i++;
              continue; // Nothing changed
            }

            const hackAdded = allocatedThreads.hack > 0;
            const growAdded = allocatedThreads.grow > 0;
            const weakenAdded = allocatedThreads.weaken > 0;

            // Update server task lists if needed
            if (hackAdded && !c2c_state.hack.includes(server)) {
              c2c_state.hack.push(server);
            }
            if (growAdded && !c2c_state.grow.includes(server)) {
              c2c_state.grow.push(server);
            }
            if (weakenAdded && !c2c_state.weaken.includes(server)) {
              c2c_state.weaken.push(server);
            }

            notify(ns, `Optimized ${server} | ${hackAdded ? '+h[' + formatNumber(allocatedThreads.hack) + '] ' : ''}${growAdded ? '+g[' + formatNumber(allocatedThreads.grow) + '] ' : ''}${weakenAdded ? '+h[' + formatNumber(allocatedThreads.weaken) + '] ' : ''}@${target.hostname}`, "success");
          }

          // Update allocation counts in state
          if (allocatedThreads) {
            // Make sure the target allocation exists
            if (!c2c_state.allocations[target.hostname]) {
              c2c_state.allocations[target.hostname] = {
                tasks: structuredClone(base_allocation)
              };
            }

            c2c_state.allocations[target.hostname].tasks.hack += allocatedThreads.hack;
            c2c_state.allocations[target.hostname].tasks.grow += allocatedThreads.grow;
            c2c_state.allocations[target.hostname].tasks.weaken += allocatedThreads.weaken;
          }
        }
        await ns.sleep(1000);
      }

      // Find new servers
      let s = ns.scan(server)
      for (let j in s) {
        let con = s[j]
        if (!serv_set.includes(con)) {
          serv_set.push(con)
          servers.push(con)
        }
      }
      i += 1
    }

    ns.clearPort(STATE_PORT);
    ns.writePort(STATE_PORT, JSON.stringify(c2c_state));

    try {
      printServerTaskStats(ns, c2c_state.allocations)
    } catch (tableError) {
      notify(ns, `Error in table printing: ${tableError}`);
    }

    // Add explicit delay to prevent infinite loops
    notify(ns, `Sleeping for ${TIMEOUT_MIN} minutes...`);
    await ns.sleep(60000 * TIMEOUT_MIN)
  }
}