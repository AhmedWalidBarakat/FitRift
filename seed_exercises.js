const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Existing rows (ids 1-4) are updated in place to preserve foreign keys
// from test data already logged against them. Everything else is new.
const EXERCISES = [
  // --- Push-up family ---
  { name: 'Knee Push-up', unit: 'reps', family: 'pushup', progressionOrder: 0, strengthWeight: 0.8, enduranceWeight: 0.2 },
  { name: 'Incline Push-up', unit: 'reps', family: 'pushup', progressionOrder: 1, strengthWeight: 0.9, enduranceWeight: 0.2 },
  { name: 'Push-up', unit: 'reps', family: 'pushup', progressionOrder: 2, strengthWeight: 1.0, enduranceWeight: 0.3 }, // was "Push-ups" (id 1)
  { name: 'Diamond Push-up', unit: 'reps', family: 'pushup', progressionOrder: 3, strengthWeight: 1.2, enduranceWeight: 0.3 },
  { name: 'Decline Push-up', unit: 'reps', family: 'pushup', progressionOrder: 4, strengthWeight: 1.3, enduranceWeight: 0.3 },
  { name: 'Archer Push-up', unit: 'reps', family: 'pushup', progressionOrder: 5, strengthWeight: 1.5, agilityWeight: 0.3 },
  { name: 'One-Arm Push-up', unit: 'reps', family: 'pushup', progressionOrder: 6, strengthWeight: 2.0, agilityWeight: 0.5 },

  // --- Pull-up family ---
  { name: 'Assisted Pull-up', unit: 'reps', family: 'pullup', progressionOrder: 0, strengthWeight: 0.8, enduranceWeight: 0.2 },
  { name: 'Chin-up', unit: 'reps', family: 'pullup', progressionOrder: 1, strengthWeight: 0.9, enduranceWeight: 0.2 },
  { name: 'Pull-up', unit: 'reps', family: 'pullup', progressionOrder: 2, strengthWeight: 1.0, enduranceWeight: 0.3 }, // was "Pull-ups" (id 4)
  { name: 'Weighted Pull-up', unit: 'reps', family: 'pullup', progressionOrder: 3, strengthWeight: 1.4, enduranceWeight: 0.3 },
  { name: 'Archer Pull-up', unit: 'reps', family: 'pullup', progressionOrder: 4, strengthWeight: 1.6, agilityWeight: 0.3 },
  { name: 'Muscle-up', unit: 'reps', family: 'pullup', progressionOrder: 5, strengthWeight: 2.2, agilityWeight: 0.5 },

  // --- Squat family ---
  { name: 'Bodyweight Squat', unit: 'reps', family: 'squat', progressionOrder: 0, strengthWeight: 0.8, vitalityWeight: 0.4 }, // was "Squats" (id 3)
  { name: 'Jump Squat', unit: 'reps', family: 'squat', progressionOrder: 1, strengthWeight: 1.0, agilityWeight: 0.4 },
  { name: 'Bulgarian Split Squat', unit: 'reps', family: 'squat', progressionOrder: 2, strengthWeight: 1.2, agilityWeight: 0.4 },
  { name: 'Pistol Squat', unit: 'reps', family: 'squat', progressionOrder: 3, strengthWeight: 1.6, agilityWeight: 0.6 },

  // --- Standalone exercises (no progression variants yet) ---
  { name: 'Sit-ups', unit: 'reps', family: 'situp', progressionOrder: 0, enduranceWeight: 0.6, vitalityWeight: 0.4 }, // existing (id 2)
  { name: 'Lunges', unit: 'reps', family: 'lunge', progressionOrder: 0, strengthWeight: 0.7, agilityWeight: 0.4 },
  { name: 'Crunches', unit: 'reps', family: 'crunch', progressionOrder: 0, enduranceWeight: 0.5, vitalityWeight: 0.3 },
  { name: 'Dips', unit: 'reps', family: 'dip', progressionOrder: 0, strengthWeight: 1.1, enduranceWeight: 0.2 },
  { name: 'Plank', unit: 'seconds', family: 'plank', progressionOrder: 0, vitalityWeight: 0.8 },
  { name: 'Leg Raises', unit: 'reps', family: 'legraise', progressionOrder: 0, enduranceWeight: 0.5, vitalityWeight: 0.4 },
  { name: 'Burpees', unit: 'reps', family: 'burpee', progressionOrder: 0, strengthWeight: 0.6, enduranceWeight: 0.8, agilityWeight: 0.3 },
  { name: 'Mountain Climbers', unit: 'reps', family: 'mountainclimber', progressionOrder: 0, enduranceWeight: 0.7, agilityWeight: 0.5 },
  { name: 'Running', unit: 'km', family: 'running', progressionOrder: 0, agilityWeight: 1.0, enduranceWeight: 0.5 },
  { name: 'Curls', unit: 'reps', family: 'curl', progressionOrder: 0, strengthWeight: 0.9 },
  { name: 'Hammer Curls', unit: 'reps', family: 'hammercurl', progressionOrder: 0, strengthWeight: 0.9 },
  { name: 'Tricep Extensions', unit: 'reps', family: 'tricepext', progressionOrder: 0, strengthWeight: 0.9 },
];

async function main() {
  // Rename the 4 existing exercises in place so old WorkoutSetEntry/Baseline rows stay valid
  const renames = [
    { oldName: 'Push-ups', data: EXERCISES.find(e => e.name === 'Push-up') },
    { oldName: 'Pull-ups', data: EXERCISES.find(e => e.name === 'Pull-up') },
    { oldName: 'Squats', data: EXERCISES.find(e => e.name === 'Bodyweight Squat') },
    { oldName: 'Sit-ups', data: EXERCISES.find(e => e.name === 'Sit-ups') },
  ];

  for (const { oldName, data } of renames) {
    const existing = await prisma.exercise.findUnique({ where: { name: oldName } });
    if (existing) {
      await prisma.exercise.update({ where: { id: existing.id }, data });
      console.log(`Updated existing "${oldName}" -> "${data.name}"`);
    }
  }

  const alreadyHandled = new Set(['Push-up', 'Pull-up', 'Bodyweight Squat', 'Sit-ups']);
  const toCreate = EXERCISES.filter(e => !alreadyHandled.has(e.name));

  for (const ex of toCreate) {
    await prisma.exercise.upsert({
      where: { name: ex.name },
      update: ex,
      create: ex,
    });
  }

  const all = await prisma.exercise.findMany({ orderBy: [{ family: 'asc' }, { progressionOrder: 'asc' }] });
  console.log(`\nTotal exercises: ${all.length}`);
  all.forEach(e => console.log(`  [${e.id}] ${e.family}/${e.progressionOrder} - ${e.name} (${e.unit})`));
}

main().then(() => prisma.$disconnect()).catch(e => { console.error(e); process.exit(1); });
