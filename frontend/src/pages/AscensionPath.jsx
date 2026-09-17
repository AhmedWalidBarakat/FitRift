import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { authedFetch } from '../config';

const FAMILY_TITLES = {
  pushup: 'Push-Up Path',
  pullup: 'Pull-Up Path',
  squat: 'Squat Path',
};

// Example phrasing to show under each standalone exercise, so users know
// exactly what to type in chat to log it (units and weight logging vary).
const EXAMPLE_PHRASES = {
  'Sit-ups': '"20 situps"',
  'Lunges': '"20 lunges"',
  'Crunches': '"25 crunches"',
  'Dips': '"12 dips"',
  'Plank': '"held a plank for 45 seconds"',
  'Leg Raises': '"15 leg raises"',
  'Burpees': '"15 burpees"',
  'Mountain Climbers': '"30 mountain climbers"',
  'Running': '"ran 3km"',
  'Curls': '"15 curls with 20lb dumbbells"',
  'Hammer Curls': '"15 hammer curls with 20lb dumbbells"',
  'Tricep Extensions': '"15 tricep extensions with 15lb dumbbells"',
};

export default function AscensionPath() {
  const [chains, setChains] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authedFetch('/progression')
      .then(r => r.json())
      .then(data => {
        setChains(data);
        setLoading(false);
      });
  }, []);

  if (loading) return <div className="page-loading">Loading the path…</div>;

  const paths = chains.filter(c => c.nodes.length > 1);
  const standalone = chains.filter(c => c.nodes.length === 1);

  return (
    <div className="ascension">
      <h2 className="ascension-title">🗺️ The Ascension Path</h2>
      <p className="ascension-subtitle">Master each tier to unlock the next. Cross {25} reps to advance.</p>

      <div className="path-grid">
        {paths.map(({ family, nodes }) => (
          <motion.div
            className="path-card"
            key={family}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <div className="path-title">{FAMILY_TITLES[family] || family}</div>
            <div className="path-chain">
              {[...nodes].reverse().map((node, i, arr) => (
                <div key={node.id} className="path-node-wrap">
                  <div className={`path-node ${node.unlocked ? 'unlocked' : 'locked'}`}>
                    <span className="node-icon">{node.unlocked ? '🔓' : '🔒'}</span>
                    <span className="node-name">{node.name}</span>
                    {node.unlocked && node.best > 0 && (
                      <span className="node-best">best: {node.best} {node.unit}</span>
                    )}
                  </div>
                  {i < arr.length - 1 && <div className="path-arrow">↑</div>}
                </div>
              ))}
            </div>
          </motion.div>
        ))}
      </div>

      <h3 className="standalone-title">Other Trials</h3>
      <div className="standalone-grid">
        {standalone.map(({ family, nodes }) => (
          <div className="standalone-card" key={family}>
            <span className="node-name">{nodes[0].name}</span>
            {nodes[0].best > 0 && <span className="node-best">best: {nodes[0].best} {nodes[0].unit}</span>}
            <span className="node-example">e.g. {EXAMPLE_PHRASES[nodes[0].name]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
