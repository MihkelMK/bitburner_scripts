import {
  disable_logs,
  formatCurrency,
  notify,
  TAIL_BODY_FONT_SIZE,
  TAIL_HEIGHT_MULT,
  TAIL_TITLEBAR_OFFSET,
} from '../helpers/cli.js';
import {
  TRADE_MONITOR_PORT,
  TRADE_TOTAL_PROFIT_PORT,
  TRADE_TRANSACTIONS_PORT,
} from '../helpers/ports.js';
import { setupMonitor } from '../utils/port_monitor.js';

const OPERATION_COST = 100000; // do not change this is fixed in the game

const MAX_STOCK_OWNED_PERCENT = 0.75; // maximum percentages of stock that can be owned at a time. (the more percent you own the more change you make on the market)
const MIN_FORECAST_PERCENT = 0.1; // min forecast percent from 0.5
const MIN_PURCHASE_MILLION = 500; // min total purchase cost in millions
const MIN_EXIT_FORECAST_PERCENT = 0.05; // in case the forecast turn under this value than exit.
const KEEP_MONEY_ON_HOME_MILLION = 100; // how many million you want to keep out from trading (like for use it for something else)

interface Transaction {
  sym: string;
  shares: number;
  price: number;
  timestamp: number;
  type: 'buy' | 'sell';
  isShort: boolean;
}

interface OwnedSymbol {
  sym: string;
  sharesShort: number;
  shares: number;
  avgLongPrice: number;
  avgShortPrice: number;
}

interface TradeData {
  transactions: Transaction[];
  longPositions: Record<string, Transaction[]>; // FIFO queue of buy transactions
  shortPositions: Record<string, Transaction[]>; // FIFO queue of short transactions
  realizedProfit: number;
  unrealizedProfit: number;
  totalInvested: number;
}

// Initialize trade data structure
function initTradeData(): TradeData {
  return {
    transactions: [],
    longPositions: {},
    shortPositions: {},
    realizedProfit: 0,
    unrealizedProfit: 0,
    totalInvested: 0,
  };
}

// Save trade data to port for persistence
function saveTradeData(ns: NS, tradeData: TradeData): void {
  ns.clearPort(TRADE_TRANSACTIONS_PORT);
  ns.writePort(TRADE_TRANSACTIONS_PORT, JSON.stringify(tradeData));
}

// Load trade data from port
function loadTradeData(ns: NS): TradeData {
  const data = ns.readPort(TRADE_TRANSACTIONS_PORT);
  if (data === 'NULL PORT DATA') {
    return initTradeData();
  }
  try {
    return JSON.parse(data.toString());
  } catch (e) {
    ns.print('Error loading trade data: ' + e);
    return initTradeData();
  }
}

// Sync our data with actual game state
function syncWithGameState(ns: NS, tix: TIX, tradeData: TradeData): TradeData {
  // Create a fresh trade data object
  const newTradeData = initTradeData();
  newTradeData.realizedProfit = tradeData.realizedProfit;

  // Get all stocks in the game
  const allStocks = tix.getSymbols();

  // First, check for manual sales - positions that decreased without our script knowing
  for (const sym of allStocks) {
    const [actualShares, , actualShortShares] = tix.getPosition(sym);

    // Check for manual long position sales
    if (
      tradeData.longPositions[sym] &&
      tradeData.longPositions[sym].length > 0
    ) {
      // Calculate total shares we think we own
      const trackedShares = tradeData.longPositions[sym].reduce(
        (sum, pos) => sum + pos.shares,
        0
      );

      // If we own fewer shares than we think we do, a manual sale occurred
      if (actualShares < trackedShares) {
        const sharesSold = trackedShares - actualShares;
        const sellPrice = tix.getBidPrice(sym); // Use current price as approximation

        ns.print(
          `Detected manual sale of ${sym}: ${ns.formatNumber(sharesSold, 0)} shares at ~${formatCurrency(ns, sellPrice)}`
        );

        // Record the manual sale
        const manualProfit = recordSell(
          tradeData,
          sym,
          sharesSold,
          sellPrice,
          false
        );

        // Add to realized profit
        newTradeData.realizedProfit = tradeData.realizedProfit;

        notify(
          ns,
          `Detected manual sale of ${ns.formatNumber(sharesSold, 0)} x ${sym}. Estimated profit: ${formatCurrency(ns, manualProfit)}.`,
          'trade'
        );
      }
    }

    // Check for manual short position sales
    if (
      tradeData.shortPositions[sym] &&
      tradeData.shortPositions[sym].length > 0
    ) {
      // Calculate total short shares we think we own
      const trackedShortShares = tradeData.shortPositions[sym].reduce(
        (sum, pos) => sum + pos.shares,
        0
      );

      // If we own fewer short shares than we think we do, a manual sale occurred
      if (actualShortShares < trackedShortShares) {
        const sharesSold = trackedShortShares - actualShortShares;
        const sellPrice = tix.getAskPrice(sym); // Use current price as approximation

        ns.print(
          `Detected manual closing of short ${sym}: ${ns.formatNumber(sharesSold, 0)} shares at ~${formatCurrency(ns, sellPrice)}`
        );

        // Record the manual sale
        const manualProfit = recordSell(
          tradeData,
          sym,
          sharesSold,
          sellPrice,
          true
        );

        // Add to realized profit
        newTradeData.realizedProfit = tradeData.realizedProfit;

        notify(
          ns,
          `Detected manual closing of short ${ns.formatNumber(sharesSold, 0)} x ${sym}. Estimated profit: ${formatCurrency(ns, manualProfit)}.`,
          'trade'
        );
      }
    }
  }

  // Get all stocks we actually own in the game
  const ownedStocks = allStocks.filter((sym) => {
    const [shares, , sharesShort] = tix.getPosition(sym);
    return shares > 0 || sharesShort > 0;
  });

  // Check for stocks we own that aren't in our trade data or have more shares than tracked
  for (const sym of ownedStocks) {
    const [shares, avgLongPrice, sharesShort, avgShortPrice] =
      tix.getPosition(sym);

    // For long positions
    if (shares > 0) {
      if (!newTradeData.longPositions[sym]) {
        newTradeData.longPositions[sym] = [];
      }

      // Calculate how many shares we're currently tracking
      const trackedShares = tradeData.longPositions[sym]
        ? tradeData.longPositions[sym].reduce((sum, pos) => sum + pos.shares, 0)
        : 0;

      // If we have no record of this position or fewer shares than actually owned
      if (!tradeData.longPositions[sym] || trackedShares < shares) {
        const newShares = shares - trackedShares;
        const syntheticTransaction: Transaction = {
          sym,
          shares: newShares,
          price: avgLongPrice,
          timestamp: Date.now(),
          type: 'buy',
          isShort: false,
        };
        newTradeData.longPositions[sym] = newTradeData.longPositions[sym] || [];
        newTradeData.longPositions[sym].push(syntheticTransaction);
        newTradeData.transactions.push(syntheticTransaction);
        ns.print(
          `Synced unknown long position: ${sym} x ${ns.formatNumber(newShares, 0)} @ ${formatCurrency(ns, avgLongPrice)}`
        );
      } else {
        // Copy existing transactions
        newTradeData.longPositions[sym] = [...tradeData.longPositions[sym]];
      }
    }

    // For short positions
    if (sharesShort > 0) {
      if (!newTradeData.shortPositions[sym]) {
        newTradeData.shortPositions[sym] = [];
      }

      // Calculate how many short shares we're currently tracking
      const trackedShortShares = tradeData.shortPositions[sym]
        ? tradeData.shortPositions[sym].reduce(
            (sum, pos) => sum + pos.shares,
            0
          )
        : 0;

      // If we have no record of this position or fewer shares than actually owned
      if (!tradeData.shortPositions[sym] || trackedShortShares < sharesShort) {
        const newShares = sharesShort - trackedShortShares;
        const syntheticTransaction: Transaction = {
          sym,
          shares: newShares,
          price: avgShortPrice,
          timestamp: Date.now(),
          type: 'buy',
          isShort: true,
        };
        newTradeData.shortPositions[sym] =
          newTradeData.shortPositions[sym] || [];
        newTradeData.shortPositions[sym].push(syntheticTransaction);
        newTradeData.transactions.push(syntheticTransaction);
        ns.print(
          `Synced unknown short position: ${sym} x ${ns.formatNumber(newShares, 0)} @ ${formatCurrency(ns, avgShortPrice)}`
        );
      } else {
        // Copy existing transactions
        newTradeData.shortPositions[sym] = [...tradeData.shortPositions[sym]];
      }
    }
  }

  // Copy over other transactions that don't relate to current positions
  for (const transaction of tradeData.transactions) {
    if (transaction.type === 'sell') {
      newTradeData.transactions.push(transaction);
    }
  }

  // Calculate total invested
  newTradeData.totalInvested = calculateTotalInvested(newTradeData);

  // Calculate unrealized profit
  newTradeData.unrealizedProfit = calculateUnrealizedProfit(tix, newTradeData);

  return newTradeData;
}

// Calculate total invested amount
function calculateTotalInvested(tradeData: TradeData): number {
  let total = 0;

  // Sum all long positions
  for (const sym in tradeData.longPositions) {
    for (const transaction of tradeData.longPositions[sym]) {
      total += transaction.shares * transaction.price;
    }
  }

  // Sum all short positions
  for (const sym in tradeData.shortPositions) {
    for (const transaction of tradeData.shortPositions[sym]) {
      total += transaction.shares * transaction.price;
    }
  }

  return total;
}

// Calculate unrealized profit based on current stock prices
function calculateUnrealizedProfit(tix: TIX, tradeData: TradeData): number {
  let unrealizedProfit = 0;

  // Calculate for long positions
  for (const sym in tradeData.longPositions) {
    const currentPrice = tix.getBidPrice(sym);
    for (const transaction of tradeData.longPositions[sym]) {
      unrealizedProfit +=
        transaction.shares * (currentPrice - transaction.price);
    }
  }

  // Calculate for short positions
  for (const sym in tradeData.shortPositions) {
    const currentPrice = tix.getAskPrice(sym);
    for (const transaction of tradeData.shortPositions[sym]) {
      unrealizedProfit +=
        transaction.shares * (transaction.price - currentPrice);
    }
  }

  return unrealizedProfit;
}

// Record a buy transaction
function recordBuy(
  tradeData: TradeData,
  sym: string,
  shares: number,
  price: number,
  isShort: boolean
): void {
  const transaction: Transaction = {
    sym,
    shares,
    price,
    timestamp: Date.now(),
    type: 'buy',
    isShort,
  };

  tradeData.transactions.push(transaction);

  if (isShort) {
    if (!tradeData.shortPositions[sym]) {
      tradeData.shortPositions[sym] = [];
    }
    tradeData.shortPositions[sym].push(transaction);
  } else {
    if (!tradeData.longPositions[sym]) {
      tradeData.longPositions[sym] = [];
    }
    tradeData.longPositions[sym].push(transaction);
  }

  tradeData.totalInvested = calculateTotalInvested(tradeData);
}

// Record a sell transaction using FIFO accounting
function recordSell(
  tradeData: TradeData,
  sym: string,
  sharesToSell: number,
  price: number,
  isShort: boolean
): number {
  let profit = 0;
  let remainingToSell = sharesToSell;
  const positions = isShort
    ? tradeData.shortPositions[sym]
    : tradeData.longPositions[sym];

  if (!positions || positions.length === 0) {
    return 0; // Can't sell what we don't have
  }

  const transaction: Transaction = {
    sym,
    shares: sharesToSell,
    price,
    timestamp: Date.now(),
    type: 'sell',
    isShort,
  };

  tradeData.transactions.push(transaction);

  // FIFO accounting - sell oldest shares first
  while (remainingToSell > 0 && positions.length > 0) {
    const oldestPosition = positions[0];
    const sharesToSellFromThisPosition = Math.min(
      remainingToSell,
      oldestPosition.shares
    );

    // Calculate profit for this portion
    if (isShort) {
      profit += sharesToSellFromThisPosition * (oldestPosition.price - price);
    } else {
      profit += sharesToSellFromThisPosition * (price - oldestPosition.price);
    }

    remainingToSell -= sharesToSellFromThisPosition;

    if (sharesToSellFromThisPosition === oldestPosition.shares) {
      // Used up all shares from this position
      positions.shift();
    } else {
      // Partially used this position
      oldestPosition.shares -= sharesToSellFromThisPosition;
    }
  }

  tradeData.realizedProfit += profit;
  tradeData.totalInvested = calculateTotalInvested(tradeData);

  return profit;
}

function availableMoney(ns: NS): number {
  const money =
    ns.getServerMoneyAvailable('home') - KEEP_MONEY_ON_HOME_MILLION * 1000000;
  return money;
}

function canBuy(money: number): boolean {
  return money >= MIN_PURCHASE_MILLION * 1000000;
}

function getSymbolPoint(tix: TIX, sym: string): number {
  const forecast = tix.getForecast(sym) - 0.5;
  const adjustedForecast = forecast * (1 / MIN_FORECAST_PERCENT); // * Math.E

  if (forecast < MIN_FORECAST_PERCENT) return 0;
  else return adjustedForecast * tix.getVolatility(sym) * 100;
}

function sortAndFilterSymbols(tix: TIX): string[] {
  const filteredSymbols = tix
    .getSymbols()
    .filter((a) => getSymbolPoint(tix, a) > 0) // check if it's even good for us to trade
    .filter((sym) => {
      // check if we didn't over buy this symbol
      const [shares, , sharesShort] = tix.getPosition(sym);
      return (
        tix.getMaxShares(sym) * MAX_STOCK_OWNED_PERCENT >
        Math.max(shares, sharesShort)
      );
    });
  return filteredSymbols.sort(
    (a, b) => getSymbolPoint(tix, b) - getSymbolPoint(tix, a)
  );
}

function getOwnedSymbols(tix: TIX): OwnedSymbol[] {
  const symbols = tix
    .getSymbols()
    .map((sym) => {
      const [shares, avgLongPrice, sharesShort, avgShortPrice] =
        tix.getPosition(sym);
      return { sym, sharesShort, shares, avgLongPrice, avgShortPrice };
    })
    .filter((sym) => sym.sharesShort > 0 || sym.shares > 0);
  return symbols;
}

// Start trading when upgrading all servers takes more than KEEP_MONEY_ON_HOME_MILLION
function areServersMaxxed(ns: NS): boolean {
  const servers = ns.getPurchasedServers();
  const maxCount = ns.getPurchasedServerLimit();

  if (servers.length < maxCount) return false;

  const maxRAM = ns.getPurchasedServerMaxRam();
  const costThreshold = (KEEP_MONEY_ON_HOME_MILLION * 1000000) / maxCount;

  for (let i in servers) {
    const currRam = ns.getServerMaxRam(servers[i]);
    const nextCost = ns.getPurchasedServerUpgradeCost(servers[i], currRam * 2);

    if (currRam < maxRAM && nextCost < costThreshold) {
      return false;
    }
  }

  return true;
}

function checkRequirements(ns: NS, tix: TIX): boolean {
  if (!tix.purchaseWseAccount()) {
    notify(ns, 'Waiting for money to buy WSE account');
    return false;
  }

  if (!tix.purchase4SMarketData()) {
    notify(ns, 'Waiting for money to buy 4S data');
    return false;
  }

  if (!tix.purchaseTixApi()) {
    notify(ns, 'Waiting for money to buy TIX API');
    return false;
  }

  if (!tix.purchase4SMarketDataTixApi()) {
    notify(ns, 'Waiting for money to buy 4S API');
    return false;
  }

  return true;
}

export async function main(ns: NS) {
  disable_logs(ns, [
    'getServerMaxRam',
    'getServerMoneyAvailable',
    'sleep',
    'stock.sellStock',
    'stock.buyStock',
    'stock.purchaseWseAccount',
    'stock.purchase4SMarketData',
    'stock.purchaseTixApi',
    'stock.purchase4SMarketDataTixApi',
    'run',
  ]);

  setupMonitor(ns, ns.pid, TRADE_MONITOR_PORT, 'Portfolio', {
    x: -9,
    y:
      -32 -
      (TAIL_TITLEBAR_OFFSET + TAIL_BODY_FONT_SIZE * 2 * TAIL_HEIGHT_MULT + 11) *
        2,
  });

  ns.clearPort(TRADE_MONITOR_PORT);
  ns.writePort(
    TRADE_MONITOR_PORT,
    `${formatCurrency(ns, 0)}\nProfit: ${formatCurrency(ns, 0)}`
  );

  notify(ns, 'TRADING BOT STARTED');

  const tix = ns.stock;
  let requirementsFilled = checkRequirements(ns, tix);

  // Load trade data or initialize new data
  let tradeData = loadTradeData(ns);

  // Sync with game state on startup
  tradeData = syncWithGameState(ns, tix, tradeData);

  // Save the synced data back to port
  saveTradeData(ns, tradeData);

  // Write total profit to port
  ns.writePort(TRADE_TOTAL_PROFIT_PORT, tradeData.realizedProfit);

  while (true) {
    if (!requirementsFilled) {
      requirementsFilled = checkRequirements(ns, tix);
      await ns.sleep(1000 * 60 * 2);
      continue;
    }

    const money = availableMoney(ns) - OPERATION_COST;

    // Update game state
    tradeData = syncWithGameState(ns, tix, tradeData);
    tradeData.unrealizedProfit = calculateUnrealizedProfit(tix, tradeData);

    const owned = getOwnedSymbols(tix);
    for (let i in owned) {
      const { sym, shares } = owned[i];
      const forecast = tix.getForecast(sym);

      // Check if we should sell long positions
      if (shares > 0 && forecast - MIN_EXIT_FORECAST_PERCENT <= 0.5) {
        const sellPrice = tix.sellStock(sym, shares);

        if (sellPrice > 0) {
          // Record the sale and calculate profit
          const profit = recordSell(tradeData, sym, shares, sellPrice, false);

          notify(
            ns,
            `Sell ${ns.formatNumber(shares)} x ${sym} for ${formatCurrency(ns, sellPrice * shares)}. Profit: ${formatCurrency(ns, profit)}.`,
            'trade'
          );
        }
      }
    }

    // This requirement is only needed for buying
    if (!areServersMaxxed(ns)) {
      notify(ns, 'Waiting for max servers');
      await ns.sleep(1000 * 60 * 2);
      continue;
    }

    if (canBuy(money)) {
      const buyCandidates = sortAndFilterSymbols(tix);

      for (let i in buyCandidates) {
        if (!canBuy(money)) break;

        const sym = buyCandidates[i];
        const [shares, , sharesShort] = tix.getPosition(sym);

        if (getSymbolPoint(tix, sym) > 0) {
          const amountToBuy =
            tix.getMaxShares(sym) * MAX_STOCK_OWNED_PERCENT -
            shares -
            sharesShort;
          const amountToAfford = Math.min(
            amountToBuy,
            Math.floor(money / tix.getAskPrice(sym))
          );

          if (amountToAfford > 0) {
            const purchasePrice = tix.buyStock(sym, amountToAfford);

            if (purchasePrice > 0) {
              // Record the purchase
              recordBuy(tradeData, sym, amountToAfford, purchasePrice, false);

              notify(
                ns,
                `Buy ${ns.formatNumber(amountToAfford)} x ${sym} for ${formatCurrency(ns, purchasePrice * amountToAfford)}.`,
                'trade'
              );
            }
          }
        }
      }
    }

    // Save updated trade data
    saveTradeData(ns, tradeData);

    // Write total profit to port
    ns.writePort(TRADE_TOTAL_PROFIT_PORT, tradeData.realizedProfit);

    // Update monitor display
    ns.clearPort(TRADE_MONITOR_PORT);
    ns.writePort(
      TRADE_MONITOR_PORT,
      `${formatCurrency(ns, tradeData.totalInvested)}\nProfit: ${formatCurrency(ns, tradeData.realizedProfit)}\nUnrealized: ${formatCurrency(ns, tradeData.unrealizedProfit)}`
    );

    await tix.nextUpdate();
  }
}
