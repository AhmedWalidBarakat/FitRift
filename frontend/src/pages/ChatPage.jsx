import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import { authedFetch } from '../config';

const SpeechRecognitionApi = window.SpeechRecognition || window.webkitSpeechRecognition;

// Overall progress toward the next rank is the average of how close each
// of its 3 requirements is (capped at 100% each), since rank is gated by
// ALL of them together, not just XP.
function checklistProgress(checklist) {
  if (!checklist) return 0;
  const ratios = checklist.requirements.map(r => Math.min(1, r.current / r.target));
  return ratios.reduce((a, b) => a + b, 0) / ratios.length;
}

export default function ChatPage() {
  const [messages, setMessages] = useState([
    { role: 'assistant', text: "Tell me what you trained today — e.g. \"20 pushups 10 situps 10 squats, felt tough\"." },
  ]);
  const [input, setInput] = useState('');
  const [rankState, setRankState] = useState(null);
  const [checklist, setChecklist] = useState(null);
  const [quests, setQuests] = useState(null);
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const prevRank = useRef(null);
  const scrollRef = useRef(null);
  const recognitionRef = useRef(null);

  function refreshSecondaryData() {
    authedFetch('/quests').then(r => r.json()).then(setQuests);
    authedFetch('/rank-checklist').then(r => r.json()).then(setChecklist);
  }

  useEffect(() => {
    authedFetch('/rankstate')
      .then(r => r.json())
      .then(data => {
        if (data) {
          setRankState(data);
          prevRank.current = data.currentRank;
        }
      });

    refreshSecondaryData();
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  async function sendMessage(overrideText) {
    const text = (overrideText ?? input).trim();
    if (!text || loading) return;

    setMessages(m => [...m, { role: 'user', text }]);
    setInput('');
    setLoading(true);

    try {
      const res = await authedFetch('/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      });
      const data = await res.json();

      setMessages(m => [
        ...m,
        {
          role: 'assistant',
          text: data.reply,
          xpEarned: data.xpEarned,
          questXpBonus: data.questXpBonus,
          newRecords: data.newRecords,
          progressionUnlocks: data.progressionUnlocks,
          completedQuests: data.completedQuests,
          newBadges: data.newBadges,
        },
      ]);

      if (data.nextRankChecklist !== undefined) setChecklist(data.nextRankChecklist);
      refreshSecondaryData();

      if (data.rankState) {
        const rankedUp = prevRank.current && data.rankState.currentRank !== prevRank.current;
        setRankState(data.rankState);
        prevRank.current = data.rankState.currentRank;

        if (rankedUp) {
          confetti({ particleCount: 150, spread: 90, origin: { y: 0.4 } });
        } else if (data.newBadges?.length > 0) {
          confetti({ particleCount: 120, spread: 100, origin: { y: 0.4 }, colors: ['#facc15', '#a78bfa'] });
        } else if (data.completedQuests?.length > 0) {
          confetti({ particleCount: 90, spread: 75, origin: { y: 0.5 }, colors: ['#4ade80', '#22c55e'] });
        } else if (data.progressionUnlocks?.length > 0) {
          confetti({ particleCount: 100, spread: 80, origin: { y: 0.5 }, colors: ['#60ecff', '#d4af37'] });
        } else if (data.newRecords?.length > 0) {
          confetti({ particleCount: 80, spread: 70, origin: { y: 0.5 }, colors: ['#facc15', '#d4af37'] });
        } else if (data.xpEarned > 0) {
          confetti({ particleCount: 30, spread: 50, origin: { y: 0.6 }, scalar: 0.7 });
        }
      }
    } catch (err) {
      setMessages(m => [...m, { role: 'assistant', text: 'Something went wrong reaching the server.' }]);
    } finally {
      setLoading(false);
    }
  }

  function toggleVoice() {
    if (!SpeechRecognitionApi) {
      alert('Voice input is not supported in this browser — try Chrome or Edge.');
      return;
    }

    if (listening) {
      recognitionRef.current?.stop();
      return;
    }

    const recognition = new SpeechRecognitionApi();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => setListening(true);
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      sendMessage(transcript);
    };

    recognitionRef.current = recognition;
    recognition.start();
  }

  const progress = checklistProgress(checklist);

  return (
    <>
      <AnimatePresence mode="wait">
        {rankState && (
          <motion.div
            key={rankState.currentRank}
            className={`rank-card rank-${rankState.currentRank.toLowerCase()} compact`}
            initial={{ opacity: 0, scale: 0.9, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 200, damping: 18 }}
          >
            <Link to="/rank" className="rank-card-link">
              <div className="rank-name">{rankState.currentRank}-RANK</div>
              <div className="rank-stats">
                <span>🔥 {rankState.currentStreakDays} day streak</span>
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
              {checklist && <div className="progress-label">Progress to {checklist.rank}-Rank · full stats on the Rank page →</div>}
            </Link>

            {quests && (
              <div className="quest-box">
                <div className="quest-row">
                  <span className="quest-name">📜 {quests.daily.title}</span>
                  <span className="quest-amount">{quests.daily.completed ? 'Completed!' : `${quests.daily.currentAmount}/${quests.daily.targetAmount}`}</span>
                </div>
                <div className="quest-desc">{quests.daily.description} (+{quests.daily.xpReward} XP)</div>
                <div className="quest-track">
                  <div className="quest-fill" style={{ width: `${Math.min(100, (quests.daily.currentAmount / quests.daily.targetAmount) * 100)}%` }} />
                </div>
                <div className="quest-row">
                  <span className="quest-name">🗓️ {quests.weekly.title}</span>
                  <span className="quest-amount">{quests.weekly.completed ? 'Completed!' : `${quests.weekly.currentAmount}/${quests.weekly.targetAmount}`}</span>
                </div>
                <div className="quest-desc">{quests.weekly.description} (+{quests.weekly.xpReward} XP)</div>
                <div className="quest-track">
                  <div className="quest-fill weekly" style={{ width: `${Math.min(100, (quests.weekly.currentAmount / quests.weekly.targetAmount) * 100)}%` }} />
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="chat-window" ref={scrollRef}>
        <AnimatePresence initial={false}>
          {messages.map((m, i) => (
            <motion.div
              key={i}
              className={`bubble ${m.role}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
            >
              {m.newBadges?.length > 0 && (
                <div className="badge-banner">
                  🏅 BADGE EARNED — {m.newBadges.map(b => `${b.icon} ${b.name}`).join(', ')}
                </div>
              )}
              {m.completedQuests?.length > 0 && (
                <div className="quest-banner">
                  📜 QUEST COMPLETE — {m.completedQuests.map(q => `${q.title} (+${q.xpReward} XP)`).join(', ')}
                </div>
              )}
              {m.progressionUnlocks?.length > 0 && (
                <div className="unlock-banner">
                  🔓 SYSTEM: {m.progressionUnlocks.map(u => `${u.to} unlocked`).join(', ')}
                </div>
              )}
              {m.newRecords?.length > 0 && (
                <div className="record-banner">
                  ⚔️ NEW RECORD — {m.newRecords.map(r => `${r.exercise} ${r.previousBest} → ${r.newBest}`).join(', ')}
                </div>
              )}
              <span className="assistant-text">{m.text}</span>
              {m.xpEarned > 0 && <div className="xp-tag">+{Math.round(m.xpEarned)} XP{m.questXpBonus ? ` (+${m.questXpBonus} quest)` : ''}</div>}
            </motion.div>
          ))}
        </AnimatePresence>
        {loading && <div className="bubble assistant typing">Thinking…</div>}
      </div>

      <div className="input-row">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && sendMessage()}
          placeholder={listening ? 'Listening…' : 'Log today\'s workout...'}
          disabled={loading}
        />
        <button
          type="button"
          className={`mic-btn ${listening ? 'active' : ''}`}
          onClick={toggleVoice}
          title="Log by voice"
        >
          🎙️
        </button>
        <button onClick={() => sendMessage()} disabled={loading}>Send</button>
      </div>
    </>
  );
}
