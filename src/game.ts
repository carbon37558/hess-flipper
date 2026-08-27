import { ONE, Rational, parseReaction, reactionVector, type GameQuestion, type ReactionState } from "./chemistry/engine";

export type Difficulty = GameQuestion["difficulty"] | "Mixed";
export type Mode = "Puzzle" | "Exam";
export interface Setup { difficulty: Difficulty; mode: Mode; length: 5 | 10; timeAttack: boolean }
export interface Performance { moves: number; hintUsed: boolean; examMistake: boolean; skipped: boolean }
export interface Snapshot { states: ReactionState[] }
export const initialStates = (count: number): ReactionState[] => Array.from({ length: count }, () => ({ flipped: false, scale: ONE }));
export const initialPerformance = (): Performance => ({ moves: 0, hintUsed: false, examMistake: false, skipped: false });
export const starsFor = (p: Performance, optimal: number) => p.skipped ? 0 : Math.min(p.hintUsed || p.examMistake ? 2 : 3, p.moves === optimal ? 3 : p.moves <= optimal + 2 ? 2 : 1);
export const pickQuestions = (all: GameQuestion[], setup: Setup) => {
  const pool = setup.difficulty === "Mixed" ? all : all.filter((q) => q.difficulty === setup.difficulty);
  return [...pool].sort(() => Math.random() - .5).slice(0, Math.min(setup.length, pool.length));
};
export const solutionStates = (q: GameQuestion) => q.solution.map((v) => { const r = Rational.parse(v); return { flipped: r.n < 0n, scale: r.abs() }; });
export const targetOrder = (q: GameQuestion) => [...reactionVector(parseReaction(q.target)).keys()];
export const recordKey = (setup: Setup) => `hess-flipper:pb:${setup.difficulty}:${setup.mode}:${setup.length}`;
export const formatTime = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;
export const undoReactionState = (history: ReactionState[][], performance: Performance) => ({
  states: history.at(-1), history: history.slice(0, -1), performance,
});
export const resetReactionState = (count: number, performance: Performance) => ({
  states: initialStates(count), performance: { ...performance, moves: performance.moves + 1 },
});
