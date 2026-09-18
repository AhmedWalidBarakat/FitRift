import { useState } from 'react';
import { supabase } from './supabaseClient';

// Shown to guests (anonymous Supabase sessions). Linking email/password to an
// anonymous user keeps the same user id, so all their FitRift progress
// (workouts, XP, rank, quests) carries over instead of being lost.
export default function UpgradeAccount({ onDone }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ email, password });
      if (error) throw error;
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <div className="upgrade-banner">
        <span>🕐 You're playing as a guest. Your progress will be lost if you clear your browser.</span>
        <button className="upgrade-banner-btn" onClick={() => setOpen(true)}>Save progress</button>
      </div>
    );
  }

  return (
    <div className="auth-wrap upgrade-wrap">
      <form className="auth-card" onSubmit={handleSubmit}>
        <h2>Save Your Progress</h2>
        <p className="landing-note">Add an email and password, your XP, rank, and history stay exactly as they are.</p>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="Password (min 6 characters)"
          value={password}
          onChange={e => setPassword(e.target.value)}
          minLength={6}
          required
        />
        {error && <div className="auth-error">{error}</div>}
        <button type="submit" disabled={loading}>{loading ? 'Please wait…' : 'Save Progress'}</button>
        <button type="button" className="auth-switch" onClick={() => setOpen(false)}>Not now</button>
      </form>
    </div>
  );
}
