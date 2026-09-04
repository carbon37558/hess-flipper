import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import questions from "./generated/questions.json";
import { enthalpyCalculation, ExamQuestionScreen, Home, RunSummary, type Outcome } from "./App";
import { initialPerformance } from "./game";
import type { GameQuestion } from "./chemistry/engine";

const question = questions[0] as GameQuestion;
const renderExam = (phase: "working" | "result" | "skipped", attempts = 0, error = "") => renderToStaticMarkup(<ExamQuestionScreen question={question} index={0} runLength={5} streak={2} elapsed={0} timeAttack={false} muted={true} setMuted={vi.fn()} input="" setInput={vi.fn()} error={error} phase={phase} performance={{ ...initialPerformance(), examAttempts: attempts }} submit={vi.fn()} skip={vi.fn()} viewWorked={vi.fn()} next={vi.fn()} exit={vi.fn()} />);
const renderHome = (muted = false) => renderToStaticMarkup(<Home setup={{ difficulty: "Mixed", mode: "Puzzle", length: 5, timeAttack: false }} setSetup={vi.fn()} start={vi.fn()} muted={muted} setMuted={vi.fn()} />);
const outcomes = (length: number): Outcome[] => Array.from({ length }, (_, index) => ({ id: `HF${String(index + 1).padStart(3, "0")}`, stars: 3, moves: index === 0 ? 1 : 2, optimal: index === 0 ? 1 : 2, attempts: 1, skipped: false }));

describe("homepage presentation", () => {
  it("shows the refined branding and creator footer without developer metadata", () => {
    const html = renderHome();
    expect(html).toContain("HESS FLIPPER");
    expect(html).not.toContain("CHEMISTRY ALGEBRA PUZZLE");
    expect(html).not.toContain("solver-validated puzzles");
    expect(html).toContain("© 2026");
    expect(html).toContain("WeChat: carbon37558");
    expect(html).toContain('href="mailto:adam51538@hotmail.com"');
    expect(html).toContain("No login · Progress stays on this device");
  });
  it("adds exactly two same-tab Lab links without duplicate attribution", () => {
    const page = document.createElement("div");
    page.innerHTML = renderHome();
    const links = page.querySelectorAll('a[href="https://adams-lab.pages.dev/"]');
    expect(links).toHaveLength(2);
    expect(page.querySelector("nav .lab-return")?.textContent).toBe("← Adam's Lab");
    expect(page.querySelector("footer")?.textContent).toContain("Made by Adam Sun · Adam's Lab");
    expect(page.textContent?.match(/Adam Sun/gi)).toHaveLength(1);
    links.forEach((link) => expect(link.hasAttribute("target")).toBe(false));
    expect(page.querySelectorAll("nav")).toHaveLength(1);
    expect(page.querySelectorAll("footer")).toHaveLength(1);
  });
  it("renders accessible inline SVG controls for both sound states", () => {
    expect(renderHome()).toContain('aria-label="Turn sound off"');
    expect(renderHome()).toContain("SOUND ON");
    expect(renderHome(true)).toContain('aria-label="Turn sound on"');
    expect(renderHome(true)).toContain("SOUND OFF");
    expect(renderHome()).toContain("<svg");
  });
});

describe("exam screen", () => {
  it("shows only static givens and final-answer actions while working", () => {
    const html = renderExam("working");
    expect(html).toContain("GIVEN REACTIONS");
    expect(html).toContain("FINAL ANSWER");
    expect(html).toContain("SUBMIT");
    expect(html).toContain("SKIP");
    expect(html).not.toMatch(/FLIP|SCALE|HINT|CURRENT RESULT|UNDO|RESET|VIEW WORKED SOLUTION/);
    expect(html).toContain("trailing zeros may be omitted");
  });
  it("reveals worked-solution navigation only after a correct answer", () => {
    const html = renderExam("result", 2);
    expect(html).toContain("CORRECT");
    expect(html).toContain("Solved in 2 attempts");
    expect(html).toContain("★★☆");
    expect(html).toContain("VIEW WORKED SOLUTION");
  });
  it("keeps the answer hidden after skip while offering the worked solution", () => {
    const html = renderExam("skipped");
    expect(html).toContain("QUESTION SKIPPED");
    expect(html).toContain("☆☆☆");
    expect(html).not.toContain(question.finalDeltaH);
    expect(html).toContain("VIEW WORKED SOLUTION");
  });
  it("shows only the generic incorrect feedback", () => expect(renderExam("working", 1, "Incorrect")).toContain("Incorrect"));
});

describe("worked enthalpy calculation", () => {
  it("builds the calculation from solver coefficients and original values", () => {
    const calculation = enthalpyCalculation(question);
    expect(calculation).toContain("(");
    expect(calculation.split(" + ")).toHaveLength(question.reactions.length);
  });
});

describe("run summary", () => {
  it("uses run-order labels, hides internal IDs, and pluralizes Puzzle moves", () => {
    const html = renderToStaticMarkup(<RunSummary setup={{ difficulty: "Easy", mode: "Puzzle", length: 5, timeAttack: false }} runLength={5} outcomes={outcomes(5)} bestStreak={5} elapsed={0} personalBest={0} newRun={vi.fn()} />);
    expect(html).toContain("RUN COMPLETE");
    expect(html).toContain("15</strong><span>/ 15 stars");
    expect(html).toContain("Easy · Puzzle · 5 Questions");
    expect(html).toContain("Best perfect streak: 5");
    expect(html).toContain("QUESTION 1");
    expect(html).toContain("QUESTION 5");
    expect(html).toContain("1 move · Optimal 1");
    expect(html).toContain("2 moves · Optimal 2");
    expect(html).not.toMatch(/HF\d{3}|1 moves/);
  });

  it("renders QUESTION 10 without exposing the ten internal IDs", () => {
    const html = renderToStaticMarkup(<RunSummary setup={{ difficulty: "Mixed", mode: "Puzzle", length: 10, timeAttack: false }} runLength={10} outcomes={outcomes(10)} bestStreak={10} elapsed={0} personalBest={0} newRun={vi.fn()} />);
    expect(html).toContain("QUESTION 10");
    expect(html.match(/QUESTION \d+/g)).toHaveLength(10);
    expect(html).not.toMatch(/HF\d{3}/);
  });

  it("preserves Exam, Time Attack, and mastery summary information", () => {
    const html = renderToStaticMarkup(<RunSummary setup={{ difficulty: "Hard", mode: "Exam", length: 10, timeAttack: true }} runLength={10} outcomes={outcomes(10)} bestStreak={10} elapsed={65432} personalBest={65432} newRun={vi.fn()} />);
    expect(html).toContain("HESS MASTERY");
    expect(html).toContain("Perfect 30 / 30 — Exam · Hard · 10 Questions");
    expect(html).toContain("Solved in 1 attempt");
    expect(html).toContain("Personal Best");
  });
});
