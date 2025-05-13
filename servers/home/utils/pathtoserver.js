/**
 * @param {AutocompleteData} data - context about the game, useful when autocompleting
 * @param {string[]} args - current arguments, not including "run script.js"
 * @returns {string[]} - the array of possible autocomplete options
 */
export function autocomplete(data, args) {
  const servers = data.servers;

  if (args[0]) {
    return servers.filter((server) => server.startsWith(args[0]));
  }

  return servers;
}

/** @param {NS} ns */
export async function main(ns) {
  // Check if arguments were provided
  if (ns.args.length < 1) {
    ns.tprint('Usage: run find-path.js [target-hostname]');
    return;
  }

  const targetHost = ns.args[0];
  let scanRange = 3;

  if (ns.fileExists('DeepscanV1.exe')) scanRange = 5;
  if (ns.fileExists('DeepscanV2.exe')) scanRange = 10;

  const currentHost = ns.getHostname();

  // If we're already on the target server, no need to search
  if (currentHost === targetHost) {
    ns.tprint(`Already on ${targetHost}`);
    return;
  }

  // Use optimized path finding that leverages backdoored servers
  const path = findOptimalPath(ns, currentHost, targetHost);

  if (path.length === 0) {
    ns.tprint(`No path found to ${targetHost}`);
  } else {
    // Format and display the path with special markers for servers outside scan range
    let formattedPath = '';
    let currentDepth = 0;

    path.forEach((server, index) => {
      if (index === 0) {
        formattedPath += server;
      } else {
        currentDepth = getDistance(ns, currentHost, server);

        if (currentDepth > scanRange) {
          formattedPath += ' |-> ' + server;
        } else {
          formattedPath += ' -> ' + server;
        }
      }
    });

    ns.tprint(formattedPath);
  }
}

/**
 * Calculates the distance (number of hops) between two servers
 * @param {NS} ns - Netscript API
 * @param {string} from - Starting hostname
 * @param {string} to - Target hostname
 * @returns {number} - Distance between servers
 */
function getDistance(ns, from, to) {
  if (from === to) return 0;

  const visited = new Set();
  const queue = [{ server: from, depth: 0 }];

  while (queue.length > 0) {
    const { server, depth } = queue.shift();

    if (server === to) return depth;

    if (visited.has(server)) continue;
    visited.add(server);

    const connectedServers = ns.scan(server);
    for (const connectedServer of connectedServers) {
      if (!visited.has(connectedServer)) {
        queue.push({ server: connectedServer, depth: depth + 1 });
      }
    }
  }

  return Infinity; // Not connected
}

/**
 * Finds the optimal path from start to target hostname using backdoored servers as shortcuts
 * @param {NS} ns - Netscript API
 * @param {string} start - Starting hostname
 * @param {string} target - Target hostname
 * @returns {string[]} - Array of hostnames representing the path
 */
export function findOptimalPath(ns, start, target) {
  // Get all backdoored servers in the network
  const backdooredServers = getAllBackdooredServers(ns);

  // If target is backdoored, we can connect directly
  if (backdooredServers.includes(target)) {
    return [start, target];
  }

  // If we have any backdoored servers, see if we can use them to reach the target
  if (backdooredServers.length > 0) {
    // Find the closest backdoored server to the target
    let bestPath = null;
    let shortestLength = Infinity;

    for (const backdooredServer of backdooredServers) {
      // Skip if the backdoored server is our starting point
      if (backdooredServer === start) continue;

      // Find path from backdoored server to target
      const pathToTarget = findPath(ns, backdooredServer, target);

      if (pathToTarget.length > 0 && pathToTarget.length < shortestLength) {
        shortestLength = pathToTarget.length;
        bestPath = [start, backdooredServer, ...pathToTarget.slice(1)];
      }
    }

    if (bestPath) {
      return bestPath;
    }
  }

  // If no backdoored shortcut works, find the regular shortest path
  return findPath(ns, start, target);
}

/**
 * Gets all backdoored servers in the network
 * @param {NS} ns - Netscript API
 * @returns {string[]} - Array of hostnames with backdoors installed
 */
function getAllBackdooredServers(ns) {
  const visited = new Set();
  const queue = ['home'];
  const backdoored = [];

  while (queue.length > 0) {
    const current = queue.shift();

    if (visited.has(current)) continue;
    visited.add(current);

    // Check if server has a backdoor installed
    if (ns.getServer(current).backdoorInstalled) {
      backdoored.push(current);
    }

    // Add connected servers to the queue
    const connectedServers = ns.scan(current);
    for (const server of connectedServers) {
      if (!visited.has(server)) {
        queue.push(server);
      }
    }
  }

  return backdoored;
}

/**
 * Finds the shortest path from start to target hostname
 * @param {NS} ns - Netscript API
 * @param {string} start - Starting hostname
 * @param {string} target - Target hostname
 * @returns {string[]} - Array of hostnames representing the path
 */
function findPath(ns, start, target) {
  // Queue for BFS
  const queue = [];
  // Keep track of visited servers and their parents
  const visited = new Set();
  const parent = {};

  // Start the search
  queue.push(start);
  visited.add(start);

  while (queue.length > 0) {
    const current = queue.shift();

    // If we found the target, reconstruct and return the path
    if (current === target) {
      return reconstructPath(current, parent, start);
    }

    // Get all connected servers and add them to the queue if not visited
    const connectedServers = ns.scan(current);
    for (const server of connectedServers) {
      if (!visited.has(server)) {
        visited.add(server);
        parent[server] = current;
        queue.push(server);

        // If this server has a backdoor installed, prioritize it by moving it to the front of the queue
        if (ns.getServer(server).backdoorInstalled && server !== target) {
          // Remove from current position
          queue.pop();
          // Add to front of queue
          queue.unshift(server);
        }
      }
    }
  }

  // No path found
  return [];
}

/**
 * Reconstructs the path from target to start using the parent map
 * @param {string} target - Target hostname
 * @param {Object} parent - Map of server to its parent
 * @param {string} start - Starting hostname
 * @returns {string[]} - Array of hostnames representing the path
 */
function reconstructPath(target, parent, start) {
  const path = [];
  let current = target;

  // Walk backwards from target to start using parent references
  while (current !== start) {
    path.unshift(current);
    current = parent[current];
  }

  // Add the starting point at the beginning
  path.unshift(start);
  return path;
}

