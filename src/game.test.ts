import { describe, expect, it } from "vitest";
import { Rational } from "./chemistry/engine";
import { parseReaction } from "./chemistry/engine";
import { achievementUnlocked, cancellationEvents, cancellationTiming, controlsLocked, evaluateExamSubmission, examStarsFor, initialPerformance, initialStates, isValidExamInput, newCancellationEvents, nextCancellationPhase, resetReactionState, starsFor, undoReactionState } from "./game";

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

describe("Puzzle cancellation presentation", () => {
  it("describes full cancellation on both sides", () => {
    const events = cancellationEvents([parseReaction("2 H2(g) -> 2 H2O(l)"), parseReaction("2 H2O(l) -> O2(g)")], initialStates(2));
    expect(events.map((event) => ({ species: event.species, cancel: event.cancelAmount.toString(), leftAfter: event.leftAfter.toString(), rightAfter: event.rightAfter.toString() }))).toEqual([{ species: "H2O(l)", cancel: "2", leftAfter: "0", rightAfter: "0" }]);
  });
  it("describes partial cancellation without discarding the remainder", () => {
    const events = cancellationEvents([parseReaction("6 H2O(l) -> 6 H2O(g)"), parseReaction("2 H2O(g) -> 2 H2O(l)")], initialStates(2));
    expect(events[0]).toMatchObject({ species: "H2O(l)" });
    expect(events[0].cancelAmount.toString()).toBe("2");
    expect(events[0].leftAfter.toString()).toBe("4");
    expect(events[0].rightAfter.toString()).toBe("0");
  });
  it("keeps multiple events in stable chemistry order", () => {
    const events = cancellationEvents([parseReaction("CO2(g) + H2O(l) -> CO(g)"), parseReaction("CO(g) -> CO2(g) + H2O(l)")], initialStates(2));
    expect(events.map((event) => event.species)).toEqual(["CO2(g)", "H2O(l)", "CO(g)"]);
  });
  it("does not mark same-side merging as cancellation", () => expect(cancellationEvents([parseReaction("H2(g) -> 1/2 O2(g)"), parseReaction("H2O(l) -> 1/2 O2(g)")], initialStates(2))).toEqual([]));
  it("emits only cancellation amounts changed by the operation", () => {
    const reactions = [parseReaction("2 H2(g) -> 2 H2O(l)"), parseReaction("H2O(l) -> O2(g)")];
    expect(newCancellationEvents(reactions, initialStates(2), [{ flipped: false, scale: new Rational(2) }, { flipped: false, scale: new Rational(2) }])).toHaveLength(1);
    expect(newCancellationEvents(reactions, initialStates(2), initialStates(2))).toEqual([]);
  });
  it("emits an event when partial cancellation becomes full at the same amount", () => {
    const reactions = [parseReaction("Fe(s) + Cl2(g) -> FeCl2(s)"), parseReaction("2 FeCl2(s) + Cl2(g) -> 2 FeCl3(s)")];
    const events = newCancellationEvents(reactions, initialStates(2), [{ flipped: false, scale: new Rational(1) }, { flipped: false, scale: Rational.parse("1/2") }]);
    expect(events).toHaveLength(1);
    expect(events[0].species).toBe("FeCl2(s)");
    expect(events[0].cancelAmount.toString()).toBe("1");
    expect(events[0].leftAfter.isZero() && events[0].rightAfter.isZero()).toBe(true);
  });
  it("locks controls through presentation and restores them at idle", () => {
    expect(controlsLocked("cancelling")).toBe(true);
    expect(controlsLocked("reflow")).toBe(true);
    expect(controlsLocked("combo")).toBe(true);
    expect(controlsLocked("settle")).toBe(true);
    expect(controlsLocked("idle")).toBe(false);
  });
  it("sequences cancellation before combo, settle, and target eligibility", () => {
    expect(nextCancellationPhase("cancelling", 2)).toBe("reflow");
    expect(nextCancellationPhase("reflow", 2)).toBe("combo");
    expect(nextCancellationPhase("combo", 2)).toBe("settle");
    expect(nextCancellationPhase("settle", 2)).toBe("idle");
    expect(nextCancellationPhase("reflow", 1)).toBe("settle");
  });
  it("uses staggered standard and reduced-motion timelines", () => {
    expect(cancellationTiming(3)).toEqual({ burstAt: [350, 470, 590], reflowAt: 920 });
    expect(cancellationTiming(2, true)).toEqual({ burstAt: [160, 240], reflowAt: 400 });
  });
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
