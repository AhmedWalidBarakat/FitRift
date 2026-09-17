const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const BADGES = [
  { key: 'first_workout', name: 'First Steps', description: 'Logged your very first workout.', icon: '🥉' },
  { key: 'first_record', name: 'Record Breaker', description: 'Set your first personal record.', icon: '⚔️' },
  { key: 'first_quest', name: 'Quest Complete', description: 'Completed your first quest.', icon: '📜' },
  { key: 'rank_d', name: 'D-Rank Hunter', description: 'Reached D-Rank.', icon: '🔰' },
  { key: 'rank_c', name: 'C-Rank Hunter', description: 'Reached C-Rank.', icon: '🥈' },
  { key: 'rank_b', name: 'B-Rank Hunter', description: 'Reached B-Rank.', icon: '🥇' },
  { key: 'rank_a', name: 'A-Rank Hunter', description: 'Reached A-Rank.', icon: '💠' },
  { key: 'rank_s', name: 'S-Rank Hunter', description: 'Reached S-Rank — the peak.', icon: '👑' },
];

async function main() {
  for (const b of BADGES) {
    await prisma.badge.upsert({ where: { key: b.key }, update: b, create: b });
  }
  const all = await prisma.badge.findMany();
  console.log(`Seeded ${all.length} badges.`);
}

main().then(() => prisma.$disconnect()).catch(e => { console.error(e); process.exit(1); });
