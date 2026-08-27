import { useEffect, useMemo, useRef, useState } from "react";
import questionsData from "./generated/questions.json";
import { Equation, VectorEquation } from "./components/Chemistry";
import { Rational, ONE, calculateDeltaH, checkExamAnswer, nextHint, parseDeltaH, parseReaction, proportionalFactor, reactionVector, roundRational, sumReactions, vectorsEqual, type GameQuestion, type ReactionState } from "./chemistry/engine";
import { formatTime, initialPerformance, initialStates, pickQuestions, recordKey, solutionStates, starsFor, targetOrder, type Mode, type Performance, type Setup } from "./game";

const allQuestions = questionsData as GameQuestion[];
type Screen = "home" | "play" | "summary";
type Phase = "working" | "enthalpy" | "result" | "skipped" | "replay";
interface Outcome { id: string; stars: number; moves: number; optimal: number; skipped: boolean }

function sound(kind: "tap" | "cancel" | "success" | "stars", muted: boolean) {
  if (muted) return;
  const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const context = new AudioContextClass();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.frequency.value = { tap: 280, cancel: 520, success: 660, stars: 820 }[kind];
  gain.gain.setValueAtTime(.05, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(.001, context.currentTime + .12);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start(); oscillator.stop(context.currentTime + .12);
}

export default function App() {
  const [screen, setScreen] = useState<Screen>("home");
  const [setup, setSetup] = useState<Setup>({ difficulty: "Mixed", mode: "Puzzle", length: 5, timeAttack: false });
  const [run, setRun] = useState<GameQuestion[]>([]);
  const [index, setIndex] = useState(0);
  const [states, setStates] = useState<ReactionState[]>([]);
  const [undo, setUndo] = useState<ReactionState[][]>([]);
  const [performance, setPerformance] = useState<Performance>(initialPerformance());
  const [phase, setPhase] = useState<Phase>("working");
  const [hint, setHint] = useState("");
  const [examInput, setExamInput] = useState("");
  const [examError, setExamError] = useState("");
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [muted, setMuted] = useState(() => localStorage.getItem("hess-flipper:muted") === "true");
  const [combo, setCombo] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef(0);
  const replayTimer = useRef<number | null>(null);

  const question = run[index];
  const parsedReactions = useMemo(() => question?.reactions.map((r) => parseReaction(r.equation)) ?? [], [question]);
  const target = useMemo(() => question ? parseReaction(question.target) : null, [question]);
  const current = useMemo(() => question ? sumReactions(parsedReactions, states) : new Map(), [question, parsedReactions, states]);
  const targetVector = useMemo(() => target ? reactionVector(target) : new Map(), [target]);
  const exact = question ? vectorsEqual(current, targetVector) : false;
  const proportion = exact ? null : proportionalFactor(current, targetVector);

  useEffect(() => { localStorage.setItem("hess-flipper:muted", String(muted)); }, [muted]);
  useEffect(() => {
    if (!setup.timeAttack || screen !== "play") return;
    const timer = window.setInterval(() => setElapsed(Date.now() - startedAt.current), 1000);
    return () => clearInterval(timer);
  }, [screen, setup.timeAttack]);
  useEffect(() => {
    if (exact && phase === "working") {
      sound("success", muted);
      setPhase(setup.mode === "Puzzle" ? "result" : "enthalpy");
    }
  }, [exact, phase, setup.mode, muted]);
  useEffect(() => () => { if (replayTimer.current) clearTimeout(replayTimer.current); }, []);

  const start = () => {
    const selected = pickQuestions(allQuestions, setup);
    setRun(selected); setIndex(0); setStates(initialStates(selected[0].reactions.length)); setUndo([]);
    setPerformance(initialPerformance()); setOutcomes([]); setStreak(0); setBestStreak(0); setPhase("working"); setHint("");
    startedAt.current = Date.now(); setElapsed(0); setScreen("play");
  };

  const mutate = (next: ReactionState[], countMove = true, silent = false) => {
    if (phase !== "working" && phase !== "replay") return;
    const changed = next.some((s, i) => s.flipped !== states[i]?.flipped || !s.scale.eq(states[i]?.scale ?? ONE));
    if (!changed) return;
    if (phase === "working") setUndo((history) => [...history, states]);
    const beforeKeys = new Set(current.keys());
    const nextVector = sumReactions(parsedReactions, next);
    const cancelled = [...beforeKeys].filter((key) => !nextVector.has(key)).length;
    if (!silent && cancelled) { setCombo(cancelled); sound("cancel", muted); window.setTimeout(() => setCombo(0), 650); }
    else sound("tap", muted);
    setStates(next);
    if (countMove && phase === "working") setPerformance((p) => ({ ...p, moves: p.moves + 1 }));
    setHint("");
  };

  const complete = (skipped = false) => {
    const p = skipped ? { ...performance, skipped: true } : performance;
    const stars = starsFor(p, question.optimalMoves);
    const outcome = { id: question.questionId, stars, moves: p.moves, optimal: question.optimalMoves, skipped };
    setOutcomes((list) => [...list, outcome]);
    const nextStreak = stars === 3 ? streak + 1 : 0;
    setStreak(nextStreak); setBestStreak(Math.max(bestStreak, nextStreak));
    if (index === run.length - 1) {
      const total = Date.now() - startedAt.current; setElapsed(total);
      if (setup.timeAttack) {
        const key = recordKey(setup); const old = Number(localStorage.getItem(key) || Infinity);
        if (total < old) localStorage.setItem(key, String(total));
      }
      if (setup.mode === "Exam" && setup.difficulty === "Hard" && setup.length === 10 && [...outcomes, outcome].reduce((s, o) => s + o.stars, 0) === 30) localStorage.setItem("hess-flipper:achievement:exam-hard-30", "true");
      setScreen("summary"); return;
    }
    const next = run[index + 1]; setIndex(index + 1); setStates(initialStates(next.reactions.length)); setUndo([]);
    setPerformance(initialPerformance()); setPhase("working"); setHint(""); setExamInput(""); setExamError("");
  };

  const submitExam = () => {
    const solution = question.solution.map(Rational.parse);
    const answer = calculateDeltaH(question.reactions.map((r) => parseDeltaH(r.deltaH)), solution);
    if (checkExamAnswer(examInput, answer, question.requiredDp)) { setPhase("result"); setExamError(""); sound("stars", muted); }
    else { setPerformance((p) => ({ ...p, examMistake: true })); setExamError(`Enter the final answer to exactly ${question.requiredDp} decimal place${question.requiredDp === 1 ? "" : "s"}.`); }
  };

  const replay = (step = 0) => {
    setPhase("replay"); setStates(initialStates(question.reactions.length));
    const goal = solutionStates(question);
    const operations: { index: number; kind: "flip" | "scale" }[] = [];
    goal.forEach((s, i) => { if (s.flipped) operations.push({ index: i, kind: "flip" }); if (!s.scale.eq(ONE)) operations.push({ index: i, kind: "scale" }); });
    const perform = (at: number, state: ReactionState[]) => {
      if (at >= operations.length) return;
      const op = operations[at]; const copy = state.map((s) => ({ ...s })); copy[op.index] = { ...copy[op.index], [op.kind === "flip" ? "flipped" : "scale"]: op.kind === "flip" ? true : goal[op.index].scale } as ReactionState;
      setStates(copy); replayTimer.current = window.setTimeout(() => perform(at + 1, copy), 650);
    };
    replayTimer.current = window.setTimeout(() => perform(step, initialStates(question.reactions.length)), 350);
  };

  if (screen === "home") return <Home setup={setup} setSetup={setSetup} start={start} muted={muted} setMuted={setMuted} />;
  if (screen === "summary") {
    const totalStars = outcomes.reduce((sum, item) => sum + item.stars, 0);
    const pb = setup.timeAttack ? Number(localStorage.getItem(recordKey(setup))) : 0;
    const elite = setup.mode === "Exam" && setup.difficulty === "Hard" && setup.length === 10 && totalStars === 30;
    return <main className="summary shell"><p className="eyebrow">RUN COMPLETE</p><h1>{elite ? "HESS MASTERY" : "Run completed"}</h1>{elite && <p className="achievement">◆ Perfect 30 / 30 — Exam · Hard · 10 Questions</p>}<div className="summary-score"><strong>{totalStars}</strong><span>/ {run.length * 3} stars</span></div><p>{setup.difficulty} · {setup.mode} · {run.length} Questions</p><p>Best perfect streak: {bestStreak}</p>{setup.timeAttack && <p>Total Time: {formatTime(elapsed)}{elapsed === pb ? " · Personal Best" : ""}</p>}<div className="result-list">{outcomes.map((o, i) => <div key={o.id}><span>{i + 1}. {o.id}</span><span>{"★".repeat(o.stars)}{"☆".repeat(3 - o.stars)}</span><small>{o.skipped ? "Skipped" : `${o.moves} moves · Optimal ${o.optimal}`}</small></div>)}</div><button className="primary" onClick={() => setScreen("home")}>NEW RUN</button></main>;
  }

  return <main className="game"><header className="game-header"><button className="brand-button" onClick={() => setScreen("home")} aria-label="Exit run">HF<span>Hess Flipper</span></button><div className="run-meta"><span>Question {index + 1} / {run.length}</span><span aria-label={`${streak} perfect streak`}>◆ {streak}</span>{setup.timeAttack && <span>{formatTime(elapsed)}</span>}</div><button className="icon-button" onClick={() => setMuted(!muted)} aria-label={muted ? "Unmute" : "Mute"}>{muted ? "SOUND OFF" : "SOUND ON"}</button></header>
    <section className="target-bar"><div className="section-label">TARGET</div><Equation reaction={question.target} /></section>
    <div className="game-grid"><section className="givens"><div className="section-heading"><div><span className="section-label">GIVEN REACTIONS</span><h2>Build the target</h2></div><div className="utility"><button disabled={!undo.length || phase !== "working"} onClick={() => { const previous = undo.at(-1)!; setStates(previous); setUndo((h) => h.slice(0, -1)); }}>UNDO</button><button disabled={phase !== "working"} onClick={() => { setUndo((h) => [...h, states]); setStates(initialStates(states.length)); setPerformance((p) => ({ ...p, moves: p.moves + 1 })); setHint(""); }}>RESET</button></div></div>
      {question.reactions.map((item, i) => <ReactionRow key={item.reactionNo} item={item} state={states[i]} disabled={phase !== "working"} onFlip={() => { const copy = states.map((s) => ({ ...s })); copy[i].flipped = !copy[i].flipped; mutate(copy); }} onScale={(scale) => { const copy = states.map((s) => ({ ...s })); copy[i].scale = scale; mutate(copy); }} />)}
      {phase === "working" && <div className="assist"><button onClick={() => { setHint(nextHint(states, question.solution.map(Rational.parse))); setPerformance((p) => ({ ...p, hintUsed: true })); }}>HINT</button><button onClick={() => { setPerformance((p) => ({ ...p, skipped: true })); setPhase("skipped"); setStreak(0); }}>SKIP</button></div>}
      {hint && <p className="hint"><span>HINT</span>{hint}</p>}
    </section>
    <aside className="result-panel"><span className="section-label">CURRENT RESULT</span><div className={`current-equation ${combo ? "cancelling" : ""}`}><VectorEquation vector={current} order={targetOrder(question)} /></div>{combo > 1 && <div className="combo">COMBO ×{combo}</div>}
      {proportion && !proportion.eq(ONE) && <div className="proportion"><strong>✓ REACTION PROPORTION MATCHED</strong><span>Current result is ×{proportion.toString()} of the target.</span></div>}
      {(phase === "result" || phase === "enthalpy") && <Success question={question} mode={setup.mode} phase={phase} input={examInput} setInput={setExamInput} error={examError} submit={submitExam} performance={performance} next={() => complete()} />}
      {phase === "skipped" && <div className="completion"><p className="eyebrow">QUESTION SKIPPED</p><div className="stars">☆☆☆</div><p>0 stars</p><div className="stack"><button onClick={() => replay()}>SHOW OPTIMAL SOLUTION</button><button className="primary" onClick={() => complete(true)}>NEXT</button></div></div>}
      {phase === "replay" && <div className="completion"><p className="eyebrow">OPTIMAL SOLUTION · {question.optimalMoves} MOVES</p><ol>{question.solution.flatMap((raw, i) => { const v = Rational.parse(raw); const ops = []; if (v.n < 0n) ops.push(`Reaction ${i + 1} → FLIP`); if (!v.abs().eq(ONE)) ops.push(`Reaction ${i + 1} → SCALE ×${v.abs()}`); return ops; }).map((op) => <li key={op}>{op}</li>)}</ol><p>ΔH = {question.finalDeltaH} kJ mol⁻¹</p><div className="stack"><button onClick={() => replay()}>REPLAY</button><button className="primary" onClick={() => complete(true)}>NEXT</button></div></div>}
    </aside></div></main>;
}

function Home({ setup, setSetup, start, muted, setMuted }: { setup: Setup; setSetup: (s: Setup) => void; start: () => void; muted: boolean; setMuted: (v: boolean) => void }) {
  const option = <K extends keyof Setup>(key: K, value: Setup[K]) => setSetup({ ...setup, [key]: value });
  const count = setup.difficulty === "Mixed" ? allQuestions.length : allQuestions.filter((q) => q.difficulty === setup.difficulty).length;
  return <main className="home"><nav><div className="wordmark"><span>HF</span> HESS FLIPPER</div><button className="icon-button" onClick={() => setMuted(!muted)}>{muted ? "SOUND OFF" : "SOUND ON"}</button></nav><section className="hero"><p className="eyebrow">CHEMISTRY ALGEBRA PUZZLE</p><h1>Flip. Scale.<br /><em>Make it cancel.</em></h1><p className="lede">Turn Hess’s Law into a hands-on equation puzzle. Manipulate every reaction until the chemistry resolves to the target.</p><div className="sequence" aria-label="Game sequence"><span>FLIP</span><i>→</i><span>SCALE</span><i>→</i><span>ADD</span><i>→</i><span>CANCEL</span><i>→</i><span>MATCH</span></div></section><section className="setup"><div className="setup-block"><label>DIFFICULTY</label><div className="segmented">{(["Easy", "Medium", "Hard", "Mixed"] as const).map((v) => <button className={setup.difficulty === v ? "active" : ""} onClick={() => option("difficulty", v)} key={v}>{v}</button>)}</div></div><div className="setup-row"><div className="setup-block"><label>MODE</label><div className="segmented">{(["Puzzle", "Exam"] as Mode[]).map((v) => <button className={setup.mode === v ? "active" : ""} onClick={() => option("mode", v)} key={v}>{v}</button>)}</div><small>{setup.mode === "Puzzle" ? "ΔH revealed after the reaction matches" : "Calculate and enter ΔH yourself"}</small></div><div className="setup-block"><label>RUN LENGTH</label><div className="segmented">{([5, 10] as const).map((v) => <button className={setup.length === v ? "active" : ""} onClick={() => option("length", v)} key={v}>{v} Questions</button>)}</div></div></div><label className="switch-row"><span><strong>TIME ATTACK</strong><small>Optional stopwatch · no scoring penalty</small></span><input type="checkbox" checked={setup.timeAttack} onChange={(e) => option("timeAttack", e.target.checked)} /></label>{count < setup.length && <p className="availability">This difficulty has {count} questions; this run will use all {count} without repeats.</p>}<button className="primary start" onClick={start}>START RUN <span>→</span></button></section><footer><span>39 solver-validated puzzles</span><span>No login · Progress stays on this device</span></footer></main>;
}

function ReactionRow({ item, state, disabled, onFlip, onScale }: { item: GameQuestion["reactions"][number]; state: ReactionState; disabled: boolean; onFlip: () => void; onScale: (r: Rational) => void }) {
  const [input, setInput] = useState(state.scale.toString()); const [error, setError] = useState("");
  useEffect(() => setInput(state.scale.toString()), [state.scale]);
  const commit = () => { try { if (!/^\d+(?:\/\d+)?$/.test(input)) throw new Error(); const value = Rational.parse(input); if (value.n <= 0n) throw new Error(); setError(""); onScale(value); } catch { setError("Enter a positive integer or fraction, e.g. 2 or 1/2."); } };
  const parsed = parseReaction(item.equation); const shown = state.flipped ? { ...parsed, left: parsed.right, right: parsed.left } : parsed;
  const delta = parseDeltaH(item.deltaH).value.mul(state.scale).mul(state.flipped ? new Rational(-1) : ONE);
  return <article className={`reaction-row ${state.flipped ? "flipped" : ""}`}><span className="reaction-number">R{item.reactionNo}</span><div className="reaction-main"><div className="reaction-equation"><Equation reaction={{ ...shown, left: shown.left.map((t) => ({ ...t, coefficient: t.coefficient.mul(state.scale) })), right: shown.right.map((t) => ({ ...t, coefficient: t.coefficient.mul(state.scale) })) }} /></div><div className="enthalpy">ΔH = {roundRational(delta, parseDeltaH(item.deltaH).decimalPlaces)} <span>kJ mol⁻¹</span></div></div><div className="controls"><button className={state.flipped ? "flip active" : "flip"} disabled={disabled} onClick={onFlip}>FLIP {state.flipped && "✓"}</button><label>SCALE × <input aria-label={`Scale reaction ${item.reactionNo}`} disabled={disabled} value={input} onChange={(e) => setInput(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === "Enter" && commit()} /></label>{error && <span className="input-error">{error}</span>}</div></article>;
}

function Success({ question, mode, phase, input, setInput, error, submit, performance, next }: { question: GameQuestion; mode: Mode; phase: Phase; input: string; setInput: (v: string) => void; error: string; submit: () => void; performance: Performance; next: () => void }) {
  const stars = starsFor(performance, question.optimalMoves);
  const calculation = question.reactions.map((reaction, i) => {
    const coefficient = Rational.parse(question.solution[i]);
    const oriented = parseDeltaH(reaction.deltaH).value.mul(coefficient.n < 0n ? new Rational(-1) : ONE);
    const signed = `${oriented.n >= 0n ? "+" : ""}${roundRational(oriented, parseDeltaH(reaction.deltaH).decimalPlaces)}`;
    return `${coefficient.abs().eq(ONE) ? "" : coefficient.abs().toString()}(${signed})`;
  }).join(" + ");
  return <div className="completion"><p className="eyebrow">🎯 TARGET MATCHED</p>{mode === "Puzzle" || phase === "result" ? <><div className="calculation"><span>ΔH = {calculation}</span><strong>ΔH = {question.finalDeltaH} kJ mol⁻¹</strong></div><div className="stars">{"★".repeat(stars)}{"☆".repeat(3 - stars)}</div><h3>{stars === 3 ? "PERFECT SOLVE" : "REACTION SOLVED"}</h3><p>{performance.moves} moves · Optimal {question.optimalMoves}</p><button className="primary" onClick={next}>NEXT</button></> : <div className="exam-entry"><label>ΔH = <input autoFocus value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} /> kJ mol⁻¹</label><small>Answer to exactly {question.requiredDp} decimal place{question.requiredDp === 1 ? "" : "s"}.</small>{error && <p className="input-error">{error}</p>}<button className="primary" onClick={submit}>SUBMIT</button></div>}</div>;
}
