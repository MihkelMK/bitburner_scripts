import { notify } from '../helpers/cli';

interface LimitsRecord {
  strength: number;
  dexterity: number;
  defense: number;
  agility: number;
}

async function train(ns: NS, limits: LimitsRecord) {
  for (let [stat, limit] of Object.entries(limits)) {
    const statKey = stat.substring(0, 3) as 'dex' | 'str' | 'def' | 'agi';
    let skills = ns.getPlayer().skills;

    ns.singularity.gymWorkout('Powerhouse Gym', statKey);
    while (skills[stat] < limit) {
      skills = ns.getPlayer().skills;
      notify(ns, `Training ${stat} for 1 minute untill ${limit}`);
      await ns.sleep(1000 * 60);
    }
  }
}

export async function main(ns: NS) {
  const totalAugments = ns.args[0] as number;

  if (totalAugments < 10) {
    await train(ns, { strength: 50, defense: 20, dexterity: 20, agility: 20 });
  } else {
    await train(ns, {
      strength: 100,
      defense: 100,
      dexterity: 100,
      agility: 100,
    });
  }

  ns.spawn('automation/crime.js', { threads: 1, spawnDelay: 0 }, totalAugments);
}
