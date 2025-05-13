const IGNORE = ['darkweb'];

const STATE_PORT = 9000;
const GOAL_PORT = 9001;
const TARGET_PORT = 9002;
const HOME_RESERVE_PORT = 9003;

// const REBALANCE_INTERVAL = 10 * 60 * 1000; // 10 minutes
const REBALANCE_INTERVAL = 10; // 10 minutes
const TIMEOUT_SEC = 10;
const TIMEOUT_MIN = 1;

const SCRIPTS_DIR = 'c2c/actions/';
const COMMANDS = {
  hack: { src: 'hack.js', mult: 0.05, targeted: true },
  grow: { src: 'grow.js', mult: 0.775, targeted: true },
  weaken: {
    src: 'weaken.js',
    mult: 0.175,
    targeted: true,
  },
  ddos: { src: 'ddos.js', targeted: true },
  share: { src: 'share_ram.js', targeted: false },
};

/** @param {NS} ns */
function disable_logs(ns) {
  var logs = [
    'scan',
    'exec',
    'scp',
    'killall',
    'kill',
    'getServerRequiredHackingLevel',
    'getHackingLevel',
    'getServerNumPortsRequired',
    'getServerGrowth',
    'getServerUsedRam',
    'getServerMaxMoney',
    'getServerMaxRam',
    'getServerMoneyAvailable',
    'getServerSecurityLevel',
    'getServerMinSecurityLevel',
    'sleep',
  ];
  for (var i in logs) {
    ns.disableLog(logs[i]);
  }
}

/** @param {NS} ns */
function notify(ns, message, variant) {
  if (!message) return;

  // Add timestamp to print calls
  const timestamp = new Date().toLocaleTimeString('et');
  ns.print(`[${timestamp}] ${message}`);

  // Only show toast if variant is provided
  if (variant) {
    ns.toast('c2c: ' + message, variant);
  }
}

/**
 * Formats a number to abbreviated currency notation (K, M, B, T)
 * @param {number} value - The monetary value to format
 * @param {number} [decimals=1] - Number of decimal places to show
 * @return {string} - Formatted currency string
 */
function formatNumber(value, decimals = 1) {
  if (value === null || value === undefined || isNaN(value)) {
    return '0';
  }

  // Handle negative values
  const isNegative = value < 0;
  const absValue = Math.abs(value);

  let result;

  if (absValue >= 1000000000000) {
    result = `${(absValue / 1000000000000).toFixed(decimals)}T`;
  } else if (absValue >= 1000000000) {
    result = `${(absValue / 1000000000).toFixed(decimals)}B`;
  } else if (absValue >= 1000000) {
    result = `${(absValue / 1000000).toFixed(decimals)}M`;
  } else if (absValue >= 1000) {
    result = `${(absValue / 1000).toFixed(decimals)}K`;
  } else {
    result = absValue.toFixed(decimals);
  }

  // Remove trailing zeros after decimal point
  result = result.replace(/\.0+([KMBTkmbt])?$/, '$1');

  return `${isNegative ? '-' : ''}${result}`;
}

/**
 * Formats a number to abbreviated currency notation (K, M, B, T)
 * @param {number} value - The monetary value to format
 * @param {number} [decimals=1] - Number of decimal places to show
 * @param {string} [currency='$'] - Currency symbol to prepend
 * @return {string} - Formatted currency string
 */
function formatCurrency(value, decimals = 1, currency = '$') {
  return currency + formatNumber(value, decimals);
}

/**
 * Get status indicator symbol
 * @param {boolean} needsMore - Whether we need more of this operation
 * @param {boolean} needsLess - Whether we need less of this operation
 * @returns {string} - Status indicator symbol
 */
function getStatusIndicator(needsMore, needsLess) {
  if (needsLess) return '↑';
  if (needsMore) return '↓';
  return '-';
}

function printServerTaskStats(ns, serverData) {
  try {
    notify(ns, 'Printing C2C state');

    // Create a safety check for empty or invalid serverData
    if (!serverData || Object.keys(serverData).length === 0) {
      notify(ns, 'No server allocation data available.');
      return;
    }

    // Initialize column widths with minimum values
    const columnWidths = {
      hostname: 8, // Minimum width for 'hostname'
      growValue: 4, // Minimum width for 'grow'
      weakenValue: 6, // Minimum width for 'weaken'
      hackValue: 4, // Minimum width for 'hack'
      percent: 8, // Width for percentage (fixed)
      total: 5, // Minimum width for 'total'
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
      const growPercent = ((tasks.grow / totalTasks) * 100).toFixed(1);
      const weakenPercent = ((tasks.weaken / totalTasks) * 100).toFixed(1);
      const hackPercent = ((tasks.hack / totalTasks) * 100).toFixed(1);

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
        totalValue,
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
      const text = str.toString();
      const textWidth = text.length;

      const totalPadding = width - textWidth;
      const halfPadded = textWidth + totalPadding / 2;

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

    ns.print('\n');
  } catch (error) {
    // Catch any errors in the table printing
    notify(ns, `Error printing table: ${error}`);
  }
}

/**
 * Prints a detailed table showing optimization stats for each target
 * @param {NS} ns - The Netscript API
 * @param {Array} targets - List of target servers
 */
function printTargetOptimizationStats(ns, targets) {
  try {
    notify(ns, 'Printing Target Optimization Stats');

    // Check for empty data
    if (!targets || targets.length === 0) {
      notify(ns, 'No target data available.');
      return;
    }

    // Initialize column widths with minimum values
    const columnWidths = {
      hostname: 8, // Minimum width for 'hostname'
      moneyInfo: 6, // Minimum width for money info
      moneyTitle: 6, // Minimum width for money info
      securityInfo: 6, // Minimum width for security info
      securityTitle: 6, // Minimum width for security info
      hackTitle: 4, // Minimum width for max € info
      maxInfo: 4, // Minimum width for hack info
      maxTitle: 4, // Minimum width for max € info
      growPercent: 6,
      weakenPercent: 6,
      hackPercent: 4,
      status: 2, // Static offset for status arrow
    };

    // Store cell content for all rows
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
    updateColumnWidth('moneyTitle', 'money% (best grow)');
    updateColumnWidth('securityTitle', 'sec. (best weak)');
    updateColumnWidth('hackTitle', 'best hack');
    updateColumnWidth('maxTitle', 'max€');

    // Process each target and update column widths
    for (const target of targets) {
      const hostname = typeof target === 'string' ? target : target.hostname;
      if (!hostname) continue;

      // Get performance metrics
      const performance = monitorServerPerformance(ns, hostname);

      // Get optimal ratios
      const optimalRatios = calculateOptimalRatios(ns, hostname);

      // Get values
      const moneyPercent = performance.moneyPercent.toFixed(1);
      const securityExcess = performance.securityExcess.toFixed(1);
      const securityExcessSign = securityExcess > 0 ? '+' : '';

      // Format optimal ratios
      const optimalGrow = `(${(optimalRatios.grow * 100).toFixed(1)}%)`;
      const optimalWeaken = `(${(optimalRatios.weaken * 100).toFixed(1)}%)`;
      const optimalHack = `${(optimalRatios.hack * 100).toFixed(1)}%`;

      // Format status indicators
      const moneyStatus = getStatusIndicator(
        performance.needsMoreGrow,
        performance.needsLessHack
      );
      const securityStatus = getStatusIndicator(
        performance.needsMoreWeaken,
        false
      );
      const hackStatus = getStatusIndicator(false, performance.needsLessHack);

      // Format values
      const moneyText = `${moneyPercent}%`;
      const securityText = securityExcessSign + securityExcess;
      const maxText = formatCurrency(performance.maxMoney);

      // Update column widths based on content
      updateColumnWidth('hostname', hostname);
      updateColumnWidth('moneyInfo', moneyText);
      updateColumnWidth('securityInfo', securityText);
      updateColumnWidth('maxInfo', maxText);
      updateColumnWidth('growPercent', optimalGrow);
      updateColumnWidth('weakenPercent', optimalWeaken);
      updateColumnWidth('hackPercent', optimalHack);

      // Store row data
      tableRows.push({
        hostname,
        moneyText,
        securityText,
        maxText,
        optimalGrow,
        optimalWeaken,
        optimalHack,
        moneyStatus,
        securityStatus,
        hackStatus,
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
      const text = str.toString();
      const textWidth = text.length;

      const totalPadding = width - textWidth;
      const halfPadded = textWidth + totalPadding / 2;

      return str.toString().padStart(halfPadded).padEnd(width);
    }

    // Calculate total column widths
    const moneyColWidth = Math.max(
      columnWidths.moneyInfo + columnWidths.growPercent + columnWidths.status,
      columnWidths.moneyTitle
    );
    const securityColWidth = Math.max(
      columnWidths.securityInfo +
        columnWidths.weakenPercent +
        columnWidths.status,
      columnWidths.securityTitle
    );
    const hackColWidth = Math.max(
      columnWidths.hackPercent + columnWidths.status,
      columnWidths.hackTitle
    );
    const maxColWidth = Math.max(columnWidths.maxInfo, columnWidths.maxTitle);

    // Print table header
    const header = `| ${padStringLeft('hostname', columnWidths.hostname)} | ${padStringCenter('money% (best grow)', moneyColWidth)} | ${padStringCenter('sec. (best weak)', securityColWidth)} | ${padStringCenter('best hack', hackColWidth)} | ${padStringRight('max€', maxColWidth)} |`;
    const separator = `| ${'-'.repeat(columnWidths.hostname)} | ${'-'.repeat(moneyColWidth)} | ${'-'.repeat(securityColWidth)} | ${'-'.repeat(hackColWidth)} | ${'-'.repeat(maxColWidth)} |`;

    ns.print(header);
    ns.print(separator);

    // Print each row with dynamic widths
    for (const row of tableRows) {
      // Format each cell with aligned percentages and status arrows
      const moneyText = `${padStringRight(row.moneyText, columnWidths.moneyInfo)} ${padStringLeft(row.optimalGrow, columnWidths.growPercent)} ${row.moneyStatus}`;
      const securityText = `${padStringRight(row.securityText, columnWidths.securityInfo)} ${padStringLeft(row.optimalWeaken, columnWidths.weakenPercent)} ${row.securityStatus}`;
      const hackText = `${padStringLeft(row.optimalHack, columnWidths.hackPercent)} ${row.hackStatus}`;
      const formattedRow = `| ${padStringLeft(row.hostname, columnWidths.hostname)} | ${padStringRight(moneyText, moneyColWidth)} | ${padStringRight(securityText, securityColWidth)} | ${padStringRight(hackText, hackColWidth)} | ${padStringRight(row.maxText, maxColWidth)} |`;
      ns.print(formattedRow);
    }

    ns.print('\n');
  } catch (error) {
    notify(ns, `Error printing optimization table: ${error}`);
  }
}

/**
 * Modify the c2c_setup function to ensure high-security servers get threads
 * @param {NS} ns - NetScript API
 * @param {string} server - Server to run scripts on
 * @param {string} target - Target server to hack
 * @param {number} reserved_on_home - RAM to reserve on home
 * @returns {Object} - Allocated threads
 */
export function c2c_setup(ns, server, target, reserved_on_home) {
  killAndCopy(ns, server);

  // Get base optimal ratios for this target
  const baseRatios = calculateOptimalRatios(ns, target);

  // Adjust ratios based on current performance
  const ratios = adjustRatiosForPerformance(ns, target, baseRatios);

  // Calculate available RAM and allocate threads proportionally
  const availableRam = getFreeRAM(ns, server, reserved_on_home);
  const scriptRams = {
    hack: ns.getScriptRam(SCRIPTS_DIR + COMMANDS.hack.src),
    grow: ns.getScriptRam(SCRIPTS_DIR + COMMANDS.grow.src),
    weaken: ns.getScriptRam(SCRIPTS_DIR + COMMANDS.weaken.src),
  };

  // Calculate total RAM needed for one "set" of scripts in the desired ratio
  const setRam =
    ratios.hack * scriptRams.hack +
    ratios.grow * scriptRams.grow +
    ratios.weaken * scriptRams.weaken;

  // Calculate how many complete sets we can fit
  const sets = Math.floor(availableRam / setRam);

  let hackThreads = 0;
  let growThreads = 0;
  let weakenThreads = 0;

  if (sets <= 0) {
    // Not enough RAM for a complete set
    // Check if security is high - if so, prioritize weakening
    const currentSecurity = ns.getServerSecurityLevel(target);
    const minSecurity = ns.getServerMinSecurityLevel(target);

    if (currentSecurity > minSecurity + 5) {
      // Prioritize weaken for high security
      weakenThreads = Math.floor(availableRam / scriptRams.weaken);
      notify(
        ns,
        `${server} | High security, using ${weakenThreads} weaken threads`
      );
    } else {
      // Normal behavior - prioritize grow
      growThreads = Math.floor(availableRam / scriptRams.grow);
      notify(
        ns,
        `${server} | Not enough RAM for even set, using ${growThreads} grow threads`
      );
    }
  } else {
    // Launch all scripts with calculated threads
    hackThreads = Math.floor(sets * ratios.hack);
    growThreads = Math.floor(sets * ratios.grow);
    weakenThreads = Math.floor(sets * ratios.weaken);

    // Ensure we have at least 1 thread for scripts with non-zero ratios
    if (hackThreads === 0 && ratios.hack > 0.01) hackThreads = 1;
    if (growThreads === 0 && ratios.grow > 0.01) growThreads = 1;
    if (weakenThreads === 0 && ratios.weaken > 0.01) weakenThreads = 1;
  }

  // Add randomized delays to prevent synchronization issues
  const hackDelay = Math.floor(Math.random() * 500);
  const growDelay = Math.floor(Math.random() * 500);
  const weakenDelay = Math.floor(Math.random() * 500);

  // Execute scripts with delays
  if (hackThreads > 0) {
    ns.exec(
      SCRIPTS_DIR + COMMANDS.hack.src,
      server,
      hackThreads,
      target,
      hackDelay
    );
  }

  if (growThreads > 0) {
    ns.exec(
      SCRIPTS_DIR + COMMANDS.grow.src,
      server,
      growThreads,
      target,
      growDelay
    );
  }

  if (weakenThreads > 0) {
    ns.exec(
      SCRIPTS_DIR + COMMANDS.weaken.src,
      server,
      weakenThreads,
      target,
      weakenDelay
    );
  }

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

  return {
    hack: hackThreads,
    grow: growThreads,
    weaken: weakenThreads,
  };
}

// Helper function for single-script deployment (for ddos and share goals)
function c2c_setup_single(ns, server, command, threads, target = null) {
  const script = SCRIPTS_DIR + command.src;

  killAndCopy(ns, server);

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
      weaken: 0,
    };

    // Map script filenames to task types
    const scriptToTask = {};
    Object.entries(COMMANDS).forEach(([task, config]) => {
      if (config.targeted) {
        scriptToTask[SCRIPTS_DIR + config.src] = task;
      }
    });

    // Count current threads by task
    processes.forEach((proc) => {
      const taskType = scriptToTask[proc.filename];
      if (taskType) {
        currentThreads[taskType] += proc.threads;
      }
    });

    // Calculate available RAM
    const usedRam = ns.getServerUsedRam(server);
    const maxRam = ns.getServerMaxRam(server);
    let availableRam = maxRam - usedRam;

    if (server === 'home') availableRam -= reserved_on_home;

    if (availableRam < 1.75) {
      // Not enough RAM to do anything meaningful
      return false;
    }

    // Calculate script RAM requirements
    const scriptRams = {
      hack: ns.getScriptRam(SCRIPTS_DIR + COMMANDS.hack.src),
      grow: ns.getScriptRam(SCRIPTS_DIR + COMMANDS.grow.src),
      weaken: ns.getScriptRam(SCRIPTS_DIR + COMMANDS.weaken.src),
    };

    // Calculate total current threads
    const totalCurrentThreads =
      currentThreads.hack + currentThreads.grow + currentThreads.weaken;
    if (totalCurrentThreads === 0) return c2c_setup(ns, server, target);

    // Get base optimal ratios for this target
    const baseRatios = calculateOptimalRatios(ns, target);

    // Adjust ratios based on current performance
    const optimalRatios = adjustRatiosForPerformance(ns, target, baseRatios);

    // Current distribution
    const currentRatios = {
      hack: currentThreads.hack / totalCurrentThreads,
      grow: currentThreads.grow / totalCurrentThreads,
      weaken: currentThreads.weaken / totalCurrentThreads,
    };

    // Find which script is most under its target ratio
    let mostDeficientTask = 'grow'; // Default
    let biggestDeficit = 0;

    Object.entries(optimalRatios).forEach(([task, targetRatio]) => {
      const deficit = targetRatio - currentRatios[task];
      if (deficit > biggestDeficit) {
        biggestDeficit = deficit;
        mostDeficientTask = task;
      }
    });

    // If no significant deficit, no need to adjust
    if (biggestDeficit <= 0.05) {
      return false;
    }

    // Calculate how many threads we can add for the deficient task
    const scriptRam = scriptRams[mostDeficientTask];
    const additionalThreads = Math.floor(availableRam / scriptRam);

    if (additionalThreads <= 0) {
      return false;
    }

    // Add a small random delay to prevent synchronization issues
    const randomDelay = Math.floor(Math.random() * 500);

    // Launch additional threads for the most deficient task
    try {
      ns.exec(
        SCRIPTS_DIR + COMMANDS[mostDeficientTask].src,
        server,
        additionalThreads,
        target,
        randomDelay
      );

      // Return the changes made
      const result = {
        hack: 0,
        grow: 0,
        weaken: 0,
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

/** @param {NS} ns */
function killAndCopy(ns, server) {
  if (server === 'home') {
    // Kill all instances of currently running C2C scripts
    Object.values(COMMANDS).forEach((cmd) => {
      ns.scriptKill(SCRIPTS_DIR + cmd.src, server);
    });
  } else {
    // Kill all current scripts on the server
    ns.killall(server);

    // Copy all necessary scripts to the server
    Object.values(COMMANDS).forEach((cmd) => {
      ns.scp(SCRIPTS_DIR + cmd.src, server, 'home');
    });
  }
}

/**
 * Monitors server performance and returns current status
 * @param {NS} ns - NetScript API
 * @param {string} target - Target server hostname
 * @returns {Object} - Performance metrics and status flags
 */
function monitorServerPerformance(ns, target) {
  const currentMoney = ns.getServerMoneyAvailable(target);
  const maxMoney = ns.getServerMaxMoney(target);
  const currentSecurity = ns.getServerSecurityLevel(target);
  const minSecurity = ns.getServerMinSecurityLevel(target);

  // Calculate money and security percentages
  const moneyPercent = (currentMoney / maxMoney) * 100;
  const securityExcess = currentSecurity - minSecurity;

  // Determine status flags - adjust thresholds as needed
  // Money below 70% needs more grow
  const needsMoreGrow = moneyPercent < 70;
  // Security more than 3 above minimum needs more weaken
  const needsMoreWeaken = securityExcess > 3;
  // Money below 40% indicates we're overhacking
  const needsLessHack = moneyPercent < 40;

  return {
    moneyPercent,
    securityExcess,
    needsMoreGrow,
    needsMoreWeaken,
    needsLessHack,
    maxMoney,
    currentMoney,
    currentSecurity,
    minSecurity,
  };
}

/**
 * Enhanced version of calculateOptimalRatios that handles high security servers
 * @param {NS} ns - NetScript API
 * @param {string} target - Target server hostname
 * @returns {Object} - Optimal ratios for hack, grow, and weaken
 */
function calculateOptimalRatios(ns, target) {
  try {
    // First, check if this is a high-security server that needs initial weakening
    const currentSecurity = ns.getServerSecurityLevel(target);
    const minSecurity = ns.getServerMinSecurityLevel(target);
    const securityExcess = currentSecurity - minSecurity;

    // If security is over 10 points higher than minimum, prioritize weakening
    if (securityExcess > 10) {
      // The higher the security excess, the more we focus on weakening
      const weakenRatio = Math.min(0.9, 0.5 + securityExcess / 200);
      const growRatio = 1 - weakenRatio;

      notify(
        `High security detected on ${target} (excess: ${securityExcess.toFixed(1)}). ` +
          `Using special ratios: weaken ${(weakenRatio * 100).toFixed(1)}%, grow ${(growRatio * 100).toFixed(1)}%, hack 0%`
      );

      return {
        hack: 0, // No hacking until security is reduced
        grow: growRatio,
        weaken: weakenRatio,
      };
    }

    // Normal ratio calculation for servers with reasonable security
    if (ns.fileExists('Formulas.exe', 'home')) {
      return calculateRatiosWithFormulas(ns, target);
    } else {
      return calculateRatiosWithoutFormulas(ns, target);
    }
  } catch (error) {
    ns.print(`Error calculating ratios for ${target}: ${error}`);
    // Return reasonable default ratios if calculation fails
    return {
      hack: 0.05,
      grow: 0.775,
      weaken: 0.175,
    };
  }
}

/**
 * Calculate optimal ratios using Formulas.exe
 * @param {NS} ns - NetScript API
 * @param {string} target - Target server hostname
 * @returns {Object} - Calculated ratios for hack, grow, and weaken
 */
function calculateRatiosWithFormulas(ns, target) {
  // Get server properties
  const server = ns.getServer(target);
  const player = ns.getPlayer();

  // Analyze how much money we want to hack (aim for 10-15% per cycle)
  const hackPercent = ns.formulas.hacking.hackPercent(server, player) * 100;
  const targetHackPercent = Math.min(15, Math.max(1, hackPercent * 10)); // Cap between 1-15%

  // Calculate threads needed for each operation
  const hackThreads = Math.max(1, Math.ceil(targetHackPercent / hackPercent));

  // Calculate grow threads needed to recover
  const growthNeeded = 1 / (1 - targetHackPercent / 100);
  const growThreads = Math.max(
    1,
    Math.ceil(
      ns.formulas.hacking.growThreads(
        server,
        player,
        server.moneyMax,
        growthNeeded
      )
    )
  );

  // Calculate weaken threads needed for security
  const hackSecurityIncrease = ns.hackAnalyzeSecurity(hackThreads, target);
  const growSecurityIncrease = ns.growthAnalyzeSecurity(growThreads, target);
  const totalSecurityIncrease = hackSecurityIncrease + growSecurityIncrease;
  const weakenThreads = Math.max(1, Math.ceil(totalSecurityIncrease / 0.05)); // 0.05 security per weaken thread

  // Calculate total threads and convert to ratios
  const totalThreads = hackThreads + growThreads + weakenThreads;

  return {
    hack: hackThreads / totalThreads,
    grow: growThreads / totalThreads,
    weaken: weakenThreads / totalThreads,
  };
}

/**
 * Calculate thread ratios without Formulas.exe using heuristics
 * @param {NS} ns - NetScript API
 * @param {string} target - Target server hostname
 * @returns {Object} - Estimated ratios for hack, grow, and weaken
 */
function calculateRatiosWithoutFormulas(ns, target) {
  // Get server properties
  const maxMoney = ns.getServerMaxMoney(target);
  const minSecurity = ns.getServerMinSecurityLevel(target);
  const growthRate = ns.getServerGrowth(target);
  const hackDifficulty = ns.getServerRequiredHackingLevel(target);
  const playerHackLevel = ns.getHackingLevel();

  // Calculate hack effectiveness - higher player level relative to server difficulty = more effective hacks
  const hackEffectiveness = Math.min(1, playerHackLevel / (hackDifficulty * 2));

  // Less money should be hacked from servers with higher growth rates
  // This ensures we don't overhack high-growth servers
  const growthFactor = Math.log10(growthRate) / 3; // Normalize growth rate

  // Base hack ratio - conservative to prevent overhacking
  let hackRatio = 0.03 * hackEffectiveness;

  // Adjust based on growth factor - higher growth means we can hack more
  hackRatio = hackRatio * (1 + growthFactor);

  // Security level affects weaken needs
  const securityFactor = minSecurity / 10;
  let weakenRatio = 0.15 + securityFactor * 0.05;

  // Remaining goes to grow
  let growRatio = 1 - hackRatio - weakenRatio;

  // Ensure we have reasonable minimums
  hackRatio = Math.max(0.01, Math.min(0.1, hackRatio));
  weakenRatio = Math.max(0.15, Math.min(0.3, weakenRatio));
  growRatio = 1 - hackRatio - weakenRatio;

  return {
    hack: hackRatio,
    grow: growRatio,
    weaken: weakenRatio,
  };
}

/**
 * Adjust ratios based on current performance
 * @param {NS} ns - NetScript API
 * @param {string} target - Target server
 * @param {Object} baseRatios - Base calculated ratios
 * @returns {Object} - Adjusted ratios
 */
function adjustRatiosForPerformance(ns, target, baseRatios) {
  // Get current performance
  const performance = monitorServerPerformance(ns, target);
  const ratios = { ...baseRatios }; // Clone the ratios

  // If money is very low or security is high, adjust ratios
  if (performance.needsLessHack) {
    // Reduce hack ratio significantly if money is too low
    const reduction = ratios.hack * 0.7; // More aggressive reduction when money is really low
    ratios.hack -= reduction;
    ratios.grow += reduction * 0.8; // Most goes to grow
    ratios.weaken += reduction * 0.2; // Some to weaken
  } else if (performance.needsMoreGrow) {
    // Increase grow ratio if money is not optimal but not critically low
    const adjustment = Math.min(ratios.hack * 0.4, 0.04);
    ratios.hack -= adjustment;
    ratios.grow += adjustment;
  }

  if (performance.needsMoreWeaken) {
    // Increase weaken ratio if security is too high
    const adjustment = Math.min(ratios.hack * 0.3, 0.03);
    ratios.hack -= adjustment;
    ratios.weaken += adjustment;
  }

  return ratios;
}

function targets_have_changed(new_targets, targets) {
  const target_names = targets.map((t) => t.hostname).sort();
  const new_target_names = new_targets.map((t) => t.hostname).sort();

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
  const minSecurity = ns.getServerMinSecurityLevel(hostname);
  const growthRate = ns.getServerGrowth(hostname);

  // Return 0 if server has no money
  if (maxMoney <= 0) return 0;

  // Calculate value - higher money and growth is better, lower security is better
  // Adjust these weights to prioritize different aspects
  const moneyWeight = 0.7;
  const securityWeight = 0.2;
  const growthWeight = 0.1;

  // Normalize and combine factors
  const moneyScore = Math.log10(maxMoney) / 10; // Log scale to handle wide range of money values
  const securityScore = 1 / (minSecurity + 1); // Lower security is better
  const growthScore = growthRate / 100;

  return (
    moneyScore * moneyWeight +
    securityScore * securityWeight +
    growthScore * growthWeight
  );
}

/**
 * Select a target server using weighted selection based on value
 * @param {NS} ns - The Netscript API
 * @param {Array} targets - List of target servers
 * @returns {Object} - Selected target
 */
function selectWeightedTarget(ns, targets) {
  // Calculate values for all targets
  const targetsWithValues = targets.map((target) => ({
    ...target,
    value: calculateServerValue(ns, target.hostname),
  }));

  // Get total value
  const totalValue = targetsWithValues.reduce(
    (sum, server) => sum + server.value,
    0
  );

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
  processes.forEach((proc) => {
    const taskType = scriptToTask[proc.filename];
    if (taskType) {
      // One of our scripts, add threads time RAM usage to total
      C2CRam += proc.threads * ns.getScriptRam(proc.filename);
    }
  });
  return C2CRam;
}

/** @param {NS} ns */
function getFreeRAM(ns, server, reserved_on_home) {
  const maxRam = ns.getServerMaxRam(server);

  // RAM used by scripts we don't controll
  const allocated = ns.getServerUsedRam(server) - getRAMUsedByC2C(ns, server);

  return server === 'home' ? maxRam - allocated - reserved_on_home : maxRam;
}

/**
 * Add this function to periodically reassign servers to targets
 * @param {NS} ns - NetScript API
 * @param {Object} c2c_state - Current C2C state
 */
function reassignServers(ns, c2c_state) {
  notify(ns, 'Reassigning servers to balance resource allocation', 'info');

  // Reset all server tasks (but don't kill processes yet)
  for (const target of c2c_state.targets) {
    c2c_state.allocations[target.hostname].tasks =
      structuredClone(base_allocation);
  }

  // Clear server lists but don't kill processes yet
  c2c_state.hack = [];
  c2c_state.grow = [];
  c2c_state.weaken = [];

  // Kill scripts on each server except home
  const allServers = [];
  const scanNetwork = (ns, host, visited = new Set()) => {
    const connections = ns.scan(host);
    for (const server of connections) {
      if (!visited.has(server)) {
        visited.add(server);
        allServers.push(server);
        scanNetwork(ns, server, visited);
      }
    }
  };

  // Start scan from home
  scanNetwork(ns, 'home');

  // Kill scripts on each server (except home)
  for (const server of allServers) {
    if (
      server !== 'home' &&
      ns.hasRootAccess(server) &&
      ns.getServerMaxRam(server) > 0
    ) {
      ns.killall(server);
    }
  }

  // Home needs special handling - only kill C2C scripts
  if (
    c2c_state.hack.includes('home') ||
    c2c_state.grow.includes('home') ||
    c2c_state.weaken.includes('home')
  ) {
    // Kill all instances of C2C scripts
    Object.values(COMMANDS)
      .filter((cmd) => cmd.targeted)
      .forEach((cmd) => {
        ns.scriptKill(SCRIPTS_DIR + cmd.src, 'home');
      });
  }

  notify(ns, 'All servers freed for reallocation');
  return true;
}

/** @param {NS} ns */
function enforceHomeReservation(ns, c2c_state) {
  if (c2c_state.reserved_on_home <= 0) return false;

  const maxRam = ns.getServerMaxRam('home');
  const usedRam = ns.getServerUsedRam('home');
  const currentlyFree = maxRam - usedRam;

  // Check if our reservation is violated
  if (currentlyFree < c2c_state.reserved_on_home) {
    const needToFree = c2c_state.reserved_on_home - currentlyFree;
    notify(ns, `home | Freeing ${needToFree.toFixed(2)}GB of RAM`, 'info');

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
          'warning'
        );
      } else {
        notify(
          ns,
          `Killed process ${proc.filename} (${proc.threads} threads) to free ${procRam.toFixed(2)}GB`,
          'warning'
        );
      }

      if (freedRam >= needToFree) break;
    }

    // Update the server lists
    const isHome = (server) => server === 'home';
    c2c_state.hack = c2c_state.hack.filter((server) => !isHome(server));
    c2c_state.grow = c2c_state.grow.filter((server) => !isHome(server));
    c2c_state.weaken = c2c_state.weaken.filter((server) => !isHome(server));
    c2c_state.ddos = c2c_state.ddos.filter((server) => !isHome(server));
    c2c_state.share = c2c_state.share.filter((server) => !isHome(server));

    return true;
  }

  return false;
}

const base_allocation = {
  grow: 0,
  weaken: 0,
  hack: 0,
  ddos: 0,
};

const base_c2c_state = {
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

/** @param {NS} ns */
export async function main(ns) {
  disable_logs(ns);

  let useless = [...IGNORE];
  let lastRebalance = Date.now();

  let c2c_state = structuredClone(base_c2c_state);
  const targetUsage = {};

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
        Object.keys(base_c2c_state).every((key) =>
          savedState.hasOwnProperty(key)
        )
      ) {
        c2c_state = savedState;

        // Restore goal and targets from saved state if they exist
        if (savedState.goal) {
          notify(ns, 'Restored goal: ' + savedState.goal, 'info');
        }

        if (savedState.targets && savedState.targets.length > 0) {
          const targetNames = savedState.targets.map((t) => t.hostname);
          notify(ns, 'Restored targets: ' + targetNames.join(', '), 'info');
        }
      }
    }
  } catch (error) {
    notify(ns, 'Error loading saved state: ' + error, 'error');
    c2c_state = structuredClone(base_c2c_state);
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
          ? goal_port_data.strip()
          : goal_port_data;

      if (!new_goal || new_goal === c2c_state.goal) {
        break set_goal;
      }

      c2c_state.goal = new_goal;
      c2c_state.hack = [];
      c2c_state.grow = [];
      c2c_state.weaken = [];
      c2c_state.ddos = [];
      c2c_state.share = [];

      // Reset tasks for all targets
      if (c2c_state.targets && c2c_state.targets.length > 0) {
        c2c_state.targets.forEach((target) => {
          c2c_state.allocations[target.hostname].tasks =
            structuredClone(base_allocation);
        });
      }

      notify(ns, 'Set goal to ' + new_goal, 'info');
    }

    set_home_reserv: if (
      home_reserv_port_data !== '' &&
      home_reserv_port_data !== 'NULL PORT DATA'
    ) {
      const new_reserv = parseFloat(home_reserv_port_data);

      if (!new_reserv || new_reserv === c2c_state.reserved_on_home) {
        break set_home_reserv;
      }

      notify(ns, 'Set home reserve to ' + new_reserv + 'GB', 'info');

      c2c_state.reserved_on_home = new_reserv;
      enforceHomeReservation(ns, c2c_state);
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

      // Reset tasks for all targets
      c2c_state.targets.forEach((target) => {
        const value = calculateServerValue(ns, target.hostname);
        const tasks = structuredClone(base_allocation);
        c2c_state.allocations[target.hostname] = { ...target, value, tasks };
      });

      c2c_state.hack = [];
      c2c_state.grow = [];
      c2c_state.weaken = [];
      c2c_state.ddos = [];
      c2c_state.share = [];

      const target_names = c2c_state.targets.map((t) => t.hostname);
      notify(ns, 'Set targets to ' + target_names.join(', '), 'info');
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
      notify(ns, 'No ' + missing + ', waiting ' + TIMEOUT_SEC + 's', 'info');
      await ns.sleep(1000 * TIMEOUT_SEC);

      continue;
    }

    let servers = Array(ns.scan())[0];
    let serv_set = Array(servers);
    servers.push('home');
    serv_set.push('home');

    let i = 0;
    while (i < servers.length) {
      let server = servers[i];

      if (!useless.includes(server) && ns.hasRootAccess(server)) {
        if (ns.getServerMaxRam(server) === 0) {
          notify(ns, server + ' | 0 RAM, skipping', 'info');
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

            notify(ns, server + ' | ddos[' + threads + '] @' + target.hostname);
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
            getFreeRAM(ns, server, c2c_state.reserved_on_home) / 4
          );

          if (threads <= 0) {
            useless.push(server);
          } else {
            notify(ns, server + ' | share[' + threads + ']');
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

          const target = selectWeightedTarget(ns, c2c_state.targets);
          if (!target) {
            notify(ns, 'No valid target for ' + server);
            i++;
            continue;
          }

          let allocatedThreads;

          if (!isAllocated) {
            // New server - set up all scripts in proper ratio
            const target = selectWeightedTarget(
              ns,
              c2c_state.targets,
              targetUsage
            );

            targetUsage[target.hostname] =
              (targetUsage[target.hostname] || 0) + 1;

            allocatedThreads = c2c_setup(
              ns,
              server,
              target.hostname,
              c2c_state.reserved_on_home
            );

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
            allocatedThreads = optimize_server_allocation(
              ns,
              server,
              target.hostname,
              c2c_state.reserved_on_home
            );

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

            notify(
              ns,
              `Optimized ${server} | ${hackAdded ? '+h[' + formatNumber(allocatedThreads.hack) + '] ' : ''}${growAdded ? '+g[' + formatNumber(allocatedThreads.grow) + '] ' : ''}${weakenAdded ? '+h[' + formatNumber(allocatedThreads.weaken) + '] ' : ''}@${target.hostname}`
            );
          }

          // Update allocation counts in state
          if (allocatedThreads) {
            // Make sure the target allocation exists
            if (!c2c_state.allocations[target.hostname]) {
              c2c_state.allocations[target.hostname] = {
                tasks: structuredClone(base_allocation),
              };
            }

            c2c_state.allocations[target.hostname].tasks.hack +=
              allocatedThreads.hack;
            c2c_state.allocations[target.hostname].tasks.grow +=
              allocatedThreads.grow;
            c2c_state.allocations[target.hostname].tasks.weaken +=
              allocatedThreads.weaken;
          }
        }
        await ns.sleep(1000);
      }

      // Find new servers
      let s = ns.scan(server);
      for (let j in s) {
        let con = s[j];
        if (!serv_set.includes(con)) {
          serv_set.push(con);
          servers.push(con);
        }
      }
      i += 1;
    }

    ns.clearPort(STATE_PORT);
    ns.writePort(STATE_PORT, JSON.stringify(c2c_state));

    if (c2c_state.goal === 'hack') {
      try {
        printServerTaskStats(ns, c2c_state.allocations);
        printTargetOptimizationStats(ns, c2c_state.targets);
      } catch (tableError) {
        notify(ns, `Error in table printing: ${tableError}`);
      }
    }

    // Add explicit delay to prevent infinite loops
    notify(ns, `Sleeping for ${TIMEOUT_MIN} minute(s)...`);
    await ns.sleep(60000 * TIMEOUT_MIN);
  }
}
