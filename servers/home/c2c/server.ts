import {
  C2CState,
  CommandConfig,
  Commands,
  ServerAllocation,
  Target,
  TaskAllocation,
} from '../types/c2c';

import {
  STATE_PORT,
  GOAL_PORT,
  TARGET_PORT,
  HOME_RESERVE_PORT,
} from '../helpers/ports';
import { disable_logs, notify, inform } from '../helpers/cli';

const IGNORE = ['darkweb'];

const TIMEOUT_SEC = 10;
const TIMEOUT_MIN = 1;

const SCRIPTS_DIR = 'c2c/actions/';
const COMMANDS: Commands = {
  hack: { src: 'hack.js', mult: 0.05, targeted: true, ram: 1.7 },
  grow: { src: 'grow.js', mult: 0.775, targeted: true, ram: 1.75 },
  weaken: {
    src: 'weaken.js',
    mult: 0.175,
    targeted: true,
    ram: 1.75,
  },
  ddos: { src: 'grow.js', targeted: true, ram: 1.75 },
  share: { src: 'share_ram.js', targeted: false, ram: 4 },
};
// const COMMANDS: Commands = {
//   hack: { src: 'hack.js', mult: 0.15, targeted: true },
//   grow: { src: 'grow.js', mult: 0.6, targeted: true },
//   weaken: {
//     src: 'weaken.js',
//     mult: 0.25,
//     targeted: true,
//   },
//   ddos: { src: 'grow.js', targeted: true },
//   share: { src: 'share_ram.js', targeted: false },
// };
// const COMMANDS: Commands = {
//   hack: { src: "hack.js", mult: 0.0, targeted: true },
//   grow: { src: "grow.js", mult: 0.7, targeted: true },
//   weaken: {
//     src: "weaken.js", mult: 0.3, targeted: true
//   },
//   ddos: { src: "grow.js", targeted: true },
//   share: { src: "share_ram.js", targeted: false }
// }

// Calculate total RAM needed for one "set" of scripts in the desired ratio
const SET_RAM =
  COMMANDS.hack.mult * COMMANDS.hack.ram +
  COMMANDS.grow.mult * COMMANDS.grow.ram +
  COMMANDS.weaken.mult * COMMANDS.weaken.ram;

const BASE_ALLOCATION = {
  grow: 0,
  weaken: 0,
  hack: 0,
  ddos: 0,
};

const BASE_C2C_STATE = {
  allocations: {},
  hack: [],
  grow: [],
  weaken: [],
  ddos: [],
  share: [],
  goal: undefined,
  targets: [],
  reserved_on_home: 0,
};

// Helper function to pad strings to specified width
function padStringLeft(str: string, width: number) {
  return str.toString().padEnd(width);
}

// Helper function to right-align string to specified width
function padStringRight(str: string, width: number) {
  return str.toString().padStart(width);
}

// Helper function to right-align string to specified width
function padStringCenter(str: string, width: number) {
  const text = str.toString();
  const textWidth = text.length;

  const totalPadding = width - textWidth;
  const halfPadded = textWidth + totalPadding / 2;

  return str.toString().padStart(halfPadded).padEnd(width);
}

// Helper function to update column width based on content
function updateColumnWidth(
  columnWidths: Record<string, number>,
  column: keyof typeof columnWidths,
  content: string | number
) {
  const contentLength = content.toString().length;
  if (contentLength > columnWidths[column]) {
    columnWidths[column] = contentLength;
  }
}

function printC2CAssign(ns: NS, data: ServerAllocation[], title: string) {
  const targetsWithThreads = data.filter(
    ({ tasks }) => tasks.grow > 0 || tasks.weaken > 0 || tasks.hack > 0
  );

  if (targetsWithThreads.length === 0) {
    return;
  }

  const rows = [];
  const columnWidths = {
    hostname: 20,
    grow: 4,
    weaken: 4,
    hack: 4,
  };

  targetsWithThreads.forEach(({ hostname, tasks }) => {
    const grow = ns.formatNumber(tasks.grow, 0);
    const weaken = ns.formatNumber(tasks.weaken, 0);
    const hack = ns.formatNumber(tasks.hack, 0);

    updateColumnWidth(columnWidths, 'hostname', hostname);
    updateColumnWidth(columnWidths, 'grow', grow);
    updateColumnWidth(columnWidths, 'weaken', weaken);
    updateColumnWidth(columnWidths, 'hack', hack);

    rows.push({
      hostname,
      grow,
      weaken,
      hack,
    });
  });

  const header = `${padStringRight('grow', columnWidths.grow)} | ${padStringRight('weak', columnWidths.weaken)} | ${padStringRight('hack', columnWidths.hack)} | target`;
  const separator = `${'-'.repeat(columnWidths.grow)} | ${'-'.repeat(columnWidths.weaken)} | ${'-'.repeat(columnWidths.hack)} | ------`;

  notify(ns, title);
  inform(ns, header);
  inform(ns, separator);

  rows.forEach((row) => {
    inform(
      ns,
      `${padStringRight(row.grow, columnWidths.grow)} | ${padStringRight(row.weaken, columnWidths.weaken)} | ${padStringRight(row.hack, columnWidths.hack)} | ${row.hostname}`
    );
  });
}

function printServerTaskStats(
  ns: NS,
  serverData: { [key: string]: ServerAllocation }
) {
  try {
    notify(ns, 'Printing C2C state');

    // Create a safety check for empty or invalid serverData
    if (!serverData || Object.keys(serverData).length === 0) {
      notify(ns, 'No server allocation data available.');
      return;
    }

    // Initialize column widths with minimum values
    const columnWidths: { [key: string]: number } = {
      hostname: 8, // Minimum width for 'hostname'
      growValue: 4, // Minimum width for 'grow'
      weakenValue: 6, // Minimum width for 'weaken'
      hackValue: 4, // Minimum width for 'hack'
      percent: 8, // Width for percentage (fixed)
      total: 5, // Minimum width for 'total'
    };

    // Store cell content for all rows to calculate width and reuse when printing
    const tableRows: any[] = [];

    // Update column widths based on header text
    updateColumnWidth(columnWidths, 'hostname', 'hostname');
    updateColumnWidth(columnWidths, 'total', 'total');

    // Process each server and update column widths
    for (const hostname in serverData) {
      // Skip if hostname is invalid or server data is missing
      if (!hostname || !serverData[hostname] || !serverData[hostname].tasks) {
        continue;
      }

      const server: ServerAllocation = serverData[hostname];
      const tasks: TaskAllocation = server.tasks;

      // Calculate totals
      const totalTasks = tasks.grow + tasks.weaken + tasks.hack;

      // Skip if there are no tasks
      if (totalTasks === 0) {
        continue;
      }

      // Calculate percentages
      const growPercent = ns.formatPercent(tasks.grow / totalTasks, 1);
      const weakenPercent = ns.formatPercent(tasks.weaken / totalTasks, 1);
      const hackPercent = ns.formatPercent(tasks.hack / totalTasks, 1);

      // Format values
      const growValue = ns.formatNumber(tasks.grow, 1, undefined, true);
      const weakenValue = ns.formatNumber(tasks.weaken, 1, undefined, true);
      const hackValue = ns.formatNumber(tasks.hack, 1, undefined, true);
      const totalValue = ns.formatNumber(totalTasks, 1, undefined, true);

      // Update column widths based on content
      updateColumnWidth(columnWidths, 'hostname', hostname);
      updateColumnWidth(columnWidths, 'growValue', growValue);
      updateColumnWidth(columnWidths, 'weakenValue', weakenValue);
      updateColumnWidth(columnWidths, 'hackValue', hackValue);
      updateColumnWidth(columnWidths, 'total', totalValue);

      // Store row data for later printing
      tableRows.push({
        hostname,
        growValue,
        growPercent,
        weakenValue,
        weakenPercent,
        hackValue,
        hackPercent,
        totalValue,
      });
    }

    // Calculate total column widths
    const growColWidth = columnWidths.growValue + columnWidths.percent;
    const weakenColWidth = columnWidths.weakenValue + columnWidths.percent;
    const hackColWidth = columnWidths.hackValue + columnWidths.percent;

    // Print table header
    const header = `| ${padStringLeft('hostname', columnWidths.hostname)} | ${padStringCenter('grow', growColWidth)} | ${padStringCenter('weaken', weakenColWidth)} | ${padStringCenter('hack', hackColWidth)} | ${padStringRight('total', columnWidths.total)} |`;
    const separator = `| ${'-'.repeat(columnWidths.hostname)} | ${'-'.repeat(growColWidth)} | ${'-'.repeat(weakenColWidth)} | ${'-'.repeat(hackColWidth)} | ${'-'.repeat(columnWidths.total)} |`;

    inform(ns, header);
    inform(ns, separator);

    // Print each row with dynamic widths
    for (const row of tableRows) {
      // Format each cell with aligned percentages
      const growText = `${padStringRight(row.growValue, columnWidths.growValue)} (${row.growPercent})`;
      const weakenText = `${padStringRight(row.weakenValue, columnWidths.weakenValue)} (${row.weakenPercent})`;
      const hackText = `${padStringRight(row.hackValue, columnWidths.hackValue)} (${row.hackPercent})`;

      const formattedRow = `| ${padStringLeft(row.hostname, columnWidths.hostname)} | ${padStringRight(growText, growColWidth)} | ${padStringRight(weakenText, weakenColWidth)} | ${padStringRight(hackText, hackColWidth)} | ${padStringRight(row.totalValue, columnWidths.total)} |`;
      inform(ns, formattedRow);
    }

    inform(ns, '\n');
  } catch (error) {
    // Catch any errors in the table printing
    notify(ns, `Error printing table: ${error}`);
  }
}

function killAndCopy(ns: NS, server: string) {
  if (server === 'home') {
    // Kill all instances of currently running C2C scripts
    Object.values(COMMANDS)
      .filter((cmd) => cmd.targeted)
      .forEach((cmd) => {
        ns.scriptKill(SCRIPTS_DIR + cmd.src, server);
      });
  } else {
    // Kill all current scripts on the server
    ns.killall(server);

    // Copy all necessary scripts to the server
    Object.values(COMMANDS)
      .filter((cmd) => cmd.targeted)
      .forEach((cmd) => {
        ns.scp(SCRIPTS_DIR + cmd.src, server, 'home');
      });
  }
}

export function c2c_setup(
  ns: NS,
  server: string,
  target: string,
  availableRam: number,
  additional: boolean = false
): TaskAllocation {
  if (!additional) {
    killAndCopy(ns, server);
  }

  // Calculate how many complete sets we can fit
  const sets = Math.floor(availableRam / SET_RAM);

  let hackThreads = 0;
  let growThreads = 0;
  let weakenThreads = 0;

  if (sets <= 0) {
    notify(ns, `${server} | Not enough RAM for even set`);
    // Launch grow with max threads
    growThreads = Math.floor(availableRam / COMMANDS.grow.ram);
  } else {
    // Launch all scripts with calculated threads
    hackThreads = Math.floor(sets * COMMANDS.hack.mult);
    growThreads = Math.ceil(sets * COMMANDS.grow.mult);
    weakenThreads = Math.floor(sets * COMMANDS.weaken.mult);
  }

  // Ensure we have at least 1 thread for each script type
  if (hackThreads > 0) {
    ns.exec(SCRIPTS_DIR + COMMANDS.hack.src, server, hackThreads, target);
  }

  if (growThreads > 0) {
    ns.exec(SCRIPTS_DIR + COMMANDS.grow.src, server, growThreads, target);
  }

  if (weakenThreads > 0) {
    ns.exec(SCRIPTS_DIR + COMMANDS.weaken.src, server, weakenThreads, target);
  }

  return {
    hack: hackThreads,
    grow: growThreads,
    weaken: weakenThreads,
  };
}

// Helper function for single-script deployment (for ddos and share goals)
function c2c_setup_single(
  ns: NS,
  server: string,
  command: CommandConfig,
  threads: number,
  target: string | null = null
) {
  const script = SCRIPTS_DIR + command.src;

  killAndCopy(ns, server);

  if (command.targeted && target) {
    ns.exec(script, server, threads, target);
  } else {
    ns.exec(script, server, threads);
  }
}

function optimize_server_allocation(
  ns: NS,
  server: string,
  c2c_state: C2CState,
  processes: ProcessInfo[]
): ServerAllocation[] {
  const currentThreadsTotal: { [key: string]: TaskAllocation } = {};
  const currentTargets: string[] = [];
  const results: ServerAllocation[] = [];

  try {
    // Calculate available RAM
    const usedRam = ns.getServerUsedRam(server);
    const maxRam = ns.getServerMaxRam(server);
    let availableRam = maxRam - usedRam;

    if (server === 'home') availableRam -= c2c_state.reserved_on_home;

    if (availableRam < 1.75) {
      // Not enough RAM to do anything meaningful
      return results;
    }

    // Map script filenames to task types
    const scriptToTask: { [key: string]: keyof TaskAllocation } = {};
    Object.entries(COMMANDS).forEach(([task, config]) => {
      if (config.targeted) {
        // Ensure task is one of 'hack', 'grow', 'weaken' for targeted scripts
        if (task === 'hack' || task === 'grow' || task === 'weaken') {
          scriptToTask[SCRIPTS_DIR + config.src] = task;
        }
      }
    });

    // Count current threads by task
    processes.forEach((proc: ProcessInfo) => {
      const taskType = scriptToTask[proc.filename];
      if (taskType) {
        const hostname = proc.args[0] as string; // We know it's a hostname

        if (!currentTargets.includes(hostname)) currentTargets.push(hostname);

        if (!currentThreadsTotal.hasOwnProperty(hostname)) {
          currentThreadsTotal[hostname] = structuredClone(BASE_ALLOCATION);
        }

        currentThreadsTotal[hostname][taskType] += proc.threads;
      }
    });

    // Calculate script RAM requirements
    const scriptRams = {
      hack: ns.getScriptRam(SCRIPTS_DIR + COMMANDS.hack.src),
      grow: ns.getScriptRam(SCRIPTS_DIR + COMMANDS.grow.src),
      weaken: ns.getScriptRam(SCRIPTS_DIR + COMMANDS.weaken.src),
    };

    const ramPerTarget = availableRam / Object.keys(currentThreadsTotal).length;

    Object.entries(currentThreadsTotal).forEach(([target, currentThreads]) => {
      // Calculate total current threads and check ratios
      const totalCurrentThreads =
        currentThreads.hack + currentThreads.grow + currentThreads.weaken;

      // Current distribution
      const currentRatios = {
        hack: currentThreads.hack / totalCurrentThreads,
        grow: currentThreads.grow / totalCurrentThreads,
        weaken: currentThreads.weaken / totalCurrentThreads,
      };

      // Target ratios
      const targetRatios = {
        hack: COMMANDS.hack.mult,
        grow: COMMANDS.grow.mult,
        weaken: COMMANDS.weaken.mult,
      };

      // Find which script is most under its target ratio
      let mostDeficientTask = 'grow'; // Default
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
        return;
      }

      // Calculate how many threads we can add for the deficient task
      const scriptRam = scriptRams[mostDeficientTask];
      const additionalThreads = Math.floor(ramPerTarget / scriptRam);

      if (additionalThreads <= 0) {
        return;
      }

      // Launch additional threads for the most deficient task
      try {
        ns.exec(
          SCRIPTS_DIR + COMMANDS[mostDeficientTask].src,
          server,
          additionalThreads,
          target
        );

        let resultsItem = results.find((t) => t.hostname === target);
        if (!resultsItem) {
          const targetItem = c2c_state.targets.find(
            (t) => t.hostname === target
          );

          resultsItem = {
            ...targetItem,
            tasks: structuredClone(BASE_ALLOCATION),
          };
        }

        resultsItem.tasks[mostDeficientTask] += additionalThreads;
      } catch (error) {
        notify(
          ns,
          `Error launching ${mostDeficientTask} on ${server}: ${error}`
        );
        return;
      }
    });

    printC2CAssign(ns, results, `Optimized ${server}`);
    return results;
  } catch (error) {
    notify(ns, `Error optimizing ${server}: ${error}`);
    return results;
  }
}

/** @param {NS} ns */
function enforceHomeReservation(ns: NS, c2c_state: C2CState): boolean {
  if (c2c_state.reserved_on_home <= 0) return false;

  const maxRam = ns.getServerMaxRam('home');
  const usedRam = ns.getServerUsedRam('home');
  const currentlyFree = maxRam - usedRam;

  // Check if our reservation is violated
  if (currentlyFree < c2c_state.reserved_on_home) {
    const needToFree = c2c_state.reserved_on_home - currentlyFree;
    notify(
      ns,
      `Home reservation violated! Need to free ${needToFree.toFixed(2)}GB of RAM`,
      'c2c',
      'warning'
    );

    // Get all C2C processes running on home
    const processes = ns.ps('home');
    const c2cProcesses = processes.filter((proc) => {
      return Object.values(COMMANDS).some(
        (cmd) => SCRIPTS_DIR + cmd.src === proc.filename
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

        notify(
          ns,
          `Killed ${taskType} process (${proc.threads} threads) targeting ${targetServer} to free ${procRam.toFixed(2)}GB`,
          'c2c',
          'warning'
        );
      } else {
        notify(
          ns,
          `Killed process ${proc.filename} (${proc.threads} threads) to free ${procRam.toFixed(2)}GB`,
          'c2c',
          'warning'
        );
      }

      if (freedRam >= needToFree) break;
    }

    // Update the server lists
    const isHome = (server: string) => server === 'home';
    c2c_state.hack = c2c_state.hack.filter((server: any) => !isHome(server));
    c2c_state.grow = c2c_state.grow.filter((server: any) => !isHome(server));
    c2c_state.weaken = c2c_state.weaken.filter(
      (server: any) => !isHome(server)
    );
    c2c_state.ddos = c2c_state.ddos.filter((server: any) => !isHome(server));
    c2c_state.share = c2c_state.share.filter((server: any) => !isHome(server));

    return true; // Indicates we took action
  }

  return false; // No action needed
}

function hack_setup(
  ns: NS,
  c2c_state: C2CState,
  server: string
): ServerAllocation[] {
  const validTargets = c2c_state.targets.filter(
    (t) => t.data && t.data.time && t.data.money && t.data.money.max > 0
  );

  if (validTargets.length === 0) {
    notify(ns, 'No valid targets found for weighted selection.', 'c2c');
    return [];
  }

  const availableRam: number = getFreeRAM(
    ns,
    server,
    c2c_state.reserved_on_home
  );

  if (availableRam < 1.75) {
    // Minimum RAM for a script
    notify(
      ns,
      `${server} | Not enough RAM for any setup (${availableRam.toFixed(2)}GB free)`,
      'c2c'
    );
    return [];
  }

  // We need so many sets per target, so that Math.floot(sets * hack.mult) > 1
  // I'm not sure why we have to * 2, but anything less would result with 0 hack
  const minRamPerTarget =
    SET_RAM * Math.pow(10, -Math.floor(Math.log10(COMMANDS.hack.mult) + 1)) * 4;
  const maxTargets = Math.max(Math.floor(availableRam / minRamPerTarget), 1);

  const targets: Target[] = Array(maxTargets)
    .fill(0)
    .map(() =>
      weighted_random(
        validTargets,
        validTargets.map((t) => {
          // Data must exist based on validTargets filter
          return t.data.money.max / t.data.time;
        })
      )
    );

  if (
    !targets ||
    targets.length === 0 ||
    !targets.every((t) => t !== undefined && t !== null)
  ) {
    notify(ns, 'Failed to return valid targets for ' + server, 'c2c');
    return [];
  }
  const results = validTargets.map((target) => ({
    ...target,
    tasks: structuredClone(BASE_ALLOCATION),
  }));

  const ramPerTarget = availableRam / targets.length;

  targets.forEach((target, index) => {
    const additional = index !== 0;
    const targetThreads = c2c_setup(
      ns,
      server,
      target.hostname,
      ramPerTarget,
      additional
    );

    const resultsItem = results.find((res) => res.hostname === target.hostname);

    resultsItem.tasks.hack += targetThreads.hack;
    resultsItem.tasks.grow += targetThreads.grow;
    resultsItem.tasks.weaken += targetThreads.weaken;
  });

  printC2CAssign(ns, results, `Add ${server} to botnet`);

  return results;
}

function weighted_random<T>(items: T[], weights: number[]): T | undefined {
  var i: number;

  for (i = 1; i < weights.length; i++) weights[i] += weights[i - 1];

  var random = Math.random() * weights[weights.length - 1];

  for (i = 0; i < weights.length; i++) if (weights[i] > random) break;

  return items[i];
}

function targets_have_changed(new_targets: any[], targets: any[]) {
  const target_names = targets.map((t: { hostname: any }) => t.hostname).sort();
  const new_target_names = new_targets
    .map((t: { hostname: any }) => t.hostname)
    .sort();

  if (target_names.length !== new_target_names.length) {
    return true;
  }

  for (let target of target_names) {
    if (!new_target_names.includes(target)) {
      return true;
    }
  }

  return false;
}

function getRAMUsedByC2C(ns: NS, server: string) {
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
  processes.forEach((proc) => {
    const taskType = scriptToTask[proc.filename];
    if (taskType) {
      // One of our scripts, add threads time RAM usage to total
      C2CRam += proc.threads * ns.getScriptRam(proc.filename);
    }
  });
  return C2CRam;
}

function getFreeRAM(ns: NS, server: string, reserved_on_home: number) {
  const maxRam = ns.getServerMaxRam(server);

  // RAM used by scripts we don't controll
  const allocated = ns.getServerUsedRam(server) - getRAMUsedByC2C(ns, server);

  return server === 'home' ? maxRam - allocated - reserved_on_home : maxRam;
}

/** @param {NS} ns */
export async function main(ns: NS) {
  disable_logs(ns, [
    'scan',
    'exec',
    'scp',
    'killall',
    'kill',
    'getServerRequiredHackingLevel',
    'getHackingLevel',
    'getServerNumPortsRequired',
    'getServerUsedRam',
    'getServerMaxRam',
    'sleep',
  ]);
  notify(ns, 'C2C SERVER STARTED');

  let useless = [...IGNORE];

  let c2c_state = structuredClone(BASE_C2C_STATE);

  try {
    const savedStateData = ns.peek(STATE_PORT);
    if (
      savedStateData &&
      savedStateData !== 'NULL PORT DATA' &&
      savedStateData !== ''
    ) {
      const savedState = JSON.parse(savedStateData);

      // Load saved state if it exists
      if (
        savedState &&
        typeof savedState === 'object' &&
        Object.keys(BASE_C2C_STATE).every((key) =>
          savedState.hasOwnProperty(key)
        )
      ) {
        c2c_state = savedState;

        // Restore goal and targets from saved state if they exist
        if (savedState.goal) {
          notify(ns, 'Restored goal: ' + savedState.goal, 'c2c');
        }

        if (savedState.targets && savedState.targets.length > 0) {
          const targetNames = savedState.targets.map(
            (t: { hostname: any }) => t.hostname
          );
          notify(ns, 'Restored targets: ' + targetNames.join(', '), 'c2c');
        }
      }
    }
  } catch (error) {
    notify(ns, 'Error loading saved state: ' + error, 'c2c', 'error');
    c2c_state = structuredClone(BASE_C2C_STATE);
  }

  while (true) {
    const goal_port_data = ns.peek(GOAL_PORT);
    const target_port_data = ns.peek(TARGET_PORT);
    const home_reserv_port_data = ns.peek(HOME_RESERVE_PORT);

    set_goal: if (
      goal_port_data !== '' &&
      goal_port_data !== 'NULL PORT DATA'
    ) {
      const new_goal =
        typeof goal_port_data === 'string'
          ? goal_port_data.trim()
          : goal_port_data;

      if (!new_goal || new_goal === c2c_state.goal) {
        break set_goal;
      }

      c2c_state.goal = new_goal;
      c2c_state.allocations = {};
      c2c_state.hack = [];
      c2c_state.grow = [];
      c2c_state.weaken = [];
      c2c_state.ddos = [];
      c2c_state.share = [];

      // Reset tasks for all targets
      if (c2c_state.targets && c2c_state.targets.length > 0) {
        c2c_state.targets.forEach((target) => {
          target.tasks = structuredClone(BASE_ALLOCATION);
          c2c_state.allocations[target.hostname] = target;
        });
      }

      notify(ns, 'Set goal to ' + new_goal, 'c2c', 'success');
    }

    set_home_reserv: if (
      home_reserv_port_data !== '' &&
      home_reserv_port_data !== 'NULL PORT DATA'
    ) {
      const new_reserv = parseFloat(home_reserv_port_data);

      if (!new_reserv || new_reserv === c2c_state.reserved_on_home) {
        break set_home_reserv;
      }

      c2c_state.reserved_on_home = new_reserv;

      notify(ns, 'Set home reserve to ' + new_reserv + 'GB', 'c2c', 'success');
    }

    set_targets: if (
      target_port_data != '' &&
      target_port_data !== 'NULL PORT DATA'
    ) {
      const new_targets = JSON.parse(target_port_data);

      if (!new_targets) {
        break set_targets;
      }

      if (
        c2c_state.targets &&
        !targets_have_changed(new_targets, c2c_state.targets)
      ) {
        break set_targets;
      }

      c2c_state.targets = new_targets;
      c2c_state.allocations = {};
      c2c_state.hack = [];
      c2c_state.grow = [];
      c2c_state.weaken = [];
      c2c_state.ddos = [];
      c2c_state.share = [];

      // Reset tasks for all targets
      c2c_state.targets.forEach((target) => {
        target.tasks = structuredClone(BASE_ALLOCATION);
        c2c_state.allocations[target.hostname] = target;
      });

      const target_names = c2c_state.targets.map((t) => t.hostname);
      notify(ns, 'Set targets to ' + target_names.join(', '), 'c2c', 'success');
    }

    if (
      !c2c_state.targets ||
      c2c_state.targets.length === 0 ||
      !c2c_state.goal
    ) {
      const missing = !c2c_state.goal
        ? !c2c_state.targets || c2c_state.targets.length === 0
          ? 'targets and goal'
          : 'goal'
        : 'targets';
      notify(ns, 'No ' + missing + ', waiting ' + TIMEOUT_SEC + 's', 'c2c');
      await ns.sleep(1000 * TIMEOUT_SEC);

      continue;
    }

    const reservationEnforced = enforceHomeReservation(ns, c2c_state);
    if (reservationEnforced) {
      // If we killed scripts, update our state
      const isHome = (server: string) => server === 'home';
      c2c_state.hack = c2c_state.hack.filter((server) => !isHome(server));
      c2c_state.grow = c2c_state.grow.filter((server) => !isHome(server));
      c2c_state.weaken = c2c_state.weaken.filter((server) => !isHome(server));
      c2c_state.ddos = c2c_state.ddos.filter((server) => !isHome(server));
      c2c_state.share = c2c_state.share.filter((server) => !isHome(server));
    }

    let servers = Array(ns.scan())[0];
    let serv_set = new Set(servers);
    servers.push('home');
    serv_set.add('home');

    let i = 0;
    while (i < servers.length) {
      let server = servers[i];

      if (!useless.includes(server) && ns.hasRootAccess(server)) {
        if (ns.getServerMaxRam(server) === 0) {
          notify(ns, server + ' | 0 RAM, skipping', 'c2c');
          useless.push(server);
          i++;
          continue;
        }

        // Handle different goals
        if (c2c_state.goal === 'ddos' && !c2c_state.ddos.includes(server)) {
          // DDOS logic remains unchanged
          const command = COMMANDS['ddos'];
          const threads = Math.floor(
            getFreeRAM(ns, server, c2c_state.reserved_on_home) /
              ns.getScriptRam(SCRIPTS_DIR + command.src)
          );

          if (threads <= 0) {
            useless.push(server);
          } else {
            const target =
              c2c_state.targets[
                Math.floor(Math.random() * c2c_state.targets.length)
              ];
            if (!target) {
              notify(ns, 'No valid target for ' + server + ' [ddos]');
              i++;
              continue;
            }

            notify(
              ns,
              server + ' | ddos[' + threads + '] @ ' + target.hostname,
              'c2c',
              'success'
            );
            c2c_setup_single(ns, server, command, threads, target.hostname);
            c2c_state.ddos.push(server);
          }
        } else if (
          c2c_state.goal === 'share' &&
          !c2c_state.share.includes(server)
        ) {
          // Share logic remains unchanged
          const command = COMMANDS['share'];
          const threads = Math.floor(
            getFreeRAM(ns, server, c2c_state.reserved_on_home) /
              ns.getScriptRam(SCRIPTS_DIR + command.src)
          );

          if (threads <= 0) {
            useless.push(server);
          } else {
            notify(ns, server + ' | share[' + threads + ']', 'success');
            c2c_setup_single(ns, server, command, threads);
            c2c_state.share.push(server);
          }
        } else if (c2c_state.goal === 'hack') {
          // For hack goal, check if server is already allocated to any task
          const isAllocated =
            c2c_state.grow.includes(server) ||
            c2c_state.weaken.includes(server) ||
            c2c_state.hack.includes(server) ||
            c2c_state.ddos.includes(server) ||
            c2c_state.share.includes(server);

          let addedAllocation: ServerAllocation[] = [];

          if (!isAllocated) {
            // New server - set up all scripts in proper ratio
            addedAllocation = hack_setup(ns, c2c_state, server);
          } else {
            // Existing server - optimize current allocation

            // If no processes are running, do a full setup
            const processes = ns.ps(server);
            if (processes.length === 0) {
              addedAllocation = hack_setup(ns, c2c_state, server);
            } else {
              addedAllocation = optimize_server_allocation(
                ns,
                server,
                c2c_state,
                processes
              );
            }

            if (!addedAllocation) {
              i++;
              continue; // Nothing changed
            }
          }

          if (!addedAllocation) {
            if (!isAllocated) {
              useless.push(server);
            }

            i++;
            continue;
          }

          // Update allocation counts in state
          if (addedAllocation) {
            addedAllocation.forEach(({ hostname, tasks }) => {
              const hackAdded = tasks.hack > 0;
              const growAdded = tasks.grow > 0;
              const weakenAdded = tasks.weaken > 0;

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

              if (!c2c_state.allocations[hostname]) {
                c2c_state.allocations[hostname] = {
                  tasks,
                };
              } else {
                c2c_state.allocations[hostname].tasks.hack += tasks.hack;
                c2c_state.allocations[hostname].tasks.grow += tasks.grow;
                c2c_state.allocations[hostname].tasks.weaken += tasks.weaken;
              }
            });
          }
        }
        await ns.sleep(1000);
      }

      // Find new servers
      let s = ns.scan(server);
      for (let j in s) {
        let con = s[j];
        if (!serv_set.has(con)) {
          serv_set.add(con);
          servers.push(con);
        }
      }
      i += 1;
    }

    ns.clearPort(STATE_PORT);
    ns.writePort(STATE_PORT, JSON.stringify(c2c_state));

    try {
      printServerTaskStats(ns, c2c_state.allocations);
    } catch (tableError) {
      notify(ns, `Error in table printing: ${tableError}`);
    }

    // Add explicit delay to prevent infinite loops
    notify(ns, `Sleeping for ${TIMEOUT_MIN} minutes...`);
    await ns.sleep(60000 * TIMEOUT_MIN);
  }
}
