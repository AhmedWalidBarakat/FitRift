import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { randomQuote } from './quotes';

export default function WisdomScroll() {
  const [open, setOpen] = useState(false);
  const [quote, setQuote] = useState(null);

  function reveal() {
    setQuote(randomQuote(quote));
    setOpen(true);
  }

  return (
    <>
      <button className="scroll-fab" onClick={reveal} title="A word of wisdom">📜</button>

      <AnimatePresence>
        {open && (
          <motion.div
            className="scroll-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpen(false)}
          >
            <motion.div
              className="scroll-card"
              initial={{ opacity: 0, scale: 0.85, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 10 }}
              transition={{ type: 'spring', stiffness: 220, damping: 20 }}
              onClick={e => e.stopPropagation()}
            >
              <div className="scroll-card-icon">📜</div>
              <p className="scroll-card-quote">{quote}</p>
              <div className="scroll-card-actions">
                <button className="scroll-card-btn" onClick={reveal}>Another</button>
                <button className="scroll-card-btn ghost" onClick={() => setOpen(false)}>Close</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
