import {
  Commands,
  ServerAllocation,
  TaskAllocation,
  CommandConfig,
  OptimizationResult,
  C2CState,
  TargetData,
} from '../types/c2c';

import {
  STATE_PORT,
  GOAL_PORT,
  TARGET_PORT,
  HOME_RESERVE_PORT,
} from '../helpers/ports';

import { disable_logs, notify, formatNumber } from '../helpers/cli';

const IGNORE: string[] = ['darkweb'];

const TIMEOUT_SEC: number = 10;
const TIMEOUT_MIN: number = 1;

const SCRIPTS_DIR: string = 'c2c/actions/';

const COMMANDS: Commands = {
  hack: { src: 'hack.js', mult: 0.15, targeted: true },
  grow: { src: 'grow.js', mult: 0.6, targeted: true },
  weaken: {
    src: 'weaken.js',
    mult: 0.25,
    targeted: true,
  },
  ddos: { src: 'grow.js', targeted: true },
  share: { src: 'share_ram.js', targeted: false },
};

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
    const tableRows: any[] = []; // Use 'any' or define a specific row interface if structure stabilizes

    // Helper function to update column width based on content
    function updateColumnWidth(
      column: keyof typeof columnWidths,
      content: string | number
    ) {
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

      const server: ServerAllocation = serverData[hostname];
      const tasks: TaskAllocation = server.tasks;

      // Calculate totals
      const totalTasks: number = tasks.grow + tasks.weaken + tasks.hack;

      // Skip if there are no tasks
      if (totalTasks === 0) {
        continue;
      }

      // Calculate percentages
      const growPercent: string = ((tasks.grow / totalTasks) * 100).toFixed(1);
      const weakenPercent: string = ((tasks.weaken / totalTasks) * 100).toFixed(
        1
      );
      const hackPercent: string = ((tasks.hack / totalTasks) * 100).toFixed(1);

      // Format values
      const growValue: string = formatNumber(tasks.grow);
      const weakenValue: string = formatNumber(tasks.weaken);
      const hackValue: string = formatNumber(tasks.hack);
      const totalValue: string = formatNumber(totalTasks);

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
        totalValue,
      });
    }

    // Helper function to pad strings to specified width
    function padStringLeft(str: string | number, width: number): string {
      return str.toString().padEnd(width);
    }
    // Helper function to right-align string to specified width
    function padStringRight(str: string | number, width: number): string {
      return str.toString().padStart(width);
    }
    // Helper function to center-align string to specified width
    function padStringCenter(str: string | number, width: number): string {
      const text: string = str.toString();
      const textWidth: number = text.length;

      const totalPadding: number = width - textWidth;
      const leftPadding: number = Math.floor(totalPadding / 2);
      const rightPadding: number = totalPadding - leftPadding;

      return ' '.repeat(leftPadding) + text + ' '.repeat(rightPadding);
    }

    // Calculate total column widths
    const growColWidth: number = columnWidths.growValue + columnWidths.percent;
    const weakenColWidth: number =
      columnWidths.weakenValue + columnWidths.percent;
    const hackColWidth: number = columnWidths.hackValue + columnWidths.percent;

    // Print table header
    const header: string = `| ${padStringLeft('hostname', columnWidths.hostname)} | ${padStringCenter('grow', growColWidth)} | ${padStringCenter('weaken', weakenColWidth)} | ${padStringCenter('hack', hackColWidth)} | ${padStringRight('total', columnWidths.total)} |`;
    const separator: string = `| ${'-'.repeat(columnWidths.hostname)} | ${'-'.repeat(growColWidth)} | ${'-'.repeat(weakenColWidth)} | ${'-'.repeat(hackColWidth)} | ${'-'.repeat(columnWidths.total)} |`;

    ns.print(header);
    ns.print(separator);

    // Print each row with dynamic widths
    for (const row of tableRows) {
      // Format each cell with aligned percentages
      const growText: string = `${padStringRight(row.growValue, columnWidths.growValue)} (${row.growPercent}%)`;
      const weakenText: string = `${padStringRight(row.weakenValue, columnWidths.weakenValue)} (${row.weakenPercent}%)`;
      const hackText: string = `${padStringRight(row.hackValue, columnWidths.hackValue)} (${row.hackPercent}%)`;

      const formattedRow: string = `| ${padStringLeft(row.hostname, columnWidths.hostname)} | ${padStringRight(growText, growColWidth)} | ${padStringRight(weakenText, weakenColWidth)} | ${padStringRight(hackText, hackColWidth)} | ${padStringRight(row.totalValue, columnWidths.total)} |`;
      ns.print(formattedRow);
    }

    ns.print('\n');
  } catch (error: any) {
    // Catch any errors in the table printing
    notify(
      ns,
      `Error printing table: ${error.message || error}`,
      'c2c',
      'error'
    );
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
  additional: boolean
): TaskAllocation {
  if (!additional) {
    killAndCopy(ns, server);
  }

  // Allocate threads proportionally
  const scriptRams: { hack: number; grow: number; weaken: number } = {
    hack: ns.getScriptRam(SCRIPTS_DIR + COMMANDS.hack.src),
    grow: ns.getScriptRam(SCRIPTS_DIR + COMMANDS.grow.src),
    weaken: ns.getScriptRam(SCRIPTS_DIR + COMMANDS.weaken.src),
  };

  // Calculate total RAM needed for one "set" of scripts in the desired ratio
  const setRam: number =
    (COMMANDS.hack.mult || 0) * scriptRams.hack + // Use 0 if mult is undefined
    (COMMANDS.grow.mult || 0) * scriptRams.grow +
    (COMMANDS.weaken.mult || 0) * scriptRams.weaken;

  // Calculate how many complete sets we can fit
  const sets: number = Math.floor(availableRam / setRam);

  let hackThreads: number = 0;
  let growThreads: number = 0;
  let weakenThreads: number = 0;

  if (sets <= 0) {
    notify(ns, `${server} | Not enough RAM for even set`);
    // Launch grow with max threads if possible, otherwise check other scripts
    if (availableRam >= scriptRams.grow) {
      growThreads = Math.floor(availableRam / scriptRams.grow);
    } else if (availableRam >= scriptRams.weaken) {
      weakenThreads = Math.floor(availableRam / scriptRams.weaken);
    } else if (availableRam >= scriptRams.hack) {
      hackThreads = Math.floor(availableRam / scriptRams.hack);
    }
    // If still no threads, nothing can be run.
  } else {
    // Launch all scripts with calculated threads
    hackThreads = Math.floor(sets * (COMMANDS.hack.mult || 0));
    growThreads = Math.ceil(sets * (COMMANDS.grow.mult || 0));
    weakenThreads = Math.floor(sets * (COMMANDS.weaken.mult || 0));
  }

  // Ensure we have at least 1 thread for each script type if its mult > 0
  if ((COMMANDS.hack.mult || 0) > 0 && hackThreads > 0) {
    ns.exec(SCRIPTS_DIR + COMMANDS.hack.src, server, hackThreads, target);
  }

  if ((COMMANDS.grow.mult || 0) > 0 && growThreads > 0) {
    ns.exec(SCRIPTS_DIR + COMMANDS.grow.src, server, growThreads, target);
  }

  if ((COMMANDS.weaken.mult || 0) > 0 && weakenThreads > 0) {
    ns.exec(SCRIPTS_DIR + COMMANDS.weaken.src, server, weakenThreads, target);
  }

  // If no scripts were launched because threads were 0 or mult was 0
  if (hackThreads === 0 && growThreads === 0 && weakenThreads === 0) {
    notify(
      ns,
      `${server} | Could not launch any scripts on ${target}`,
      'c2c',
      'warning'
    );
  } else {
    notify(
      ns,
      server +
        ' | ' +
        'g[' +
        formatNumber(growThreads) +
        '] ' +
        'w[' +
        formatNumber(weakenThreads) +
        '] ' +
        'h[' +
        formatNumber(hackThreads) +
        '] ' +
        (target ? '@' + target : '')
    );
  }

  return {
    hack: hackThreads,
    grow: growThreads,
    weaken: weakenThreads,
    ddos: 0, // Explicitly set to 0 as this function doesn't handle them
    share: 0, // Explicitly set to 0 as this function doesn't handle them
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
  const script: string = SCRIPTS_DIR + command.src;

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
  reserved_on_home: number,
  processes: ProcessInfo[]
): OptimizationResult {
  const threadsBase: TaskAllocation = {
    hack: 0,
    grow: 0,
    weaken: 0,
  };

  const currentThreadsTotal: { [key: string]: TaskAllocation } = {};
  const currentTargets: string[] = [];

  const results: TaskAllocation = structuredClone(threadsBase);

  try {
    // Calculate available RAM
    const usedRam: number = ns.getServerUsedRam(server);
    const maxRam: number = ns.getServerMaxRam(server);
    let availableRam: number = maxRam - usedRam;

    if (server === 'home') availableRam -= reserved_on_home;

    if (availableRam < 1.75) {
      // Not enough RAM to do anything meaningful
      return { targets: currentTargets, threads: threadsBase };
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

    // Count current threads by task and target
    processes.forEach((proc) => {
      const taskType = scriptToTask[proc.filename];
      if (taskType) {
        const hostname: string = proc.args[0] as string; // Assuming the first arg is the hostname

        if (!currentTargets.includes(hostname)) currentTargets.push(hostname);

        if (!currentThreadsTotal.hasOwnProperty(hostname)) {
          currentThreadsTotal[hostname] = structuredClone(threadsBase);
        }

        currentThreadsTotal[hostname][taskType] =
          (currentThreadsTotal[hostname][taskType] || 0) + proc.threads;
      }
    });

    if (Object.keys(currentThreadsTotal).length === 0) {
      // No current C2C processes found on this server, do a full setup
      // This case should ideally be handled before calling optimize, but adding a fallback
      notify(
        ns,
        `No existing C2C processes found on ${server}, recommending full setup.`,
        'c2c',
        'info'
      );
      return { targets: currentTargets, threads: threadsBase }; // Return base threads to signal no optimization occurred
    }

    // Calculate script RAM requirements
    const scriptRams: { hack: number; grow: number; weaken: number } = {
      hack: ns.getScriptRam(SCRIPTS_DIR + COMMANDS.hack.src),
      grow: ns.getScriptRam(SCRIPTS_DIR + COMMANDS.grow.src),
      weaken: ns.getScriptRam(SCRIPTS_DIR + COMMANDS.weaken.src),
    };

    const ramPerTarget: number =
      availableRam / Object.keys(currentThreadsTotal).length;

    for (const target of currentTargets) {
      const currentThreads = currentThreadsTotal[target];
      if (!currentThreads) continue; // Should not happen if target is in currentTargets

      // Calculate total current threads and check ratios
      const totalCurrentThreads: number =
        currentThreads.hack + currentThreads.grow + currentThreads.weaken;

      if (totalCurrentThreads === 0) {
        // No active threads for this target on this server, skip optimization for it
        continue;
      }

      // Current distribution
      const currentRatios: { hack: number; grow: number; weaken: number } = {
        hack: currentThreads.hack / totalCurrentThreads,
        grow: currentThreads.grow / totalCurrentThreads,
        weaken: currentThreads.weaken / totalCurrentThreads,
      };

      // Target ratios
      const targetRatios: { hack: number; grow: number; weaken: number } = {
        hack: COMMANDS.hack.mult || 0,
        grow: COMMANDS.grow.mult || 0,
        weaken: COMMANDS.weaken.mult || 0,
      };

      // Find which script is most under its target ratio
      let mostDeficientTask: keyof TaskAllocation = 'grow'; // Default
      let biggestDeficit: number = -Infinity; // Initialize with negative infinity

      // Ensure we only consider tasks with a positive target ratio
      const targetedTasks = ['hack', 'grow', 'weaken'].filter(
        (task) => (targetRatios[task] || 0) > 0
      ) as (keyof TaskAllocation)[];

      if (targetedTasks.length === 0) {
        // No targeted tasks defined in COMMANDS with mult > 0
        continue; // Cannot optimize
      }

      targetedTasks.forEach((task) => {
        const deficit: number = (targetRatios[task] || 0) - currentRatios[task];
        if (deficit > biggestDeficit) {
          biggestDeficit = deficit;
          mostDeficientTask = task;
        }
      });

      // If no deficit, no need to adjust for this target
      if (biggestDeficit <= 0) {
        continue;
      }

      // Calculate how many threads we can add for the deficient task
      const scriptRam: number = scriptRams[mostDeficientTask];
      if (scriptRam <= 0) {
        // Avoid division by zero if script RAM is 0 (shouldn't happen, but safety)
        continue;
      }
      const additionalThreads: number = Math.floor(ramPerTarget / scriptRam);

      if (additionalThreads <= 0) {
        // Cannot fit even one thread of the most deficient script for this target
        continue;
      }

      // Launch additional threads for the most deficient task
      try {
        // Ensure the script has a source and is targeted if needed
        const commandConfig = COMMANDS[mostDeficientTask];
        if (!commandConfig || (commandConfig.targeted && !target)) {
          notify(
            ns,
            `Cannot launch ${mostDeficientTask} on ${server}: command config missing or target missing for targeted script.`,
            'c2c',
            'error'
          );
          continue;
        }

        ns.exec(
          SCRIPTS_DIR + commandConfig.src,
          server,
          additionalThreads,
          target
        );

        results[mostDeficientTask] =
          (results[mostDeficientTask] || 0) + additionalThreads;
        notify(
          ns,
          `Optimized ${server} | +${mostDeficientTask}[${additionalThreads}] @${target}`
        );
      } catch (error: any) {
        notify(
          ns,
          `Error launching ${mostDeficientTask} on ${server}: ${error.message || error}`,
          'c2c',
          'error'
        );
        // Continue to the next target or return current results
      }
    }

    return { targets: currentTargets, threads: results };
  } catch (error: any) {
    notify(
      ns,
      `Error optimizing ${server}: ${error.message || error}`,
      'c2c',
      'error'
    );
    return { targets: currentTargets, threads: threadsBase }; // Return base threads on error
  }
}

function enforceHomeReservation(ns: NS, c2c_state: C2CState): boolean {
  if (c2c_state.reserved_on_home <= 0) return false;

  const maxRam: number = ns.getServerMaxRam('home');
  const usedRam: number = ns.getServerUsedRam('home');
  // nonC2CRam isn't used after calculation, can be removed or used for detailed logging
  // const nonC2CRam: number = usedRam - getRAMUsedByC2C(ns, 'home');
  const currentlyFree: number = maxRam - usedRam;

  // Check if our reservation is violated
  if (currentlyFree < c2c_state.reserved_on_home) {
    const needToFree: number = c2c_state.reserved_on_home - currentlyFree;
    notify(
      ns,
      `Home reservation violated! Need to free ${needToFree.toFixed(2)}GB of RAM`,
      'c2c',
      'warning'
    );

    // Get all C2C processes running on home
    const processes: ProcessInfo[] = ns.ps('home');
    const c2cProcesses: ProcessInfo[] = processes.filter((proc) => {
      return Object.values(COMMANDS).some(
        (cmd) => SCRIPTS_DIR + cmd.src === proc.filename
      );
    });

    // Create a mapping of script filenames to task types
    const scriptToTask: { [key: string]: keyof TaskAllocation } = {};
    Object.entries(COMMANDS).forEach(([task, config]) => {
      if (
        task === 'hack' ||
        task === 'grow' ||
        task === 'weaken' ||
        task === 'ddos' ||
        task === 'share'
      ) {
        scriptToTask[SCRIPTS_DIR + config.src] = task;
      }
    });

    // Sort by RAM usage (highest first) to kill fewer processes
    c2cProcesses.sort((a, b) => {
      const aRam: number = ns.getScriptRam(a.filename) * a.threads;
      const bRam: number = ns.getScriptRam(b.filename) * b.threads;
      return bRam - aRam;
    });

    // Kill processes until we've freed enough RAM
    let freedRam: number = 0;
    for (const proc of c2cProcesses) {
      const procRam: number = ns.getScriptRam(proc.filename) * proc.threads;

      // Before killing, determine target server and task type
      const taskType = scriptToTask[proc.filename];
      let targetServer: string | undefined = undefined;

      // Extract target server from args (if it's a targeted task)
      if (
        proc.args &&
        proc.args.length > 0 &&
        typeof proc.args[0] === 'string'
      ) {
        targetServer = proc.args[0];
      }

      // Kill the process
      ns.kill(proc.pid);
      freedRam += procRam;

      // Update allocation counts in c2c_state
      if (targetServer && taskType && c2c_state.allocations[targetServer]) {
        // Decrement thread count for this task type
        const currentTargetAllocation =
          c2c_state.allocations[targetServer].tasks;
        if (currentTargetAllocation.hasOwnProperty(taskType)) {
          (currentTargetAllocation[taskType] as number) -= proc.threads;
          // Ensure we don't go below zero
          if ((currentTargetAllocation[taskType] as number) < 0) {
            (currentTargetAllocation[taskType] as number) = 0;
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

    // Note: The original JS code filters the c2c_state server lists (hack, grow, etc.)
    // within this function. This is unusual as it modifies the state based on kills
    // which will be re-evaluated in the main loop anyway. It's generally better
    // to let the main loop rebuild the lists based on active processes.
    // However, to match the original logic closely, we'll keep the filter here.
    // A more robust approach might involve rebuilding the lists from `ns.ps()`
    // at the start of the main loop's allocation phase.

    const isHome = (serverHostname: string) => serverHostname === 'home';
    c2c_state.hack = c2c_state.hack.filter(
      (serverHostname) => !isHome(serverHostname)
    );
    c2c_state.grow = c2c_state.grow.filter(
      (serverHostname) => !isHome(serverHostname)
    );
    c2c_state.weaken = c2c_state.weaken.filter(
      (serverHostname) => !isHome(serverHostname)
    );
    c2c_state.ddos = c2c_state.ddos.filter(
      (serverHostname) => !isHome(serverHostname)
    );
    c2c_state.share = c2c_state.share.filter(
      (serverHostname) => !isHome(serverHostname)
    );

    return true; // Indicates we took action
  }

  return false; // No action needed
}

function hack_setup(
  ns: NS,
  c2c_state: C2CState,
  server: string
): { targets: TargetData[]; threads: TaskAllocation } {
  // Choose 3 random targets, weighted by timeToHack/maxMoney
  // Ensure c2c_state.targets is not empty and contains items with 'data' property
  const validTargets = c2c_state.targets.filter(
    (t) => t.data && t.data.time && t.data.money && t.data.money.max > 0
  );

  if (validTargets.length === 0) {
    notify(
      ns,
      'No valid targets found for weighted selection.',
      'c2c',
      'warning'
    );
    return {
      targets: [],
      threads: { hack: 0, grow: 0, weaken: 0, ddos: 0, share: 0 },
    };
  }

  const targets: TargetData[] = Array(3)
    .fill(0)
    .map(() =>
      weighted_random(
        validTargets,
        validTargets.map((t) => {
          // Data must exist based on validTargets filter
          return t.data.time / t.data.money.max;
        })
      )
    );

  // Check if weighted_random returned valid targets
  if (
    !targets ||
    targets.length === 0 ||
    !targets.every((t) => t !== undefined && t !== null)
  ) {
    notify(
      ns,
      'Weighted random selection failed to return valid targets for ' + server,
      'c2c',
      'warning'
    );
    return {
      targets: [],
      threads: { hack: 0, grow: 0, weaken: 0, ddos: 0, share: 0 },
    };
  }

  let allocatedThreads: TaskAllocation = {
    hack: 0,
    grow: 0,
    weaken: 0,
    ddos: 0,
    share: 0,
  };

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
    return { targets: targets, threads: allocatedThreads };
  }

  // Split thread between 4 random targets if more than 64GB ram (original was 32GB, adjusted to 64GB based on comment)
  if (availableRam < 64) {
    allocatedThreads = c2c_setup(
      ns,
      server,
      targets[0].hostname,
      availableRam,
      false
    );
  } else {
    const ramPerTarget: number = availableRam / targets.length;

    for (let i = 0; i < targets.length; i++) {
      // Use standard for loop for better type safety on index
      const target: TargetData = targets[i];
      if (!target) {
        notify(
          ns,
          `Skipping invalid target at index ${i} for ${server}`,
          'c2c',
          'warning'
        );
        continue;
      }
      const additional: boolean = i > 0;
      const targetThreads: TaskAllocation = c2c_setup(
        ns,
        server,
        target.hostname,
        ramPerTarget,
        additional
      );

      allocatedThreads.hack += targetThreads.hack;
      allocatedThreads.grow += targetThreads.grow;
      allocatedThreads.weaken += targetThreads.weaken;
      // ddos and share are not handled by c2c_setup, so no need to add them
    }
  }
  return { targets, threads: allocatedThreads };
}

function weighted_random<T>(items: T[], weights: number[]): T | undefined {
  if (items.length !== weights.length || items.length === 0) {
    // Invalid input
    return undefined;
  }

  // Handle potential negative weights (though they shouldn't occur with the current usage)
  const cleanedWeights = weights.map((w) => Math.max(0, w));

  let i: number;
  const cumulativeWeights: number[] = [];
  for (i = 0; i < cleanedWeights.length; i++) {
    cumulativeWeights[i] = cleanedWeights[i] + (cumulativeWeights[i - 1] || 0);
  }

  const totalWeight = cumulativeWeights[cumulativeWeights.length - 1];
  if (totalWeight <= 0) {
    // All weights are zero or negative
    return undefined;
  }

  const random: number = Math.random() * totalWeight;

  for (i = 0; i < items.length; i++) {
    if (cumulativeWeights[i] > random) break;
  }

  // i will be the index of the selected item
  return items[i];
}

function targets_have_changed(
  new_targets: TargetData[],
  targets: TargetData[]
): boolean {
  if (new_targets.length !== targets.length) {
    return true;
  }

  const target_names: string[] = targets.map((t) => t.hostname).sort();
  const new_target_names: string[] = new_targets.map((t) => t.hostname).sort();

  for (let i = 0; i < target_names.length; i++) {
    if (target_names[i] !== new_target_names[i]) {
      return true;
    }
  }

  return false;
}

function getRAMUsedByC2C(ns: NS, server: string): number {
  let C2CRam: number = 0;
  // Get current processes
  const processes: ProcessInfo[] = ns.ps(server);

  if (processes.length === 0) {
    return 0;
  }

  // Map script filenames to task types
  const scriptToTask: { [key: string]: keyof Commands } = {}; // Use keyof Commands for all script types
  Object.entries(COMMANDS).forEach(([task, config]) => {
    // Check if task is a valid key in Commands
    if (task in COMMANDS) {
      scriptToTask[SCRIPTS_DIR + config.src] = task as keyof Commands;
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

function getFreeRAM(ns: NS, server: string, reserved_on_home: number): number {
  const maxRam: number = ns.getServerMaxRam(server);

  // RAM used by scripts we don't control
  const allocatedByOthers: number =
    ns.getServerUsedRam(server) - getRAMUsedByC2C(ns, server);

  return server === 'home'
    ? maxRam - allocatedByOthers - reserved_on_home
    : maxRam - allocatedByOthers;
}

const base_allocation: TaskAllocation = {
  grow: 0,
  weaken: 0,
  hack: 0,
  ddos: 0,
  share: 0,
};

const base_c2c_state: C2CState = {
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

export async function main(ns: NS): Promise<void> {
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
    'peek', // Added peek to disabled logs as it's used frequently
    'clearPort',
    'writePort',
  ]);

  let useless: string[] = [...IGNORE];

  let c2c_state: C2CState = structuredClone(base_c2c_state);

  try {
    const savedStateData: string | 'NULL PORT DATA' = ns.peek(STATE_PORT);
    if (
      savedStateData &&
      savedStateData !== 'NULL PORT DATA' &&
      savedStateData !== ''
    ) {
      try {
        const savedState: any = JSON.parse(savedStateData); // Parse as any first

        // Validate the parsed state against the expected structure
        if (
          savedState &&
          typeof savedState === 'object' &&
          Object.keys(base_c2c_state).every((key: string) =>
            savedState.hasOwnProperty(key)
          ) &&
          Array.isArray(savedState.hack) &&
          Array.isArray(savedState.grow) &&
          Array.isArray(savedState.weaken) &&
          Array.isArray(savedState.ddos) &&
          Array.isArray(savedState.share) &&
          Array.isArray(savedState.targets) &&
          typeof savedState.reserved_on_home === 'number' &&
          typeof savedState.allocations === 'object'
          // Add more detailed checks for allocations and targets if necessary
        ) {
          c2c_state = savedState as C2CState; // Assert the type after validation

          // Restore goal and targets from saved state if they exist
          if (c2c_state.goal) {
            notify(ns, 'Restored goal: ' + c2c_state.goal, 'c2c');
          }

          if (c2c_state.targets && c2c_state.targets.length > 0) {
            const targetNames: string[] = c2c_state.targets.map(
              (t) => t.hostname
            );
            notify(ns, 'Restored targets: ' + targetNames.join(', '), 'c2c');
          }
        } else {
          notify(
            ns,
            'Saved state data is invalid or incomplete. Starting fresh.',
            'c2c',
            'warning'
          );
          c2c_state = structuredClone(base_c2c_state); // Reset to base state
        }
      } catch (parseError: any) {
        notify(
          ns,
          'Error parsing saved state: ' + (parseError.message || parseError),
          'c2c',
          'error'
        );
        c2c_state = structuredClone(base_c2c_state); // Reset to base state on parse error
      }
    }
  } catch (error: any) {
    notify(
      ns,
      'Error loading saved state: ' + (error.message || error),
      'c2c',
      'error'
    );
    c2c_state = structuredClone(base_c2c_state);
  }

  while (true) {
    const goal_port_data: string | 'NULL PORT DATA' = ns.peek(GOAL_PORT);
    const target_port_data: string | 'NULL PORT DATA' = ns.peek(TARGET_PORT);
    const home_reserv_port_data: string | 'NULL PORT DATA' =
      ns.peek(HOME_RESERVE_PORT);

    set_goal: if (
      goal_port_data !== '' &&
      goal_port_data !== 'NULL PORT DATA'
    ) {
      const new_goal: string =
        typeof goal_port_data === 'string'
          ? goal_port_data.trim()
          : String(goal_port_data).trim(); // Ensure it's treated as string

      if (!new_goal || new_goal === c2c_state.goal) {
        break set_goal;
      }

      c2c_state.goal = new_goal;
      c2c_state.allocations = {}; // Reset allocations
      c2c_state.hack = [];
      c2c_state.grow = [];
      c2c_state.weaken = [];
      c2c_state.ddos = [];
      c2c_state.share = [];

      // Reset tasks for all targets based on the new goal
      // Ensure targets exist before iterating
      if (c2c_state.targets && c2c_state.targets.length > 0) {
        c2c_state.targets.forEach((target) => {
          target.tasks = structuredClone(base_allocation);
          // Add target to allocations for tracking
          c2c_state.allocations[target.hostname] = {
            tasks: structuredClone(base_allocation),
            data: target.data,
          };
        });
      }

      notify(ns, 'Set goal to ' + new_goal, 'c2c', 'success');
    }

    set_home_reserv: if (
      home_reserv_port_data !== '' &&
      home_reserv_port_data !== 'NULL PORT DATA'
    ) {
      const new_reserv: number = parseFloat(String(home_reserv_port_data)); // Ensure it's treated as string for parseFloat

      if (isNaN(new_reserv) || new_reserv === c2c_state.reserved_on_home) {
        break set_home_reserv;
      }

      c2c_state.reserved_on_home = new_reserv;

      notify(ns, 'Set home reserve to ' + new_reserv + 'GB', 'c2c', 'success');
    }

    set_targets: if (
      target_port_data != '' &&
      target_port_data !== 'NULL PORT DATA'
    ) {
      let new_targets: TargetData[] | undefined;
      try {
        const parsedTargets: any = JSON.parse(target_port_data);
        // Basic validation for the parsed data
        if (
          Array.isArray(parsedTargets) &&
          parsedTargets.every(
            (t) =>
              t &&
              typeof t === 'object' &&
              typeof t.hostname === 'string' &&
              t.data &&
              typeof t.data === 'object'
          )
        ) {
          new_targets = parsedTargets as TargetData[]; // Assert type after validation
        } else {
          notify(ns, 'Invalid data received on target port.', 'c2c', 'warning');
        }
      } catch (parseError: any) {
        notify(
          ns,
          'Error parsing target port data: ' +
            (parseError.message || parseError),
          'c2c',
          'error'
        );
        break set_targets; // Exit the block on parsing error
      }

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
      c2c_state.allocations = {}; // Reset allocations
      c2c_state.hack = [];
      c2c_state.grow = [];
      c2c_state.weaken = [];
      c2c_state.ddos = [];
      c2c_state.share = [];

      // Reset tasks for all targets and add to allocations
      c2c_state.targets.forEach((target) => {
        target.tasks = structuredClone(base_allocation);
        c2c_state.allocations[target.hostname] = {
          tasks: structuredClone(base_allocation),
          data: target.data,
        };
      });

      const target_names: string[] = c2c_state.targets.map((t) => t.hostname);
      notify(ns, 'Set targets to ' + target_names.join(', '), 'c2c', 'success');
    }

    if (
      !c2c_state.targets ||
      c2c_state.targets.length === 0 ||
      !c2c_state.goal
    ) {
      const missing: string = !c2c_state.goal
        ? !c2c_state.targets || c2c_state.targets.length === 0
          ? 'targets and goal'
          : 'goal'
        : 'targets';
      notify(ns, 'No ' + missing + ', waiting ' + TIMEOUT_SEC + 's', 'c2c');
      await ns.sleep(1000 * TIMEOUT_SEC);

      continue;
    }

    // Enforce home reservation and update state lists if needed
    enforceHomeReservation(ns, c2c_state);
    // The enforceHomeReservation function already filters the lists in place,
    // so the explicit filtering check here is redundant if that function is called.
    // Removing the redundant check for clarity.
    // const reservationEnforced = enforceHomeReservation(ns, c2c_state);
    // if (reservationEnforced) { /* lists already updated in function */ }

    let servers: string[] = ns.scan();
    let serv_set: string[] = [...servers]; // Use spread for copying
    servers.push('home');
    serv_set.push('home');

    let i: number = 0;
    while (i < servers.length) {
      let server: string = servers[i];

      if (!useless.includes(server) && ns.hasRootAccess(server)) {
        if (ns.getServerMaxRam(server) === 0) {
          notify(ns, server + ' | 0 RAM, skipping', 'c2c');
          useless.push(server);
          i++;
          continue;
        }

        const currentProcesses: ProcessInfo[] = ns.ps(server);
        const isAllocated = currentProcesses.some((proc) =>
          Object.values(COMMANDS).some(
            (cmd) => SCRIPTS_DIR + cmd.src === proc.filename
          )
        );

        // Handle different goals
        if (c2c_state.goal === 'ddos' && !c2c_state.ddos.includes(server)) {
          // DDOS logic remains unchanged
          const command: CommandConfig = COMMANDS['ddos'];
          const threads: number = Math.floor(
            getFreeRAM(ns, server, c2c_state.reserved_on_home) /
              ns.getScriptRam(SCRIPTS_DIR + command.src)
          );

          if (threads <= 0) {
            useless.push(server);
          } else {
            const target: TargetData | undefined =
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

            // Update allocation state for ddos (optional but good for tracking)
            if (!c2c_state.allocations[target.hostname]) {
              c2c_state.allocations[target.hostname] = {
                tasks: structuredClone(base_allocation),
              };
            }
            c2c_state.allocations[target.hostname].tasks.ddos =
              (c2c_state.allocations[target.hostname].tasks.ddos || 0) +
              threads;
          }
        } else if (
          c2c_state.goal === 'share' &&
          !c2c_state.share.includes(server)
        ) {
          // Share logic remains unchanged
          const command: CommandConfig = COMMANDS['share'];
          const threads: number = Math.floor(
            getFreeRAM(ns, server, c2c_state.reserved_on_home) /
              ns.getScriptRam(SCRIPTS_DIR + command.src)
          );

          if (threads <= 0) {
            useless.push(server);
          } else {
            notify(ns, server + ' | share[' + threads + ']', 'success');
            c2c_setup_single(ns, server, command, threads);
            c2c_state.share.push(server);
            // Update allocation state for share (optional but good for tracking)
            // Share doesn't target a specific server in the same way hack/grow/weaken do,
            // so tracking per-target allocation for share might not be useful.
            // If needed, a separate total share threads counter could be added to c2c_state.
          }
        } else if (c2c_state.goal === 'hack') {
          let allocatedThreads: TaskAllocation = {
            hack: 0,
            grow: 0,
            weaken: 0,
            ddos: 0,
            share: 0,
          };
          let currTargets: TargetData[] = [];

          if (!isAllocated) {
            notify(ns, `Setting up new server: ${server}`, 'c2c', 'info');
            // New server - set up all scripts in proper ratio
            const setupResult = hack_setup(ns, c2c_state, server);
            currTargets = setupResult.targets;
            allocatedThreads = setupResult.threads;

            if (
              allocatedThreads.hack > 0 ||
              allocatedThreads.grow > 0 ||
              allocatedThreads.weaken > 0
            ) {
              // Add server to all task lists since it's running all types (if threads were allocated)
              c2c_state.hack.push(server);
              c2c_state.grow.push(server);
              c2c_state.weaken.push(server);
            } else {
              notify(
                ns,
                `${server} | Could not allocate threads for hack goal.`,
                'c2c',
                'warning'
              );
              useless.push(server); // Mark as useless if no threads could be allocated
              i++;
              continue;
            }
          } else {
            // Existing server - optimize current allocation
            notify(ns, `Optimizing existing server: ${server}`, 'c2c', 'info');

            // If no C2C processes are running, do a full setup instead of optimizing zero processes
            if (
              currentProcesses.length === 0 ||
              !currentProcesses.some((proc) =>
                Object.values(COMMANDS)
                  .filter((cmd) => cmd.targeted)
                  .some((cmd) => SCRIPTS_DIR + cmd.src === proc.filename)
              )
            ) {
              // Check for targeted C2C scripts
              notify(
                ns,
                `No targeted C2C processes found on ${server}, performing full setup.`,
                'c2c',
                'info'
              );
              const setupResult = hack_setup(ns, c2c_state, server);
              currTargets = setupResult.targets;
              allocatedThreads = setupResult.threads;

              if (
                allocatedThreads.hack > 0 ||
                allocatedThreads.grow > 0 ||
                allocatedThreads.weaken > 0
              ) {
                // Add server to task lists if threads were allocated
                if (!c2c_state.hack.includes(server))
                  c2c_state.hack.push(server);
                if (!c2c_state.grow.includes(server))
                  c2c_state.grow.push(server);
                if (!c2c_state.weaken.includes(server))
                  c2c_state.weaken.push(server);
              } else {
                notify(
                  ns,
                  `${server} | Could not allocate threads during full setup after finding no processes.`,
                  'c2c',
                  'warning'
                );
                useless.push(server);
                i++;
                continue;
              }
            } else {
              const optimizationResult = optimize_server_allocation(
                ns,
                server,
                c2c_state.reserved_on_home,
                currentProcesses
              );

              // Find the actual TargetData objects based on hostnames from optimize_server_allocation
              currTargets = optimizationResult.targets
                .map((hostname) =>
                  c2c_state.targets.find(
                    (target) => target.hostname === hostname
                  )
                )
                .filter((target): target is TargetData => target !== undefined); // Filter out undefined

              allocatedThreads = optimizationResult.threads;

              // Check if any threads were actually added by optimization
              if (
                allocatedThreads.hack === 0 &&
                allocatedThreads.grow === 0 &&
                allocatedThreads.weaken === 0
              ) {
                notify(
                  ns,
                  `${server} already optimally allocated or no RAM to optimize.`,
                  'c2c',
                  'info'
                );
                // No threads added, no change to allocation state needed from this operation
                i++;
                continue; // Move to the next server
              }

              // Update server task lists if threads were added
              if (
                allocatedThreads.hack > 0 &&
                !c2c_state.hack.includes(server)
              ) {
                c2c_state.hack.push(server);
              }
              if (
                allocatedThreads.grow > 0 &&
                !c2c_state.grow.includes(server)
              ) {
                c2c_state.grow.push(server);
              }
              if (
                allocatedThreads.weaken > 0 &&
                !c2c_state.weaken.includes(server)
              ) {
                c2c_state.weaken.push(server);
              }
            }
          }

          // Update allocation counts in state for the threads that were *just* launched
          // The optimize function already handles updating counts internally based on launched processes.
          // This block seems redundant if optimize_server_allocation updates the state directly.
          // Let's assume optimize_server_allocation *doesn't* update c2c_state and this block is needed.
          if (allocatedThreads && currTargets.length > 0) {
            for (const target of currTargets) {
              // Make sure the target allocation exists in c2c_state
              if (!c2c_state.allocations[target.hostname]) {
                c2c_state.allocations[target.hostname] = {
                  tasks: structuredClone(base_allocation),
                };
              }

              // Add the newly allocated threads to the state's count for this target
              c2c_state.allocations[target.hostname].tasks.hack +=
                allocatedThreads.hack;
              c2c_state.allocations[target.hostname].tasks.grow +=
                allocatedThreads.grow;
              c2c_state.allocations[target.hostname].tasks.weaken +=
                allocatedThreads.weaken;
            }
          }
        }
        await ns.sleep(100); // Small sleep to prevent blocking the game loop entirely

        // Find new servers - This should happen regardless of the goal/setup
        let s: string[] = ns.scan(server);
        for (const con of s) {
          // Use for...of loop
          if (!serv_set.includes(con)) {
            serv_set.push(con);
            servers.push(con);
          }
        }
      }

      i += 1; // Move to the next server in the list
    }

    // Clear and write the state to the port
    ns.clearPort(STATE_PORT);
    ns.writePort(STATE_PORT, JSON.stringify(c2c_state));

    // Print task stats based on the current c2c_state
    try {
      printServerTaskStats(ns, c2c_state.allocations);
    } catch (tableError: any) {
      notify(
        ns,
        `Error in table printing: ${tableError.message || tableError}`,
        'c2c',
        'error'
      );
    }

    // Add explicit delay to prevent infinite loops
    notify(ns, `Sleeping for ${TIMEOUT_MIN} minutes...`);
    await ns.sleep(60000 * TIMEOUT_MIN);
  }
}
