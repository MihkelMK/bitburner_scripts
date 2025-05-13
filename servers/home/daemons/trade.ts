import { disable_logs, formatCurrency, notify } from '../helpers/cli.js';

const OPERATION_COST = 100000; // do not change this is fixed in the game

const MAX_STOCK_OWNED_PERCENT = 0.75; // maximum percentages of stock that can be owned at a time. (the more percent you own the more change you make on the market)
const MIN_FORECAST_PERCENT = 0.1; // min forecast percent from 0.5
const MIN_PURCHASE_MILLION = 500; // min total purchase cost in millions
const MIN_EXIT_FORECAST_PERCENT = 0.05; // in case the forecast turn under this value than exit.
const KEEP_MONEY_ON_HOME_MILLION = 1000; // how many million you want to keep out from trading (like for use it for something else)

interface OwnedSymbol {
  sym: string;
  sharesShort: number;
  shares: number;
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
      const [shares, , sharesShort] = tix.getPosition(sym);
      return { sym, sharesShort, shares };
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
  if (!areServersMaxxed(ns)) {
    notify(ns, 'Waiting for max servers');
    return false;
  }

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
  ]);
  notify(ns, 'TRADING BOT STARTED');

  const tix = ns.stock;
  let requirementsFilled = checkRequirements(ns, tix);

  while (true) {
    if (!requirementsFilled) {
      requirementsFilled = checkRequirements(ns, tix);
      await ns.sleep(1000 * 60 * 2);
      continue;
    }

    const money = availableMoney(ns) - OPERATION_COST;

    const owned = getOwnedSymbols(tix);
    for (let i in owned) {
      const { sym, shares } = owned[i];
      const forecast = tix.getForecast(sym);

      if (shares > 0 && forecast - MIN_EXIT_FORECAST_PERCENT <= 0.5) {
        const sellPrice = tix.sellStock(sym, shares);

        if (sellPrice > 0) {
          notify(
            ns,
            `Sell ${ns.formatNumber(shares)} x ${sym} for ${formatCurrency(ns, sellPrice * shares)}.`,
            'trade'
          );
        }
      }
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

    await tix.nextUpdate();
  }
}
