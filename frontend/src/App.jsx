import { useState, useEffect } from 'react';
import { NavLink, Routes, Route } from 'react-router-dom';
import { supabase } from './supabaseClient';
import ChatPage from './pages/ChatPage';
import AscensionPath from './pages/AscensionPath';
import Quests from './pages/Quests';
import Rank from './pages/Rank';
import History from './pages/History';
import Auth from './pages/Auth';
import Landing from './pages/Landing';
import { DumbbellIcon, MountainIcon, FlameIcon, LightningIcon } from './SceneIcons';
import WisdomScroll from './WisdomScroll';
import UpgradeAccount from './UpgradeAccount';
import './App.css';

function SceneBubbles() {
  const icons = [
    <DumbbellIcon />,
    '🏃',
    '💪',
    <MountainIcon />,
    <FlameIcon />,
    <LightningIcon />,
  ];
  return (
    <div className="scene-bubbles" aria-hidden="true">
      {icons.map((icon, i) => (
        <span key={i} className={`scene-bubble b${i + 1}`}>{icon}</span>
      ))}
    </div>
  );
}

function App() {
  const [session, setSession] = useState(undefined); // undefined = still checking
  const [showAuth, setShowAuth] = useState(false);
  const [dismissedUpgrade, setDismissedUpgrade] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  if (session === undefined) {
    return <div className="app"><div className="page-loading">Loading…</div></div>;
  }

  if (!session) {
    return (
      <>
        <SceneBubbles />
        <div className="app">
          <header className="header">
            <div className="badge">⚔️</div>
            <h1>FitRift</h1>
            {!showAuth && (
              <button className="nav-link signin-corner" onClick={() => setShowAuth(true)}>Sign In</button>
            )}
          </header>
          {showAuth ? <Auth /> : <Landing onShowAuth={() => setShowAuth(true)} />}
        </div>
      </>
    );
  }

  const isGuest = session.user.is_anonymous;

  return (
    <>
      <SceneBubbles />
      <div className="app">
        <header className="header">
          <div className="badge">⚔️</div>
          <h1>FitRift</h1>
          <nav className="nav">
            <NavLink to="/" end className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>Chat</NavLink>
            <NavLink to="/rank" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>Rank</NavLink>
            <NavLink to="/ascension" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>Ascension Path</NavLink>
            <NavLink to="/quests" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>Quests</NavLink>
            <NavLink to="/history" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>Previous Chats</NavLink>
          </nav>
          <button className="logout-btn" onClick={() => supabase.auth.signOut()}>Log out</button>
        </header>

        {isGuest && !dismissedUpgrade && (
          <UpgradeAccount onDone={() => setDismissedUpgrade(true)} />
        )}

        <Routes>
          <Route path="/" element={<ChatPage />} />
          <Route path="/rank" element={<Rank />} />
          <Route path="/ascension" element={<AscensionPath />} />
          <Route path="/quests" element={<Quests />} />
          <Route path="/history" element={<History />} />
        </Routes>
      </div>
      <WisdomScroll />
    </>
  );
}

export default App;
