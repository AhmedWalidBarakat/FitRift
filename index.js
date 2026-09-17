const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { PrismaClient } = require('@prisma/client');
const Groq = require('groq-sdk');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(cors());
app.use(express.json());

// /chat is the only route that calls the (paid, usage-billed) Groq API, so
// it gets its own tighter limit to stop a single client from running up
// costs — everything else is just our own database, which is free to hit.
const chatLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many messages sent — please wait a bit before trying again.' },
});
const prisma = new PrismaClient();
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY);

// Verifies the Supabase session token sent from the frontend, then ensures
// a matching Profile row exists (auto-created on a user's very first
// authenticated request) before attaching req.profileId for routes to use.
async function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
        return res.status(401).json({ error: 'Missing auth token' });
    }

    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) {
        return res.status(401).json({ error: 'Invalid or expired session' });
    }

    const profileId = data.user.id;

    await prisma.profile.upsert({
        where: { id: profileId },
        update: {},
        create: { id: profileId, displayName: data.user.email },
    });

    req.profileId = profileId;
    next();
}

app.get('/exercises', async (req, res) => {
    const exercises = await prisma.exercise.findMany();
    res.json(exercises);
});

app.get('/rankstate', requireAuth, async (req, res) => {
    const rankState = await prisma.rankState.findUnique({ where: { profileId: req.profileId } });
    res.json(rankState);
});

// Returns every progression family as an ordered chain, with each
// exercise flagged locked/unlocked based on whether the previous tier's
// personal record has crossed the unlock threshold.
app.get('/progression', requireAuth, async (req, res) => {
    const profileId = req.profileId;

    const exercises = await prisma.exercise.findMany({ orderBy: [{ family: 'asc' }, { progressionOrder: 'asc' }] });
    const records = await prisma.personalRecord.findMany({ where: { profileId } });
    const recordByExercise = Object.fromEntries(records.map(r => [r.exerciseId, r.maxReps]));

    const families = {};
    for (const ex of exercises) {
        (families[ex.family] ??= []).push(ex);
    }

    const chains = Object.entries(families).map(([family, chain]) => {
        let previousUnlocked = true; // the first tier in any chain is always available
        const nodes = chain.map((ex) => {
            const best = recordByExercise[ex.id] ?? 0;
            // Unlocked if the chain progressed here normally, OR the user has
            // already logged this exercise directly (e.g. someone who can
            // already do chin-ups shouldn't see it as locked just because
            // they never logged the easier assisted-pull-up tier first).
            const unlocked = previousUnlocked || best > 0;
            previousUnlocked = unlocked && best >= PROGRESSION_UNLOCK_THRESHOLD;
            return { id: ex.id, name: ex.name, unit: ex.unit, progressionOrder: ex.progressionOrder, best, unlocked };
        });
        return { family, nodes };
    });

    res.json(chains);
});

// Returns { totalXp, perEntry: [{ exerciseId, reps, xpEarned }] }
async function calculateXpEarned(profileId, entries) {
    let totalXp = 0;
    const perEntry = [];

    for (const entry of entries) {
        let baseline = await prisma.baseline.findUnique({
            where: { profileId_exerciseId: { profileId, exerciseId: entry.exerciseId } },
        });

        let xpEarned = 0;

        if (!baseline) {
            // First time logging this exercise — this becomes the baseline, no XP yet
            await prisma.baseline.create({
                data: { profileId, exerciseId: entry.exerciseId, baselineReps: entry.reps },
            });
        } else {
            const improvement = Math.max(0, (entry.reps - baseline.baselineReps) / baseline.baselineReps);
            xpEarned = improvement * 100;
        }

        totalXp += xpEarned;
        perEntry.push({ exerciseId: entry.exerciseId, reps: entry.reps, xpEarned });
    }

    return { totalXp, perEntry };
}

// Checks each logged entry against the user's all-time best for that
// exercise. Returns the new records set, plus each entry's previous best
// (0 if this is the first time) so progression-unlock logic can tell
// whether this session is what pushed them past a milestone.
async function updatePersonalRecords(profileId, entries) {
    const newRecords = [];
    const previousBests = {};

    for (const entry of entries) {
        const existing = await prisma.personalRecord.findUnique({
            where: { profileId_exerciseId: { profileId, exerciseId: entry.exerciseId } },
        });

        previousBests[entry.exerciseId] = existing?.maxReps ?? 0;

        if (!existing) {
            await prisma.personalRecord.create({
                data: { profileId, exerciseId: entry.exerciseId, maxReps: entry.reps },
            });
        } else if (entry.reps > existing.maxReps) {
            await prisma.personalRecord.update({
                where: { id: existing.id },
                data: { maxReps: entry.reps, achievedAt: new Date() },
            });
            newRecords.push({ exerciseId: entry.exerciseId, previousBest: existing.maxReps, newBest: entry.reps });
        }
    }

    return { newRecords, previousBests };
}

const PROGRESSION_UNLOCK_THRESHOLD = 25;

// Fires exactly once per exercise: the session where you cross the
// threshold for the first time. Later sessions past the threshold don't
// re-fire, since previousBest will already be >= threshold by then.
async function checkProgressionUnlocks(entries, previousBests) {
    const unlocks = [];

    for (const entry of entries) {
        const justCrossed = entry.reps >= PROGRESSION_UNLOCK_THRESHOLD
            && previousBests[entry.exerciseId] < PROGRESSION_UNLOCK_THRESHOLD;
        if (!justCrossed) continue;

        const current = await prisma.exercise.findUnique({ where: { id: entry.exerciseId } });
        const next = await prisma.exercise.findFirst({
            where: { family: current.family, progressionOrder: current.progressionOrder + 1 },
        });

        if (next) {
            unlocks.push({ from: current.name, to: next.name, atReps: entry.reps });
        }
    }

    return unlocks;
}

// Rolls each entry's XP into the RPG stats based on that exercise's
// stat weights, plus a flat discipline gain for showing up (bonus if
// the streak actually continued, rewarding consistency specifically).
async function updateCharacterStats(profileId, perEntry, streakContinued) {
    const exercises = await prisma.exercise.findMany({
        where: { id: { in: perEntry.map(e => e.exerciseId) } },
    });
    const exerciseById = Object.fromEntries(exercises.map(e => [e.id, e]));

    let strengthGain = 0, enduranceGain = 0, vitalityGain = 0, agilityGain = 0;

    for (const entry of perEntry) {
        const ex = exerciseById[entry.exerciseId];
        const effort = entry.xpEarned > 0 ? entry.xpEarned : entry.reps; // fall back to reps on baseline-setting sessions
        strengthGain += ex.strengthWeight * effort * 0.1;
        enduranceGain += ex.enduranceWeight * effort * 0.1;
        vitalityGain += ex.vitalityWeight * effort * 0.1;
        agilityGain += ex.agilityWeight * effort * 0.1;
    }

    const disciplineGain = 2 + (streakContinued ? 3 : 0);

    const existing = await prisma.characterStats.findUnique({ where: { profileId } });

    if (!existing) {
        return prisma.characterStats.create({
            data: {
                profileId,
                strength: strengthGain,
                endurance: enduranceGain,
                vitality: vitalityGain,
                agility: agilityGain,
                discipline: disciplineGain,
            },
        });
    }

    return prisma.characterStats.update({
        where: { profileId },
        data: {
            strength: existing.strength + strengthGain,
            endurance: existing.endurance + enduranceGain,
            vitality: existing.vitality + vitalityGain,
            agility: existing.agility + agilityGain,
            discipline: existing.discipline + disciplineGain,
        },
    });
}

// Rank now depends on overall progression, not just XP: each tier needs
// XP *and* a minimum lifetime workout count *and* a minimum lifetime rep
// count, all met together — matching the "requirements checklist" idea
// rather than a single number going up.
const RANK_REQUIREMENTS = [
    { rank: 'S', minXp: 2000, minWorkouts: 40, minReps: 4000 },
    { rank: 'A', minXp: 1000, minWorkouts: 25, minReps: 2000 },
    { rank: 'B', minXp: 500, minWorkouts: 15, minReps: 1000 },
    { rank: 'C', minXp: 200, minWorkouts: 8, minReps: 400 },
    { rank: 'D', minXp: 50, minWorkouts: 3, minReps: 100 },
    { rank: 'E', minXp: 0, minWorkouts: 0, minReps: 0 },
];

async function computeRank(profileId, cumulativeXp) {
    const totalWorkouts = await prisma.workoutLog.count({ where: { profileId } });
    const repsAgg = await prisma.workoutSetEntry.aggregate({
        _sum: { reps: true },
        where: { workoutLog: { profileId } },
    });
    const totalReps = repsAgg._sum.reps || 0;

    const tier = RANK_REQUIREMENTS.find(
        t => cumulativeXp >= t.minXp && totalWorkouts >= t.minWorkouts && totalReps >= t.minReps
    ) || RANK_REQUIREMENTS[RANK_REQUIREMENTS.length - 1];

    return { rank: tier.rank, totalWorkouts, totalReps };
}

// Builds the "requirements checklist" for the NEXT rank up, so the UI can
// show something like your brainstorm's "✓ Level 30 / ✗ 50 pull-ups".
function nextRankChecklist(currentRank, cumulativeXp, totalWorkouts, totalReps) {
    const idx = RANK_REQUIREMENTS.findIndex(t => t.rank === currentRank);
    if (idx <= 0) return null; // already S-Rank, nothing higher

    const next = RANK_REQUIREMENTS[idx - 1];
    return {
        rank: next.rank,
        requirements: [
            { label: `${next.minXp} XP`, met: cumulativeXp >= next.minXp, current: Math.round(cumulativeXp), target: next.minXp },
            { label: `${next.minWorkouts} workouts completed`, met: totalWorkouts >= next.minWorkouts, current: totalWorkouts, target: next.minWorkouts },
            { label: `${next.minReps} total reps completed`, met: totalReps >= next.minReps, current: totalReps, target: next.minReps },
        ],
    };
}

function daysBetween(d1, d2) {
    const oneDay = 24 * 60 * 60 * 1000;
    return Math.round((new Date(d2).setHours(0, 0, 0, 0) - new Date(d1).setHours(0, 0, 0, 0)) / oneDay);
}

// Returns { rankState, streakContinued, rankedUp, previousRank } —
// streakContinued is only true when yesterday's workout is what pushed the
// streak forward (used for the discipline-stat consistency bonus).
async function updateRankState(profileId, xpEarned) {
    let rankState = await prisma.rankState.findUnique({ where: { profileId } });
    const today = new Date();

    if (!rankState) {
        const { rank, totalWorkouts, totalReps } = await computeRank(profileId, xpEarned);
        rankState = await prisma.rankState.create({
            data: {
                profileId,
                cumulativeXp: xpEarned,
                currentRank: rank,
                currentStreakDays: 1,
                longestStreakDays: 1,
                lastWorkoutDate: today,
            },
        });
        return { rankState, streakContinued: false, rankedUp: false, previousRank: null, totalWorkouts, totalReps };
    }

    const gap = daysBetween(rankState.lastWorkoutDate, today);
    let newStreak = rankState.currentStreakDays;
    let graceUsed = rankState.graceUsed;

    if (gap === 1) {
        newStreak += 1;
        graceUsed = false;
    } else if (gap === 2 && !rankState.graceUsed) {
        newStreak += 1;
        graceUsed = true;
    } else if (gap > 1) {
        newStreak = 1;
        graceUsed = false;
    }
    // gap === 0 (same day) falls through, streak unchanged

    const newXp = rankState.cumulativeXp + xpEarned;
    const previousRank = rankState.currentRank;
    const { rank: newRank, totalWorkouts, totalReps } = await computeRank(profileId, newXp);

    const updated = await prisma.rankState.update({
        where: { profileId },
        data: {
            cumulativeXp: newXp,
            currentRank: newRank,
            currentStreakDays: newStreak,
            longestStreakDays: Math.max(rankState.longestStreakDays, newStreak),
            graceUsed,
            lastWorkoutDate: today,
        },
    });

    return { rankState: updated, streakContinued: gap === 1, rankedUp: newRank !== previousRank, previousRank, totalWorkouts, totalReps };
}

function getPeriodKeys(date = new Date()) {
    const dailyKey = date.toISOString().slice(0, 10); // YYYY-MM-DD

    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNum = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    const weeklyKey = `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;

    return { dailyKey, weeklyKey };
}

// The pool of possible quests. Each period (day/week), one quest per slot
// is deterministically picked from its pool based on profileId+periodKey,
// so every user sees a different, rotating mix of "random things to do"
// instead of always the same fixed quest.
const DAILY_QUEST_POOL = [
    {
        key: 'daily_total_reps', title: 'The Daily Trial', description: 'Complete 50 total reps today.',
        kind: 'total_reps', target: 50, xpReward: 150,
    },
    {
        key: 'daily_run', title: "Runner's Path", description: 'Run 3 km today.',
        kind: 'exercise_amount', exerciseFamily: 'running', target: 3, xpReward: 130, statKey: 'agility', statAmount: 10,
    },
    {
        key: 'daily_pushups', title: 'Push Through It', description: 'Do 30 push-ups today (any variation).',
        kind: 'exercise_amount', exerciseFamily: 'pushup', target: 30, xpReward: 120, statKey: 'strength', statAmount: 10,
    },
    {
        key: 'daily_compound', title: "Hunter's Circuit", description: 'Do 20 push-ups, 20 squats, and 20 sit-ups today.',
        kind: 'compound', xpReward: 200,
        parts: [
            { family: 'pushup', label: 'push-ups', target: 20 },
            { family: 'squat', label: 'squats', target: 20 },
            { family: 'situp', label: 'sit-ups', target: 20 },
        ],
    },
    {
        key: 'daily_show_up', title: 'Just Show Up', description: 'Log any workout today.',
        kind: 'workout_logged', target: 1, xpReward: 50, statKey: 'discipline', statAmount: 5,
    },
    {
        key: 'daily_report_effort', title: 'Know Your Limits', description: 'Log a workout with an effort (RPE) rating today.',
        kind: 'rpe_report', target: 1, xpReward: 75, statKey: 'discipline', statAmount: 8,
    },
];

const WEEKLY_QUEST_POOL = [
    {
        key: 'weekly_workouts', title: "Hunter's Discipline", description: 'Complete 4 workouts this week.',
        kind: 'workout_count', target: 4, xpReward: 500, statKey: 'discipline', statAmount: 15,
    },
    {
        key: 'weekly_volume', title: 'Volume Crusher', description: 'Complete 300 total reps this week.',
        kind: 'total_reps', target: 300, xpReward: 400, statKey: 'strength', statAmount: 15,
    },
    {
        key: 'weekly_distance', title: 'Long Haul', description: 'Run 10 km total this week.',
        kind: 'exercise_amount', exerciseFamily: 'running', target: 10, xpReward: 380, statKey: 'agility', statAmount: 18,
    },
    {
        key: 'weekly_records', title: 'Chasing Greatness', description: 'Set 2 new personal records this week.',
        kind: 'new_record', target: 2, xpReward: 450,
    },
];

// Deterministic pseudo-random pick: same user + same period always gets the
// same quest (so it doesn't change on every page reload), but different
// users/periods land on different quests from the pool.
function pickQuest(pool, seed) {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
    return pool[hash % pool.length];
}

// Upserts progress on the current daily/weekly quest instances (a new row
// is created per period automatically, so there's no reset job needed).
// Returns any quests that were JUST completed by this session, plus the
// bonus XP (and any stat rewards) they award on top of normal workout XP.
async function updateQuests(profileId, session) {
    const { dailyKey, weeklyKey } = getPeriodKeys();
    const completedQuests = [];
    let questXpBonus = 0;
    const statBonuses = {}; // statKey -> amount, applied by the caller

    const slots = [
        { slot: 'daily', periodKey: dailyKey, pool: DAILY_QUEST_POOL },
        { slot: 'weekly', periodKey: weeklyKey, pool: WEEKLY_QUEST_POOL },
    ];

    for (const { slot, periodKey, pool } of slots) {
        const def = pickQuest(pool, `${profileId}-${periodKey}-${slot}`);
        const isCompound = def.kind === 'compound';
        const target = isCompound ? def.parts.length : def.target;

        let progress = await prisma.questProgress.findUnique({
            where: { profileId_slot_periodKey: { profileId, slot, periodKey } },
        });

        if (!progress) {
            progress = await prisma.questProgress.create({
                data: {
                    profileId, slot, periodKey,
                    questType: def.key,
                    currentAmount: 0,
                    targetAmount: target,
                    xpReward: def.xpReward,
                    statKey: def.statKey ?? null,
                    statAmount: def.statAmount ?? null,
                    requirementsJson: isCompound ? JSON.stringify(def.parts) : null,
                    progressJson: isCompound ? JSON.stringify(def.parts.map(p => ({ family: p.family, current: 0 }))) : null,
                },
            });
        }

        if (progress.completed) continue;

        let newAmount = progress.currentAmount;
        let newProgressJson = progress.progressJson;

        if (isCompound) {
            const parts = progress.progressJson ? JSON.parse(progress.progressJson) : def.parts.map(p => ({ family: p.family, current: 0 }));
            for (const part of parts) {
                part.current += session.repsByFamily[part.family] || 0;
            }
            newAmount = parts.filter((p, i) => p.current >= def.parts[i].target).length;
            newProgressJson = JSON.stringify(parts);
        } else if (def.kind === 'total_reps') {
            newAmount += session.totalReps;
        } else if (def.kind === 'exercise_amount') {
            newAmount += session.repsByFamily[def.exerciseFamily] || 0;
        } else if (def.kind === 'workout_logged' || def.kind === 'workout_count') {
            newAmount += 1;
        } else if (def.kind === 'rpe_report') {
            newAmount += session.hasRpe ? 1 : 0;
        } else if (def.kind === 'new_record') {
            newAmount += session.newRecordsCount;
        }

        const justCompleted = newAmount >= progress.targetAmount;

        await prisma.questProgress.update({
            where: { id: progress.id },
            data: {
                currentAmount: newAmount,
                progressJson: newProgressJson,
                completed: justCompleted,
                completedAt: justCompleted ? new Date() : null,
            },
        });

        if (justCompleted) {
            questXpBonus += def.xpReward;
            completedQuests.push({ questType: def.key, title: def.title, xpReward: def.xpReward });
            if (def.statKey) statBonuses[def.statKey] = (statBonuses[def.statKey] || 0) + def.statAmount;
        }
    }

    return { questXpBonus, completedQuests, statBonuses };
}

// Awards a badge by its stable key if the profile doesn't already have it.
// Returns the badge (for a celebration banner) or null if already earned.
async function awardBadge(profileId, key) {
    const badge = await prisma.badge.findUnique({ where: { key } });
    if (!badge) return null;

    const existing = await prisma.profileBadge.findUnique({
        where: { profileId_badgeId: { profileId, badgeId: badge.id } },
    });
    if (existing) return null;

    await prisma.profileBadge.create({ data: { profileId, badgeId: badge.id } });
    return badge;
}

async function logWorkout(profileId, entries, { rpe, notes, rawInputText } = {}) {
    const isFirstWorkoutEver = (await prisma.workoutLog.count({ where: { profileId } })) === 0;
    const hadAnyRecordBefore = (await prisma.personalRecord.count({ where: { profileId } })) > 0;

    const workoutLog = await prisma.workoutLog.create({
        data: {
            profileId,
            rpe,
            notes,
            rawInputText,
            setEntries: {
                create: entries.map(e => ({ exerciseId: e.exerciseId, reps: e.reps, weightLbs: e.weightLbs ?? null })),
            },
        },
        include: { setEntries: true },
    });

    const { totalXp, perEntry } = await calculateXpEarned(profileId, entries);
    const { newRecords, previousBests } = await updatePersonalRecords(profileId, entries);
    const progressionUnlocks = await checkProgressionUnlocks(entries, previousBests);

    const totalRepsThisSession = entries.reduce((sum, e) => sum + e.reps, 0);
    const sessionExercises = await prisma.exercise.findMany({ where: { id: { in: entries.map(e => e.exerciseId) } } });
    const familyByExerciseId = Object.fromEntries(sessionExercises.map(e => [e.id, e.family]));
    const repsByFamily = {};
    for (const e of entries) {
        const family = familyByExerciseId[e.exerciseId];
        repsByFamily[family] = (repsByFamily[family] || 0) + e.reps;
    }
    const { questXpBonus, completedQuests, statBonuses } = await updateQuests(profileId, {
        totalReps: totalRepsThisSession,
        repsByFamily,
        hasRpe: rpe != null,
        newRecordsCount: newRecords.length,
    });

    const { rankState, streakContinued, rankedUp, totalWorkouts, totalReps } = await updateRankState(profileId, totalXp + questXpBonus);
    let characterStats = await updateCharacterStats(profileId, perEntry, streakContinued);
    if (Object.keys(statBonuses).length > 0) {
        characterStats = await prisma.characterStats.update({
            where: { profileId },
            data: Object.fromEntries(Object.entries(statBonuses).map(([stat, amt]) => [stat, characterStats[stat] + amt])),
        });
    }
    const checklist = nextRankChecklist(rankState.currentRank, rankState.cumulativeXp, totalWorkouts, totalReps);

    const newBadges = [];
    if (isFirstWorkoutEver) {
        const b = await awardBadge(profileId, 'first_workout');
        if (b) newBadges.push(b);
    }
    if (newRecords.length > 0 && !hadAnyRecordBefore) {
        const b = await awardBadge(profileId, 'first_record');
        if (b) newBadges.push(b);
    }
    if (completedQuests.length > 0) {
        const b = await awardBadge(profileId, 'first_quest');
        if (b) newBadges.push(b);
    }
    if (rankedUp) {
        const b = await awardBadge(profileId, `rank_${rankState.currentRank.toLowerCase()}`);
        if (b) newBadges.push(b);
    }

    return {
        workoutLog,
        xpEarned: totalXp,
        questXpBonus,
        perEntry,
        newRecords,
        progressionUnlocks,
        completedQuests,
        newBadges,
        rankedUp,
        nextRankChecklist: checklist,
        rankState,
        characterStats,
    };
}

app.post('/workouts', requireAuth, async (req, res) => {
    const { entries, rpe, notes, rawInputText } = req.body;
    const result = await logWorkout(req.profileId, entries, { rpe, notes, rawInputText });
    res.json({ ...result.workoutLog, ...result });
});

app.get('/records', requireAuth, async (req, res) => {
    const records = await prisma.personalRecord.findMany({
        where: { profileId: req.profileId },
        include: { exercise: true },
    });
    res.json(records);
});

app.get('/stats', requireAuth, async (req, res) => {
    const stats = await prisma.characterStats.findUnique({ where: { profileId: req.profileId } });
    res.json(stats);
});

// Builds the response shape for one slot: which quest was picked this
// period, live progress on it, and (for compound quests) the per-part
// breakdown so the UI can show "12/20 push-ups, 20/20 squats, ...".
async function buildQuestView(profileId, slot, periodKey, pool) {
    const def = pickQuest(pool, `${profileId}-${periodKey}-${slot}`);
    const isCompound = def.kind === 'compound';
    const target = isCompound ? def.parts.length : def.target;

    const progress = await prisma.questProgress.findUnique({
        where: { profileId_slot_periodKey: { profileId, slot, periodKey } },
    });

    const parts = isCompound
        ? (progress?.progressJson ? JSON.parse(progress.progressJson) : def.parts.map(p => ({ family: p.family, current: 0 })))
              .map((p, i) => ({ label: def.parts[i].label, current: p.current, target: def.parts[i].target }))
        : null;

    return {
        key: def.key,
        title: def.title,
        description: def.description,
        xpReward: def.xpReward,
        statKey: def.statKey ?? null,
        statAmount: def.statAmount ?? null,
        currentAmount: progress?.currentAmount ?? 0,
        targetAmount: target,
        completed: progress?.completed ?? false,
        parts,
    };
}

app.get('/quests', requireAuth, async (req, res) => {
    const { dailyKey, weeklyKey } = getPeriodKeys();
    const profileId = req.profileId;

    const [daily, weekly] = await Promise.all([
        buildQuestView(profileId, 'daily', dailyKey, DAILY_QUEST_POOL),
        buildQuestView(profileId, 'weekly', weeklyKey, WEEKLY_QUEST_POOL),
    ]);

    res.json({
        daily,
        weekly,
        pool: {
            daily: DAILY_QUEST_POOL.map(({ key, title, description, xpReward, statKey, statAmount }) => ({ key, title, description, xpReward, statKey: statKey ?? null, statAmount: statAmount ?? null })),
            weekly: WEEKLY_QUEST_POOL.map(({ key, title, description, xpReward, statKey, statAmount }) => ({ key, title, description, xpReward, statKey: statKey ?? null, statAmount: statAmount ?? null })),
        },
    });
});

app.get('/badges', requireAuth, async (req, res) => {
    const earned = await prisma.profileBadge.findMany({
        where: { profileId: req.profileId },
        include: { badge: true },
        orderBy: { earnedAt: 'asc' },
    });
    const allBadges = await prisma.badge.findMany();
    const earnedKeys = new Set(earned.map(e => e.badge.key));

    res.json({
        earned: earned.map(e => ({ ...e.badge, earnedAt: e.earnedAt })),
        locked: allBadges.filter(b => !earnedKeys.has(b.key)),
    });
});

app.get('/rank-checklist', requireAuth, async (req, res) => {
    const rankState = await prisma.rankState.findUnique({ where: { profileId: req.profileId } });
    if (!rankState) return res.json(null);

    const { totalWorkouts, totalReps } = await computeRank(req.profileId, rankState.cumulativeXp);
    res.json(nextRankChecklist(rankState.currentRank, rankState.cumulativeXp, totalWorkouts, totalReps));
});

app.post('/chat', chatLimiter, requireAuth, async (req, res) => {
    const profileId = req.profileId;
    const { message } = req.body;

    try {
        const exercises = await prisma.exercise.findMany({ orderBy: [{ family: 'asc' }, { progressionOrder: 'asc' }] });

        // Group by family so the model can see the full difficulty ladder per
        // exercise and pick the right variant instead of always defaulting
        // to the plainest name.
        const families = {};
        for (const ex of exercises) {
            (families[ex.family] ??= []).push(ex.name);
        }
        const exerciseListing = Object.values(families).map(names => names.join(' < ')).join('\n');

        // Step 1: extract structured workout data from free-text using JSON mode
        const extraction = await groq.chat.completions.create({
            model: 'openai/gpt-oss-120b',
            response_format: { type: 'json_object' },
            messages: [
                {
                    role: 'system',
                    content: `You extract workout data from a user's message. Below are the valid exercises, grouped by movement family and ordered easiest-to-hardest (each line is one progression ladder). Match the user's wording to the single closest exercise name. If the user doesn't specify a difficulty variant (e.g. just says "pushups"), pick the plain/standard-sounding one in that family, not the easiest or hardest.\n\n${exerciseListing}\n\nSome exercises (Curls, Hammer Curls, Tricep Extensions) are typically done with dumbbells — if the user mentions a weight (e.g. "20 lb curls", "curls with the 15s"), include it in pounds as "weightLbs". Leave weightLbs null if no weight was mentioned or the exercise is bodyweight-only.\n\nRespond ONLY with JSON in this exact shape: {"entries": [{"exerciseName": string, "reps": number, "weightLbs": number|null}], "rpe": number|null}. "rpe" is a 1-10 difficulty rating only if the user mentioned how hard it felt, otherwise null.`,
                },
                { role: 'user', content: message },
            ],
        });

        const parsed = JSON.parse(extraction.choices[0].message.content);

        const entries = parsed.entries
            .map(e => {
                const match = exercises.find(ex => ex.name.toLowerCase() === e.exerciseName.toLowerCase());
                return match ? { exerciseId: match.id, reps: e.reps, weightLbs: e.weightLbs ?? null } : null;
            })
            .filter(Boolean);

        if (entries.length === 0) {
            return res.status(400).json({ reply: "I couldn't match that to any of your tracked exercises — try naming them more clearly." });
        }

        // Step 2: actually log it using the same logic as /workouts
        const { workoutLog, xpEarned, questXpBonus, newRecords, progressionUnlocks, completedQuests, newBadges, nextRankChecklist: checklist, rankState, characterStats } = await logWorkout(profileId, entries, {
            rpe: parsed.rpe,
            rawInputText: message,
        });

        // Step 3: generate a short coaching reply based on the real result
        const namedEntries = entries.map(e => {
            const ex = exercises.find(ex => ex.id === e.exerciseId);
            return { exercise: ex.name, amount: e.reps, unit: ex.unit, weightLbs: e.weightLbs };
        });
        const namedRecords = newRecords.map(r => ({
            exercise: exercises.find(ex => ex.id === r.exerciseId).name,
            previousBest: r.previousBest,
            newBest: r.newBest,
        }));

        const coaching = await groq.chat.completions.create({
            model: 'openai/gpt-oss-120b',
            messages: [
                {
                    role: 'system',
                    content: 'You are an encouraging but concise fitness coach in a leveling-up RPG fitness app. In 1-3 sentences, react to the workout just logged and suggest a specific target for next time. Each logged exercise has a "unit" field (reps, km, or seconds) — phrase your reply using that exact unit (e.g. "run 6 km" not "run 6 reps", "hold for 100 seconds" not "100 reps"). If "weightLbs" is set on an exercise, mention the weight used (e.g. "12 curls at 20 lbs") and suggest whether to add reps or add weight next time. If a personal record was broken, celebrate that specifically. If a progression unlock happened, tell them specifically to try the new harder variant next. If a quest was completed, mention it by name. No fluff, no emojis, be specific with numbers.',
                },
                {
                    role: 'user',
                    content: `Just logged: ${JSON.stringify(namedEntries)}. XP earned this session: ${xpEarned}${questXpBonus ? ` (+${questXpBonus} quest bonus)` : ''}. Current rank: ${rankState.currentRank}. Current streak: ${rankState.currentStreakDays} days. RPE reported: ${parsed.rpe ?? 'not given'}. New personal records this session: ${namedRecords.length ? JSON.stringify(namedRecords) : 'none'}. Progression unlocks this session: ${progressionUnlocks.length ? JSON.stringify(progressionUnlocks) : 'none'}. Quests completed this session: ${completedQuests.length ? JSON.stringify(completedQuests) : 'none'}.`,
                },
            ],
        });

        res.json({
            reply: coaching.choices[0].message.content,
            xpEarned,
            questXpBonus,
            rankState,
            characterStats,
            newRecords: namedRecords,
            progressionUnlocks,
            completedQuests,
            newBadges,
            nextRankChecklist: checklist,
            workoutLog,
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ reply: 'Something went wrong processing that — try again.' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});