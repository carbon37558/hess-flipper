import { describe, expect, it } from "vitest";
import { Rational } from "./chemistry/engine";
import { achievementUnlocked, evaluateExamSubmission, examStarsFor, initialPerformance, initialStates, isValidExamInput, resetReactionState, starsFor, undoReactionState } from "./game";

describe("irreversible performance history", () => {
  it("undo restores state but does not refund moves", () => {
    const original = initialStates(1); const changed = [{ flipped: true, scale: new Rational(2) }];
    const result = undoReactionState([original, changed], { ...initialPerformance(), moves: 2 });
    expect(result.states?.[0].flipped).toBe(true);
    expect(result.performance.moves).toBe(2);
  });
  it("reset restores initial state and adds one move without clearing flags", () => {
    const result = resetReactionState(2, { moves: 4, hintUsed: true, examMistake: true, examAttempts: 0, skipped: false });
    expect(result.states.every((s) => !s.flipped && s.scale.toString() === "1")).toBe(true);
    expect(result.performance).toMatchObject({ moves: 5, hintUsed: true, examMistake: true });
  });
  it("caps stars after a hint or exam mistake", () => {
    expect(starsFor({ moves: 2, hintUsed: true, examMistake: false, examAttempts: 0, skipped: false }, 2)).toBe(2);
    expect(starsFor({ moves: 2, hintUsed: false, examMistake: true, examAttempts: 0, skipped: false }, 2)).toBe(2);
  });
  it("gives zero stars for skip", () => expect(starsFor({ ...initialPerformance(), skipped: true }, 0)).toBe(0));
});

describe("exam scoring and submissions", () => {
  it.each([[1, 3], [2, 2], [3, 1], [8, 1]])("awards attempts %i as %i stars", (attempts, stars) => expect(examStarsFor(attempts)).toBe(stars));
  it("awards zero for a skip", () => expect(examStarsFor(0, true)).toBe(0));
  it.each(["", "  ", "1e3", "12.", "abc", "--2"])("rejects %j as invalid", (input) => expect(isValidExamInput(input)).toBe(false));
  it.each(["-12.3", "−12.3", "+12.3", "0"])("accepts %j as numeric", (input) => expect(isValidExamInput(input)).toBe(true));
  it("does not count invalid input as an attempt", () => expect(evaluateExamSubmission("", new Rational(-10), 1, 2)).toEqual({ kind: "invalid", attempts: 2 }));
  it("counts a valid incorrect input", () => expect(evaluateExamSubmission("-9.0", new Rational(-10), 1, 2)).toEqual({ kind: "incorrect", attempts: 3 }));
  it("accepts an omitted trailing zero as a first-attempt correct answer", () => {
    const submission = evaluateExamSubmission("-10", new Rational(-10), 1, 0);
    expect(submission).toEqual({ kind: "correct", attempts: 1 });
    expect(examStarsFor(submission.attempts)).toBe(3);
  });
  it("unlocks mastery only for a perfect ten-question hard exam", () => {
    const setup = { difficulty: "Hard" as const, mode: "Exam" as const, length: 10 as const, timeAttack: false };
    expect(achievementUnlocked(setup, 30, 10)).toBe(true);
    expect(achievementUnlocked(setup, 29, 10)).toBe(false);
  });
});
