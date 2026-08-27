import { describe, expect, it } from "vitest";
import { Rational, ONE, calculateDeltaH, checkExamAnswer, isBalanced, nextHint, optimalMoves, parseDeltaH, parseFormulaAtoms, parseReaction, parseSpecies, proportionalFactor, reactionVector, requiredDecimalPlaces, roundRational, solve, sumReactions, vectorsEqual } from "./engine";

describe("exact rational arithmetic", () => {
  it("adds fractions without floating point", () => expect(Rational.parse("1/2").add(Rational.parse("1/2")).toString()).toBe("1"));
  it("rejects malformed rationals", () => expect(() => Rational.parse("0.5")).toThrow());
});

describe("reaction parser and identity", () => {
  it("parses coefficients, states and charges", () => {
    const reaction = parseReaction("Fe3+(aq) + 3 OH-(aq) -> Fe(OH)3(s)");
    expect(reaction.left[0].species).toMatchObject({ formula: "Fe", charge: "3+", state: "aq" });
    expect(reaction.right[0].coefficient.toString()).toBe("1");
  });
  it("parses formula atoms including groups", () => expect(Object.fromEntries(parseFormulaAtoms(parseSpecies("Fe(OH)3(s)")))).toEqual({ Fe: 1n, O: 3n, H: 3n }));
  it("recognizes balanced equations", () => expect(isBalanced(parseReaction("2 H2(g) + O2(g) -> 2 H2O(l)"))).toBe(true));
  it("rejects unbalanced equations", () => expect(isBalanced(parseReaction("H2(g) + O2(g) -> H2O(l)"))).toBe(false));
});

describe("Hess algebra", () => {
  const water = parseReaction("2 H2(g) + O2(g) -> 2 H2O(l)");
  it("flips and scales", () => {
    const vector = reactionVector(water, { flipped: true, scale: Rational.parse("1/2") });
    expect(vector.get("H2O(l)")?.toString()).toBe("-1");
    expect(vector.get("H2(g)")?.toString()).toBe("1");
  });
  it("merges same-side terms exactly", () => {
    const half = parseReaction("H2(g) + 1/2 O2(g) -> H2O(l)");
    expect(sumReactions([half, half], [{ flipped: false, scale: ONE }, { flipped: false, scale: ONE }]).get("O2(g)")?.toString()).toBe("-1");
  });
  it("performs partial cancellation", () => {
    const a = parseReaction("6 H2O(l) -> 6 H2O(g)");
    const b = parseReaction("2 H2O(g) -> 2 H2O(l)");
    expect(sumReactions([a, b], [{ flipped: false, scale: ONE }, { flipped: false, scale: ONE }]).get("H2O(g)")?.toString()).toBe("4");
  });
  it("does not cancel different physical states", () => {
    const vector = reactionVector(parseReaction("H2O(l) -> H2O(g)"));
    expect(vector.size).toBe(2);
  });
  it("checks exact target equality", () => expect(vectorsEqual(reactionVector(water), reactionVector(parseReaction("2 H2(g) + O2(g) -> 2 H2O(l)")))).toBe(true));
  it("detects proportional match", () => expect(proportionalFactor(reactionVector(parseReaction("H2(g) + 1/2 O2(g) -> H2O(l)")), reactionVector(water))?.toString()).toBe("1/2"));
});

describe("solver and scoring inputs", () => {
  const givens = [parseReaction("2 H2(g) + O2(g) -> 2 H2O(l)"), parseReaction("2 H2(g) + O2(g) -> 2 H2O(g)")];
  const target = parseReaction("H2O(l) -> H2O(g)");
  it("solves signed exact coefficients", () => expect(solve(givens, target).map(String)).toEqual(["-1/2", "1/2"]));
  it("computes optimal flip and scale moves", () => expect(optimalMoves(solve(givens, target))).toBe(3));
  it("provides a current-state hint", () => expect(nextHint([{ flipped: false, scale: ONE }, { flipped: false, scale: ONE }], solve(givens, target))).toBe("Flip Reaction 1."));
  it("rejects impossible targets", () => expect(() => solve(givens, parseReaction("H2(g) -> H2O(l)"))).toThrow());
});

describe("enthalpy and decimal-place engine", () => {
  it("preserves trailing-zero precision", () => expect(parseDeltaH("-286.0").decimalPlaces).toBe(1));
  it("calculates final ΔH exactly", () => expect(calculateDeltaH([parseDeltaH("-572"), parseDeltaH("-484")], [Rational.parse("-1/2"), Rational.parse("1/2")]).toString()).toBe("44"));
  it("requires 1 dp for fractional non-integer products", () => expect(requiredDecimalPlaces([parseDeltaH("-285")], [Rational.parse("1/2")])).toBe(1));
  it("does not add dp for exact integer division", () => expect(requiredDecimalPlaces([parseDeltaH("-300")], [Rational.parse("1/2")])).toBe(0));
  it("rounds only the final rational", () => expect(roundRational(new Rational(-286, 3), 1)).toBe("−95.3"));
  it("checks strict decimal-place representation", () => {
    const answer = new Rational(-953, 10);
    expect(checkExamAnswer("-95.3", answer, 1)).toBe(true);
    expect(checkExamAnswer("-95.30", answer, 1)).toBe(false);
    expect(checkExamAnswer("-95", answer, 1)).toBe(false);
  });
});
