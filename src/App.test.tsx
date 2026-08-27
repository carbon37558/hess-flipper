import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import questions from "./generated/questions.json";
import { enthalpyCalculation, ExamQuestionScreen } from "./App";
import { initialPerformance } from "./game";
import type { GameQuestion } from "./chemistry/engine";

const question = questions[0] as GameQuestion;
const renderExam = (phase: "working" | "result" | "skipped", attempts = 0, error = "") => renderToStaticMarkup(<ExamQuestionScreen question={question} index={0} runLength={5} streak={2} elapsed={0} timeAttack={false} muted={true} setMuted={vi.fn()} input="" setInput={vi.fn()} error={error} phase={phase} performance={{ ...initialPerformance(), examAttempts: attempts }} submit={vi.fn()} skip={vi.fn()} viewWorked={vi.fn()} next={vi.fn()} exit={vi.fn()} />);

describe("exam screen", () => {
  it("shows only static givens and final-answer actions while working", () => {
    const html = renderExam("working");
    expect(html).toContain("GIVEN REACTIONS");
    expect(html).toContain("FINAL ANSWER");
    expect(html).toContain("SUBMIT");
    expect(html).toContain("SKIP");
    expect(html).not.toMatch(/FLIP|SCALE|HINT|CURRENT RESULT|UNDO|RESET|VIEW WORKED SOLUTION/);
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
