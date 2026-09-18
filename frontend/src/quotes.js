// Original motivational lines written for FitRift, themed around the
// Hunter/rank-up framing rather than generic gym quotes.
export const QUOTES = [
  "Every rep you log is a line in your own legend.",
  "The grind doesn't care about your rank. It only cares if you showed up.",
  "You don't need to be an S-Rank today. You need to be better than yesterday.",
  "Discipline is the quiet stat nobody sees on the sheet, and the one that matters most.",
  "A missed day isn't the end of a streak. Quitting is.",
  "The body achieves what the mind believes it can survive.",
  "Strength isn't given at spawn. It's farmed, one set at a time.",
  "Your baseline is not your ceiling.",
  "Hunters aren't born S-Rank. They're built, rep by rep.",
  "Progress is a quiet grind long before it's a visible glow-up.",
  "The version of you that gives up today is not the one you're trying to become.",
  "You don't rise to the occasion. You fall to the level of your training.",
  "Every workout logged is proof you chose growth over comfort.",
  "The bar doesn't lie, and neither does your effort.",
  "Small reps, repeated without excuse, become unstoppable momentum.",
  "You're not competing with anyone on this leaderboard but who you were last week.",
  "Rest when you're tired. Quit only if you've decided you don't want it anymore.",
  "The grind is the story. The rank-up is just the receipt.",
  "Nobody levels up by staying comfortable.",
  "Show up on the hard days. That's the only day that counts double.",
];

export function randomQuote(exclude) {
  const pool = exclude ? QUOTES.filter(q => q !== exclude) : QUOTES;
  return pool[Math.floor(Math.random() * pool.length)];
}
