import {
  disable_logs,
  formatCurrency,
  formatNumber,
  notify,
} from '../helpers/cli.js';

const OPERATION_COST = 100000; // do not change this is fixed in the game

const MAX_STOCK_OWNED_PERCENT = 0.75; // maximum percentages of stock that can be owned at a time. (the more percent you own the more change you make on the market)
const MIN_FORECAST_PERCENT = 0.1; // min forecast percent from 0.5
const MIN_PURCHASE_MILLION = 500; // min total purchase cost in millions
const MIN_EXIT_FORECAST_PERCENT = 0.05; // in case the forecast turn under this value than exit.
const KEEP_MONEY_ON_HOME_MILLION = 1000; // how many million you want to keep out from trading (like for use it for something else)

/** @param {NS} ns */
function availableMoney(ns) {
  const money =
    ns.getServerMoneyAvailable('home') - KEEP_MONEY_ON_HOME_MILLION * 1000000;
  return money;
}

function canBuy(money) {
  return money >= MIN_PURCHASE_MILLION * 1000000;
}

/** @param {TIX} tix */
function getSymbolPoint(tix, sym) {
  const forecast = tix.getForecast(sym) - 0.5;
  const adjustedForecast = forecast * (1 / MIN_FORECAST_PERCENT); // * Math.E

  if (forecast < MIN_FORECAST_PERCENT) return 0;
  else return adjustedForecast * tix.getVolatility(sym) * 100;
}

/** @param {TIX} tix */
function sortAndFilterSymbols(tix) {
  const filteredSymbols = tix
    .getSymbols()
    .filter((a) => getSymbolPoint(tix, a) > 0) // check if it's even good for us to trade
    .filter((sym) => {
      // check if we didn't over buy this symbol
      const [shares, avgPx, sharesShort, avgPxShort] = tix.getPosition(sym);
      return (
        tix.getMaxShares(sym) * MAX_STOCK_OWNED_PERCENT >
        Math.max(shares, sharesShort)
      );
    });
  return filteredSymbols.sort(
    (a, b) => getSymbolPoint(tix, b) - getSymbolPoint(tix, a)
  );
}

/** @param {TIX} tix */
function getOwnedSymbols(tix) {
  const symbols = tix
    .getSymbols()
    .map((sym) => {
      const [shares, avgPx, sharesShort, avgPxShort] = tix.getPosition(sym);
      return { sym, sharesShort, shares };
    })
    .filter((sym) => sym.sharesShort > 0 || sym.shares > 0);
  return symbols;
}

/** @param {NS} ns */
function serversMaxxed(ns) {
  const servers = ns.getPurchasedServers();
  const maxCount = ns.getPurchasedServerLimit();

  if (servers.length < maxCount) return false;

  const maxRAM = ns.getPurchasedServerMaxRam();

  for (let i in servers) {
    if (ns.getServerMaxRam(servers[i]) < maxRAM) {
      return false;
    }
  }

  return true;
}

/** @param {NS} ns */
export async function main(ns) {
  disable_logs(ns, [
    'getServerMoneyAvailable',
    'sleep',
    'stock.sellStock',
    'stock.buyStock',
  ]);
  const tix = ns.stock;

  while (true) {
    if (!serversMaxxed(ns)) {
      notify(ns, 'Waiting for max servers');
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
            `Sell ${formatNumber(shares)} x ${sym} for ${formatCurrency(sellPrice * shares)}.`,
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
        const [shares, avgPx, sharesShort, avgPxShort] = tix.getPosition(sym);

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
                `Buy ${formatNumber(amountToAfford)} x ${sym} for ${formatCurrency(purchasePrice * amountToAfford)}.`,
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

