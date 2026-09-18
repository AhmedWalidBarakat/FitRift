import { useState } from 'react';
import { supabase } from '../supabaseClient';

export default function Landing({ onShowAuth }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function tryItFree() {
    setError('');
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInAnonymously();
      if (error) throw error;
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="landing">
      <h2 className="landing-title">Turn your workouts into a fitness journey from E to S-Rank.</h2>
      <p className="landing-subtitle">
        Describe what you trained in plain English. FitRift tracks XP, personal records, and RPG stats
        against your own baseline, no comparisons to anyone else.
      </p>

      <div className="landing-actions">
        <button className="landing-btn primary" onClick={tryItFree} disabled={loading}>
          {loading ? 'Loading…' : 'Guest Mode'}
        </button>
        <button className="landing-btn ghost" onClick={onShowAuth}>Sign In</button>
      </div>
      {error && <div className="auth-error">{error}</div>}

      <p className="landing-note">
        Trying it free logs you in as a guest so you can play around right away, no signup needed.
      </p>
    </div>
  );
}
