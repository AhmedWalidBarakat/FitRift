import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { authedFetch } from '../config';

const STAT_ICONS = { strength: '💪', endurance: '❤️', vitality: '🛡️', agility: '⚡', discipline: '🧠' };

function QuestCard({ slot, quest }) {
  const pct = Math.min(100, (quest.currentAmount / quest.targetAmount) * 100);

  return (
    <motion.div
      className={`quest-page-card ${quest.completed ? 'completed' : ''}`}
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="quest-page-header">
        <span className="quest-page-tag">{slot === 'daily' ? '📜 TODAY' : '🗓️ THIS WEEK'}</span>
        {quest.completed && <span className="quest-page-done">Completed!</span>}
      </div>
      <div className="quest-page-title">{quest.title}</div>
      <div className="quest-page-desc">{quest.description}</div>

      {quest.parts ? (
        <div className="quest-parts">
          {quest.parts.map((p, i) => (
            <div key={i} className={`quest-part ${p.current >= p.target ? 'met' : ''}`}>
              <span>{p.current >= p.target ? '✓' : '☐'} {p.label}</span>
              <span>{p.current}/{p.target}</span>
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className="quest-track page">
            <div className="quest-fill" style={{ width: `${pct}%` }} />
          </div>
          <div className="quest-page-amount">{quest.completed ? 'Complete' : `${quest.currentAmount}/${quest.targetAmount}`}</div>
        </>
      )}

      <div className="quest-page-rewards">
        <span className="reward-chip">+{quest.xpReward} XP</span>
        {quest.statKey && (
          <span className="reward-chip stat">+{quest.statAmount} {STAT_ICONS[quest.statKey]} {quest.statKey[0].toUpperCase() + quest.statKey.slice(1)}</span>
        )}
      </div>
    </motion.div>
  );
}

function PoolList({ title, pool, activeKey }) {
  return (
    <div className="quest-pool-section">
      <h3 className="standalone-title">{title}</h3>
      <div className="quest-pool-grid">
        {pool.map(q => (
          <div key={q.key} className={`quest-pool-card ${q.key === activeKey ? 'active' : ''}`}>
            <div className="quest-pool-name">
              {q.key === activeKey && <span className="quest-pool-badge">ACTIVE</span>}
              {q.title}
            </div>
            <div className="quest-pool-desc">{q.description}</div>
            <div className="quest-page-rewards">
              <span className="reward-chip">+{q.xpReward} XP</span>
              {q.statKey && (
                <span className="reward-chip stat">+{q.statAmount} {STAT_ICONS[q.statKey]} {q.statKey[0].toUpperCase() + q.statKey.slice(1)}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Quests() {
  const [quests, setQuests] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authedFetch('/quests')
      .then(r => r.json())
      .then(data => {
        setQuests(data);
        setLoading(false);
      });
  }, []);

  if (loading) return <div className="page-loading">Rolling for today's quests…</div>;

  return (
    <div className="quests-page">
      <h2 className="ascension-title">📜 Quest Board</h2>
      <p className="ascension-subtitle">A new pair of quests rolls in every day and every week — random goals that build specific stats.</p>

      <div className="quest-page-grid">
        <QuestCard slot="daily" quest={quests.daily} />
        <QuestCard slot="weekly" quest={quests.weekly} />
      </div>

      <PoolList title="Possible Daily Quests" pool={quests.pool.daily} activeKey={quests.daily.key} />
      <PoolList title="Possible Weekly Quests" pool={quests.pool.weekly} activeKey={quests.weekly.key} />
    </div>
  );
}
