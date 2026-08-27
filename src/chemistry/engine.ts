export type RationalJSON = string;

const gcd = (a: bigint, b: bigint): bigint => {
  a = a < 0n ? -a : a;
  b = b < 0n ? -b : b;
  while (b) [a, b] = [b, a % b];
  return a || 1n;
};

export class Rational {
  readonly n: bigint;
  readonly d: bigint;

  constructor(n: bigint | number | string, d: bigint | number | string = 1n) {
    let nn = BigInt(n);
    let dd = BigInt(d);
    if (dd === 0n) throw new Error("A rational denominator cannot be zero");
    if (dd < 0n) { nn = -nn; dd = -dd; }
    const g = gcd(nn, dd);
    this.n = nn / g;
    this.d = dd / g;
  }

  static parse(value: string): Rational {
    if (!/^[+-]?\d+(?:\/\d+)?$/.test(value.trim())) throw new Error(`Invalid rational: ${value}`);
    const [n, d = "1"] = value.trim().split("/");
    return new Rational(n, d);
  }

  add(v: Rational) { return new Rational(this.n * v.d + v.n * this.d, this.d * v.d); }
  sub(v: Rational) { return this.add(v.neg()); }
  mul(v: Rational) { return new Rational(this.n * v.n, this.d * v.d); }
  div(v: Rational) { return new Rational(this.n * v.d, this.d * v.n); }
  neg() { return new Rational(-this.n, this.d); }
  abs() { return this.n < 0n ? this.neg() : this; }
  eq(v: Rational) { return this.n === v.n && this.d === v.d; }
  isZero() { return this.n === 0n; }
  isInteger() { return this.d === 1n; }
  toNumber() { return Number(this.n) / Number(this.d); }
  toString() { return this.d === 1n ? `${this.n}` : `${this.n}/${this.d}`; }
}

export const ZERO = new Rational(0n);
export const ONE = new Rational(1n);

export interface Species {
  id: string;
  formula: string;
  state: string;
  charge: string;
}

export interface Term {
  species: Species;
  coefficient: Rational;
}

export interface Reaction {
  raw: string;
  left: Term[];
  right: Term[];
}

export interface ReactionState { flipped: boolean; scale: Rational }

export interface DeltaH { text: string; value: Rational; decimalPlaces: number }

export interface GameReaction {
  reactionNo: number;
  equation: string;
  deltaH: string;
}

export interface GameQuestion {
  questionId: string;
  difficulty: "Easy" | "Medium" | "Hard";
  target: string;
  reactions: GameReaction[];
  solution: string[];
  optimalMoves: number;
  finalDeltaH: string;
  requiredDp: number;
}

export const parseSpecies = (raw: string): Species => {
  const token = raw.trim();
  const stateMatch = token.match(/\((aq|g|l|s|graphite|diamond|rhombic)\)$/);
  if (!stateMatch) throw new Error(`Missing or invalid physical state: ${token}`);
  const state = stateMatch[1];
  let formulaWithCharge = token.slice(0, -stateMatch[0].length);
  let charge = "";
  const caretCharge = formulaWithCharge.match(/(\^\d*[+-])$/);
  const plainCharge = formulaWithCharge.match(/(\d*[+-])$/);
  const match = caretCharge ?? plainCharge;
  if (match) {
    charge = match[1];
    formulaWithCharge = formulaWithCharge.slice(0, -match[1].length);
  }
  if (!formulaWithCharge) throw new Error(`Missing formula: ${token}`);
  return { id: token, formula: formulaWithCharge, state, charge };
};

const parseTerm = (text: string): Term => {
  const match = text.trim().match(/^(?:(\d+(?:\/\d+)?)\s+)?(.+)$/);
  if (!match) throw new Error(`Invalid reaction term: ${text}`);
  const coefficient = Rational.parse(match[1] ?? "1");
  if (coefficient.n <= 0n) throw new Error(`Coefficient must be positive: ${text}`);
  return { coefficient, species: parseSpecies(match[2]) };
};

export const parseReaction = (raw: string): Reaction => {
  if ((raw.match(/->/g) ?? []).length !== 1) throw new Error(`Reaction must contain one ->: ${raw}`);
  const [leftText, rightText] = raw.split("->").map((s) => s.trim());
  if (!leftText || !rightText) throw new Error(`Reaction needs both sides: ${raw}`);
  const parseSide = (side: string) => side.split(/\s+\+\s+/).map(parseTerm);
  return { raw, left: parseSide(leftText), right: parseSide(rightText) };
};

export const reactionVector = (reaction: Reaction, state: ReactionState = { flipped: false, scale: ONE }) => {
  const result = new Map<string, Rational>();
  const sign = state.flipped ? new Rational(-1n) : ONE;
  const add = (term: Term, side: Rational) => {
    const value = term.coefficient.mul(state.scale).mul(sign).mul(side);
    result.set(term.species.id, (result.get(term.species.id) ?? ZERO).add(value));
  };
  reaction.left.forEach((term) => add(term, new Rational(-1n)));
  reaction.right.forEach((term) => add(term, ONE));
  return new Map([...result].filter(([, value]) => !value.isZero()));
};

export const sumReactions = (reactions: Reaction[], states: ReactionState[]) => {
  const sum = new Map<string, Rational>();
  reactions.forEach((reaction, index) => {
    for (const [id, value] of reactionVector(reaction, states[index])) {
      sum.set(id, (sum.get(id) ?? ZERO).add(value));
    }
  });
  return new Map([...sum].filter(([, value]) => !value.isZero()));
};

export const vectorsEqual = (a: Map<string, Rational>, b: Map<string, Rational>) => {
  const keys = new Set([...a.keys(), ...b.keys()]);
  return [...keys].every((key) => (a.get(key) ?? ZERO).eq(b.get(key) ?? ZERO));
};

export const proportionalFactor = (current: Map<string, Rational>, target: Map<string, Rational>): Rational | null => {
  const keys = new Set([...current.keys(), ...target.keys()]);
  let factor: Rational | null = null;
  for (const key of keys) {
    const a = current.get(key) ?? ZERO;
    const b = target.get(key) ?? ZERO;
    if (a.isZero() !== b.isZero() || (!a.isZero() && a.n * b.n < 0n)) return null;
    if (!b.isZero()) {
      const next = a.div(b);
      if (!factor) factor = next;
      else if (!factor.eq(next)) return null;
    }
  }
  return factor && factor.n > 0n ? factor : null;
};

export const solve = (givens: Reaction[], target: Reaction): Rational[] => {
  const species = [...new Set([...givens, target].flatMap((r) => [...r.left, ...r.right].map((t) => t.species.id)))];
  const columns = givens.map((r) => reactionVector(r));
  const targetVector = reactionVector(target);
  const matrix = species.map((id) => [...columns.map((v) => v.get(id) ?? ZERO), targetVector.get(id) ?? ZERO]);
  const rows = matrix.length;
  const cols = givens.length;
  const pivots = new Map<number, number>();
  let row = 0;
  for (let col = 0; col < cols && row < rows; col++) {
    const pivot = matrix.findIndex((r, i) => i >= row && !r[col].isZero());
    if (pivot < 0) continue;
    [matrix[row], matrix[pivot]] = [matrix[pivot], matrix[row]];
    const divisor = matrix[row][col];
    matrix[row] = matrix[row].map((v) => v.div(divisor));
    for (let r = 0; r < rows; r++) {
      if (r === row || matrix[r][col].isZero()) continue;
      const factor = matrix[r][col];
      matrix[r] = matrix[r].map((v, c) => v.sub(factor.mul(matrix[row][c])));
    }
    pivots.set(col, row++);
  }
  for (const r of matrix) if (r.slice(0, cols).every((v) => v.isZero()) && !r[cols].isZero()) throw new Error("Target is not constructible");
  if (pivots.size < cols) throw new Error("Solution is not unique");
  return Array.from({ length: cols }, (_, col) => matrix[pivots.get(col)!][cols]);
};

export const optimalMoves = (solution: Rational[]) => solution.reduce((moves, coefficient) => moves + (coefficient.n < 0n ? 1 : 0) + (coefficient.abs().eq(ONE) ? 0 : 1), 0);

export const parseDeltaH = (text: string): DeltaH => {
  const clean = text.trim();
  if (!/^[+-]?\d+(?:\.\d+)?$/.test(clean)) throw new Error(`Invalid ΔH: ${text}`);
  const negative = clean.startsWith("-");
  const unsigned = clean.replace(/^[+-]/, "");
  const [whole, decimals = ""] = unsigned.split(".");
  const n = BigInt(whole + decimals) * (negative ? -1n : 1n);
  return { text: clean, value: new Rational(n, 10n ** BigInt(decimals.length)), decimalPlaces: decimals.length };
};

export const calculateDeltaH = (values: DeltaH[], solution: Rational[]) => values.reduce((sum, value, i) => sum.add(value.value.mul(solution[i])), ZERO);

export const requiredDecimalPlaces = (values: DeltaH[], solution: Rational[]) => {
  let dp = Math.max(...values.map((v) => v.decimalPlaces));
  if (solution.some((scale, i) => !scale.isInteger() && !values[i].value.mul(scale).isInteger())) dp = Math.max(dp, 1);
  return dp;
};

export const roundRational = (value: Rational, dp: number) => {
  const factor = 10n ** BigInt(dp);
  const scaled = value.n * factor;
  const quotient = scaled / value.d;
  const remainder = scaled % value.d;
  const rounded = quotient + ((remainder < 0n ? -remainder : remainder) * 2n >= value.d ? (scaled < 0n ? -1n : 1n) : 0n);
  const abs = rounded < 0n ? -rounded : rounded;
  const digits = abs.toString().padStart(dp + 1, "0");
  const signed = rounded < 0n ? "−" : "";
  return dp ? `${signed}${digits.slice(0, -dp)}.${digits.slice(-dp)}` : `${signed}${digits}`;
};

export const checkExamAnswer = (input: string, answer: Rational, dp: number) => {
  const normalized = input.trim().replace("−", "-");
  const pattern = dp ? new RegExp(`^-?\\d+\\.\\d{${dp}}$`) : /^-?\d+$/;
  return pattern.test(normalized) && normalized.replace("-", "−") === roundRational(answer, dp);
};

export const parseFormulaAtoms = (species: Species): Map<string, bigint> => {
  const formula = species.formula;
  let index = 0;
  const parseGroup = (): Map<string, bigint> => {
    const atoms = new Map<string, bigint>();
    while (index < formula.length && formula[index] !== ")") {
      if (formula[index] === "(") {
        index++;
        const nested = parseGroup();
        if (formula[index++] !== ")") throw new Error(`Unclosed formula group: ${formula}`);
        const count = readCount();
        nested.forEach((v, k) => atoms.set(k, (atoms.get(k) ?? 0n) + v * count));
      } else {
        const match = formula.slice(index).match(/^[A-Z][a-z]?/);
        if (!match) throw new Error(`Invalid formula syntax: ${formula}`);
        index += match[0].length;
        atoms.set(match[0], (atoms.get(match[0]) ?? 0n) + readCount());
      }
    }
    return atoms;
  };
  const readCount = () => {
    const match = formula.slice(index).match(/^\d+/);
    if (!match) return 1n;
    index += match[0].length;
    return BigInt(match[0]);
  };
  const atoms = parseGroup();
  if (index !== formula.length) throw new Error(`Invalid formula syntax: ${formula}`);
  return atoms;
};

export const isBalanced = (reaction: Reaction) => {
  const totals = (terms: Term[]) => {
    const result = new Map<string, Rational>();
    terms.forEach((term) => parseFormulaAtoms(term.species).forEach((count, atom) => {
      result.set(atom, (result.get(atom) ?? ZERO).add(term.coefficient.mul(new Rational(count))));
    }));
    return result;
  };
  return vectorsEqual(totals(reaction.left), totals(reaction.right));
};

export const stateForSolution = (coefficient: Rational): ReactionState => ({ flipped: coefficient.n < 0n, scale: coefficient.abs() });

export const nextHint = (current: ReactionState[], solution: Rational[]) => {
  for (let i = 0; i < solution.length; i++) {
    const goal = stateForSolution(solution[i]);
    if (current[i].flipped !== goal.flipped) return `Flip Reaction ${i + 1}.`;
    if (!current[i].scale.eq(goal.scale)) return `Scale Reaction ${i + 1} ×${goal.scale}.`;
  }
  return "Your reaction is ready to match the target.";
};
