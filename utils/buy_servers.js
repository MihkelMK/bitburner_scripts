/** @param {NS} ns */
function disable_logs(ns) {
  var logs = ["sleep", "getPurchasedServerLimit", "getPurchasedServerLimit", "getServerMoneyAvailable", 'getServerMaxRam', 'getPurchasedServers', 'getPurchasedServerCost', "getPurchasedServerUpgradeCost"]
  for (var i in logs) {
    ns.disableLog(logs[i])
  }
}

/**
 * Formats a number to abbreviated currency notation (K, M, B, T)
 * @param {number} value - The monetary value to format
 * @param {number} [decimals=1] - Number of decimal places to show
 * @param {string} [currency='$'] - Currency symbol to prepend
 * @return {string} - Formatted currency string
 */
function formatCurrency(value, decimals = 1, currency = '$') {
  if (value === null || value === undefined || isNaN(value)) {
    return `${currency}0`;
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

  return `${isNegative ? '-' : ''}${currency}${result}`;
}

/** @param {NS} ns */
function get_last_index(ns, ram) {
  const purchased_servers = ns.getPurchasedServers();

  if (!purchased_servers) return 0;

  const current_stage_servers = purchased_servers.filter((server) => ns.getServerMaxRam(server) >= ram)

  return current_stage_servers ? current_stage_servers.length : -1;
}

/** @param {NS} ns */
function buy_cost(ns, ram) {
  return ns.getPurchasedServerCost(ram);
}

/** @param {NS} ns */
function grow_cost(ns, ram, hostname) {
  return ns.getPurchasedServerUpgradeCost(hostname, ram);
}

/** @param {NS} ns */
export async function main(ns) {
  disable_logs(ns)

  // C2C action takes 1.7GB so 2 is enough to start
  const first_ram = 2;
  let ram = first_ram;
  let waiting = false;

  ns.print("bs: Initial RAM " + first_ram + " GB")

  while (ram < ns.getPurchasedServerMaxRam()) {
    const first_time = ram === first_ram;
    const last_index = get_last_index(ns, ram); // Get last server with required ram
    ns.print("bs: Start buying " + ram + " GB" + " from " + last_index)

    // Continuously try to purchase servers until we've reached the maximum
    // amount of servers
    let i = last_index + 1;
    while (i < ns.getPurchasedServerLimit()) {
      const hostname = `pserv-${i}`
      const neededMoney = first_time ? buy_cost(ns, ram) : grow_cost(ns, ram, hostname);

      if (ns.getServerMoneyAvailable("home") > neededMoney) {
        waiting = false;

        if (first_time) {
          ns.purchaseServer(hostname, ram);
          ns.toast(`bs: Buy ${hostname} with ${ram} GB`, "info")
          ns.print(`bs: Buy ${hostname} with ${ram} GB`)
        } else {
          ns.upgradePurchasedServer(hostname, ram);
          ns.toast(`bs: Upgrade ${hostname} to ${ram} GB`, "info")
          ns.print(`bs: Upgrade ${hostname} to ${ram} GB`)
        }

        i++;
      } else if (!waiting) {
        ns.print(`bs: waiting for ${formatCurrency(neededMoney)}`)
        waiting = true;
      }

      await ns.sleep(1000);
    }

    ns.print("bs: " + (i - 1) + " servers now " + ram + " GB")
    ns.toast("bs: " + (i - 1) + " servers now " + ram + " GB", "info")

    ram = ram * 2; // RAM goes up in steps of power of 2
    await ns.sleep(1000);
  }

  ns.alert("bs: All " + i + " servers maxed out with " + ram + " GB.")
}