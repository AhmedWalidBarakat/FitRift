import { useState, useEffect } from 'react';
import { authedFetch } from '../config';

function formatDate(iso) {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

export default function History() {
  const [logs, setLogs] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authedFetch('/history')
      .then(r => r.json())
      .then(data => {
        setLogs(data);
        setLoading(false);
      });
  }, []);

  if (loading) return <div className="page-loading">Digging up old logs…</div>;

  return (
    <div className="history-page">
      <h2 className="ascension-title">📖 Previous Chats</h2>
      <p className="ascension-subtitle">Everything you've told FitRift so far, most recent first.</p>

      {logs.length === 0 && (
        <p className="ascension-subtitle">No workouts logged yet, go tell it what you trained.</p>
      )}

      <div className="history-list">
        {logs.map(log => (
          <div className="history-card" key={log.id}>
            <div className="history-card-header">
              <span className="history-date">{formatDate(log.timestamp)}</span>
              {log.rpe != null && <span className="history-rpe">RPE {log.rpe}</span>}
            </div>
            {log.rawInputText && <p className="history-quote">"{log.rawInputText}"</p>}
            <div className="history-entries">
              {log.setEntries.map(e => (
                <span className="history-entry" key={e.id}>
                  {e.exercise.name}: {e.reps} {e.exercise.unit}{e.weightLbs ? ` @ ${e.weightLbs}lb` : ''}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
