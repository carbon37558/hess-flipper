import { ONE, Rational, checkExamAnswer, parseReaction, reactionVector, type GameQuestion, type ReactionState } from "./chemistry/engine";

export type Difficulty = GameQuestion["difficulty"] | "Mixed";
export type Mode = "Puzzle" | "Exam";
export interface Setup { difficulty: Difficulty; mode: Mode; length: 5 | 10; timeAttack: boolean }
export interface Performance { moves: number; hintUsed: boolean; examMistake: boolean; examAttempts: number; skipped: boolean }
export interface Snapshot { states: ReactionState[] }
export const initialStates = (count: number): ReactionState[] => Array.from({ length: count }, () => ({ flipped: false, scale: ONE }));
export const initialPerformance = (): Performance => ({ moves: 0, hintUsed: false, examMistake: false, examAttempts: 0, skipped: false });
export const starsFor = (p: Performance, optimal: number) => p.skipped ? 0 : Math.min(p.hintUsed || p.examMistake ? 2 : 3, p.moves === optimal ? 3 : p.moves <= optimal + 2 ? 2 : 1);
export const examStarsFor = (attempts: number, skipped = false) => skipped ? 0 : attempts <= 1 ? 3 : attempts === 2 ? 2 : 1;
export const isValidExamInput = (input: string) => /^[+-]?\d+(?:\.\d+)?$/.test(input.trim().replace("−", "-"));
export const evaluateExamSubmission = (input: string, answer: Rational, requiredDp: number, attempts: number) => {
  if (!isValidExamInput(input)) return { kind: "invalid" as const, attempts };
  const nextAttempts = attempts + 1;
  return { kind: checkExamAnswer(input, answer, requiredDp) ? "correct" as const : "incorrect" as const, attempts: nextAttempts };
};
export const achievementUnlocked = (setup: Setup, stars: number, questionCount: number) => setup.mode === "Exam" && setup.difficulty === "Hard" && setup.length === 10 && questionCount === 10 && stars === 30;
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
