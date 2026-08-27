import { describe, expect, it } from "vitest";
import { Rational } from "./chemistry/engine";
import { initialPerformance, initialStates, resetReactionState, starsFor, undoReactionState } from "./game";

describe("irreversible performance history", () => {
  it("undo restores state but does not refund moves", () => {
    const original = initialStates(1); const changed = [{ flipped: true, scale: new Rational(2) }];
    const result = undoReactionState([original, changed], { ...initialPerformance(), moves: 2 });
    expect(result.states?.[0].flipped).toBe(true);
    expect(result.performance.moves).toBe(2);
  });
  it("reset restores initial state and adds one move without clearing flags", () => {
    const result = resetReactionState(2, { moves: 4, hintUsed: true, examMistake: true, skipped: false });
    expect(result.states.every((s) => !s.flipped && s.scale.toString() === "1")).toBe(true);
    expect(result.performance).toMatchObject({ moves: 5, hintUsed: true, examMistake: true });
  });
  it("caps stars after a hint or exam mistake", () => {
    expect(starsFor({ moves: 2, hintUsed: true, examMistake: false, skipped: false }, 2)).toBe(2);
    expect(starsFor({ moves: 2, hintUsed: false, examMistake: true, skipped: false }, 2)).toBe(2);
  });
  it("gives zero stars for skip", () => expect(starsFor({ ...initialPerformance(), skipped: true }, 0)).toBe(0));
});
