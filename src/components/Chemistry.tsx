import { parseReaction, type Rational, type Reaction } from "../chemistry/engine";
import type { CancellationEvent, CancellationPhase } from "../game";
import type { CSSProperties } from "react";

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

export const VectorEquation = ({ vector, order, cancellation }: { vector: Map<string, Rational>; order: string[]; cancellation?: { events: CancellationEvent[]; phase: CancellationPhase } }) => {
  const sorted = [...vector].sort(([a], [b]) => {
    const ai = order.indexOf(a), bi = order.indexOf(b);
    return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi);
  });
  const eventIds = new Set(cancellation?.events.map((event) => event.species) ?? []);
  const left = sorted.filter(([id, v]) => v.n < 0n && !eventIds.has(id)).map(([id, v]) => ({ id, coefficient: v.abs(), cancelling: false, index: -1 }));
  const right = sorted.filter(([id, v]) => v.n > 0n && !eventIds.has(id)).map(([id, v]) => ({ id, coefficient: v, cancelling: false, index: -1 }));
  cancellation?.events.forEach((event, index) => {
    const before = cancellation.phase === "cancelling";
    const leftValue = before ? event.leftBefore : event.leftAfter;
    const rightValue = before ? event.rightBefore : event.rightAfter;
    if (!leftValue.isZero()) left.push({ id: event.species, coefficient: leftValue, cancelling: before, index });
    if (!rightValue.isZero()) right.push({ id: event.species, coefficient: rightValue, cancelling: before, index });
  });
  const sortTerms = (terms: typeof left) => terms.sort((a, b) => { const ai = order.indexOf(a.id), bi = order.indexOf(b.id); return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi); });
  sortTerms(left); sortTerms(right);
  if (!left.length && !right.length) return <span className="empty-result">All species cancelled</span>;
  const side = (terms: typeof left, direction: "left" | "right") => terms.map((term, i) => <span className={`term cancellation-term ${term.cancelling ? "is-cancelling" : "is-settled"}`} style={{ "--cancel-index": term.index } as CSSProperties} data-species={term.id} data-side={direction} key={term.id}>{i > 0 && <span className="plus"> + </span>}<span className="species-content"><Coefficient value={term.coefficient} /><Formula text={term.id} />{term.cancelling && <><span className="cancel-strike" /> <span className="particles">{Array.from({ length: 6 }, (_, particle) => <i style={{ "--particle": particle } as CSSProperties} key={particle} />)}</span></>}</span></span>);
  return <span className={`equation cancellation-equation ${cancellation?.phase === "reflow" ? "is-reflowing" : ""}`}>{side(left, "left")} <span className="arrow" aria-label="yields">→</span> {side(right, "right")}</span>;
};
