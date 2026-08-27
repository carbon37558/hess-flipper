import { parseReaction, type Rational, type Reaction } from "../chemistry/engine";

const Formula = ({ text }: { text: string }) => {
  const state = text.match(/\(([^)]+)\)$/)?.[0] ?? "";
  let formula = state ? text.slice(0, -state.length) : text;
  const charge = formula.match(/(?:\^\d*[+-]|\d+[+-]|[+-])$/)?.[0] ?? "";
  if (charge) formula = formula.slice(0, -charge.length);
  const chargeText = charge.replace("^", "");
  const parts = formula.split(/(\d+)/g);
  return <span className="formula">{parts.map((part, i) => /^\d+$/.test(part) ? <sub key={i}>{part}</sub> : part)}{chargeText && <sup>{chargeText}</sup>}<span className="state">{state}</span></span>;
};

const Coefficient = ({ value }: { value: Rational }) => value.d === 1n ? <>{value.n === 1n ? null : `${value.n} `}</> : <span className="fraction"><span>{value.n.toString()}</span><span>{value.d.toString()}</span></span>;

export const Equation = ({ reaction, className = "" }: { reaction: string | Reaction; className?: string }) => {
  const parsed = typeof reaction === "string" ? parseReaction(reaction) : reaction;
  const side = (terms: Reaction["left"]) => terms.map((term, i) => <span className="term" key={term.species.id}>{i > 0 && <span className="plus"> + </span>}<Coefficient value={term.coefficient} /><Formula text={term.species.id} /></span>);
  return <span className={`equation ${className}`}>{side(parsed.left)} <span className="arrow" aria-label="yields">→</span> {side(parsed.right)}</span>;
};

export const VectorEquation = ({ vector, order }: { vector: Map<string, Rational>; order: string[] }) => {
  const sorted = [...vector].sort(([a], [b]) => {
    const ai = order.indexOf(a), bi = order.indexOf(b);
    return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi);
  });
  const left = sorted.filter(([, v]) => v.n < 0n).map(([id, v]) => ({ species: { id, formula: "", state: "", charge: "" }, coefficient: v.abs() }));
  const right = sorted.filter(([, v]) => v.n > 0n).map(([id, v]) => ({ species: { id, formula: "", state: "", charge: "" }, coefficient: v }));
  if (!left.length && !right.length) return <span className="empty-result">All species cancelled</span>;
  return <Equation reaction={{ raw: "", left, right }} />;
};
