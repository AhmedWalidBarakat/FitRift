import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { authedFetch } from '../config';

const STAT_ICONS = { strength: '💪', endurance: '❤️', vitality: '🛡️', agility: '⚡', discipline: '🧠' };

function checklistProgress(checklist) {
  if (!checklist) return 0;
  const ratios = checklist.requirements.map(r => Math.min(1, r.current / r.target));
  return ratios.reduce((a, b) => a + b, 0) / ratios.length;
}

export default function Rank() {
  const [rankState, setRankState] = useState(null);
  const [characterStats, setCharacterStats] = useState(null);
  const [checklist, setChecklist] = useState(null);
  const [badges, setBadges] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      authedFetch('/rankstate').then(r => r.json()),
      authedFetch('/stats').then(r => r.json()),
      authedFetch('/rank-checklist').then(r => r.json()),
      authedFetch('/badges').then(r => r.json()),
    ]).then(([rank, stats, checklistData, badgeData]) => {
      setRankState(rank);
      setCharacterStats(stats);
      setChecklist(checklistData);
      setBadges(badgeData);
      setLoading(false);
    });
  }, []);

  if (loading) return <div className="page-loading">Reading the Hunter registry…</div>;

  const progress = checklistProgress(checklist);

  return (
    <div className="rank-page">
      <h2 className="ascension-title">🏆 Hunter Rank</h2>
      <p className="ascension-subtitle">Your standing, stats, and the badges you've earned along the way.</p>

      {rankState && (
        <motion.div
          className={`rank-card rank-${rankState.currentRank.toLowerCase()}`}
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div className="rank-name">{rankState.currentRank}-RANK</div>
          <div className="rank-stats">
            <span>🔥 {rankState.currentStreakDays} day streak (longest: {rankState.longestStreakDays})</span>
            <span>{Math.round(rankState.cumulativeXp)} XP</span>
          </div>

          {checklist && (
            <div className="progress-track">
              <motion.div
                className="progress-fill"
                animate={{ width: `${progress * 100}%` }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
              />
            </div>
          )}
          {checklist && <div className="progress-label">Progress to {checklist.rank}-Rank</div>}

          {characterStats && (
            <div className="stat-grid">
              {Object.entries(STAT_ICONS).map(([key, icon]) => (
                <div className="stat" key={key}>
                  <span>{icon} {key[0].toUpperCase() + key.slice(1)}</span>
                  <span className="stat-value">{Math.round(characterStats[key])}</span>
                </div>
              ))}
            </div>
          )}

          {checklist && (
            <div className="checklist">
              <div className="checklist-title">{checklist.rank}-RANK REQUIREMENTS</div>
              {checklist.requirements.map((r, i) => (
                <div key={i} className={`checklist-item ${r.met ? 'met' : ''}`}>
                  <span>{r.met ? '✓' : '☐'}</span>
                  <span>{r.label}</span>
                  <span className="checklist-progress">{r.current}/{r.target}</span>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      )}

      {badges && (
        <>
          <h3 className="standalone-title">Earned Badges</h3>
          {badges.earned.length > 0 ? (
            <div className="badge-grid">
              {badges.earned.map(b => (
                <div className="badge-tile earned" key={b.key} title={b.description}>
                  <span className="badge-tile-icon">{b.icon}</span>
                  <span className="badge-tile-name">{b.name}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="ascension-subtitle">No badges yet — log a workout to earn your first.</p>
          )}

          {badges.locked.length > 0 && (
            <>
              <h3 className="standalone-title">Locked Badges</h3>
              <div className="badge-grid">
                {badges.locked.map(b => (
                  <div className="badge-tile locked" key={b.key} title={b.description}>
                    <span className="badge-tile-icon">🔒</span>
                    <span className="badge-tile-name">{b.name}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
