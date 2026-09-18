import { useState, useEffect } from 'react';
import { NavLink, Routes, Route } from 'react-router-dom';
import { supabase } from './supabaseClient';
import ChatPage from './pages/ChatPage';
import AscensionPath from './pages/AscensionPath';
import Quests from './pages/Quests';
import Auth from './pages/Auth';
import { DumbbellIcon, MountainIcon, FlameIcon, LightningIcon } from './SceneIcons';
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
          </header>
          <Auth />
        </div>
      </>
    );
  }

  return (
    <>
      <SceneBubbles />
      <div className="app">
        <header className="header">
          <div className="badge">⚔️</div>
          <h1>FitRift</h1>
          <nav className="nav">
            <NavLink to="/" end className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>Chat</NavLink>
            <NavLink to="/ascension" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>Ascension Path</NavLink>
            <NavLink to="/quests" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>Quests</NavLink>
          </nav>
          <button className="logout-btn" onClick={() => supabase.auth.signOut()}>Log out</button>
        </header>

        <Routes>
          <Route path="/" element={<ChatPage />} />
          <Route path="/ascension" element={<AscensionPath />} />
          <Route path="/quests" element={<Quests />} />
        </Routes>
      </div>
    </>
  );
}

export default App;
