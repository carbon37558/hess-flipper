import fs from "node:fs";
import path from "node:path";
import XLSX from "xlsx";
import { calculateDeltaH, isBalanced, optimalMoves, parseDeltaH, parseReaction, Rational, requiredDecimalPlaces, roundRational, solve, vectorsEqual, reactionVector, type GameQuestion } from "../src/chemistry/engine.ts";

const workbookPath = path.resolve("data/hess_flipper_questions.xlsx");
const outputPath = path.resolve("src/generated/questions.json");
const fail = (id: string, message: string): never => { throw new Error(`[${id}] ${message}`); };

if (!fs.existsSync(workbookPath)) fail("WORKBOOK", "Missing data/hess_flipper_questions.xlsx");
const workbook = XLSX.readFile(workbookPath, { cellText: true, raw: false });
for (const name of ["QUESTIONS", "REACTIONS", "README"]) if (!workbook.Sheets[name]) fail("WORKBOOK", `Missing sheet ${name}`);

const questions = XLSX.utils.sheet_to_json<Record<string, string>>(workbook.Sheets.QUESTIONS, { raw: false, defval: "" });
const reactionRows = XLSX.utils.sheet_to_json<Record<string, string>>(workbook.Sheets.REACTIONS, { raw: false, defval: "" });
const requireColumns = (sheet: string, required: string[]) => {
  const headers = XLSX.utils.sheet_to_json<string[]>(workbook.Sheets[sheet], { header: 1, raw: false })[0] ?? [];
  for (const column of required) if (!headers.includes(column)) fail(sheet, `Missing required column ${column}`);
};
requireColumns("QUESTIONS", ["question_id", "difficulty", "target", "source"]);
requireColumns("REACTIONS", ["question_id", "reaction_no", "reaction", "delta_h"]);

const ids = new Set<string>();
const validDifficulties = new Set(["Easy", "Medium", "Hard"]);
for (const q of questions) {
  if (!q.question_id) fail("QUESTIONS", "Blank question_id");
  if (ids.has(q.question_id)) fail(q.question_id, "Duplicate question_id");
  ids.add(q.question_id);
  if (!validDifficulties.has(q.difficulty)) fail(q.question_id, `Invalid difficulty ${q.difficulty}`);
}
for (const row of reactionRows) if (!ids.has(row.question_id)) fail(row.question_id || "REACTIONS", "Orphan reaction");

const generated: GameQuestion[] = questions.map((q) => {
  try {
    const rows = reactionRows.filter((r) => r.question_id === q.question_id).sort((a, b) => Number(a.reaction_no) - Number(b.reaction_no));
    if (!rows.length) fail(q.question_id, "No Given Reactions");
    rows.forEach((r, i) => { if (!/^\d+$/.test(r.reaction_no) || Number(r.reaction_no) !== i + 1) fail(q.question_id, `reaction_no must be continuous from 1 (found ${r.reaction_no})`); });
    const target = parseReaction(q.target);
    if (!isBalanced(target)) fail(q.question_id, "Target reaction is not chemically balanced");
    const givens = rows.map((r) => {
      const parsed = parseReaction(r.reaction);
      if (!isBalanced(parsed)) fail(q.question_id, `Reaction ${r.reaction_no} is not chemically balanced`);
      return parsed;
    });
    const deltaHs = rows.map((r) => parseDeltaH(r.delta_h));
    const solution = solve(givens, target);
    if (solution.some((v) => v.isZero())) fail(q.question_id, "Solver leaves an unused Given Reaction");
    const solved = givens.map((r, i) => reactionVector(r, { flipped: solution[i].n < 0n, scale: solution[i].abs() }));
    const sum = new Map<string, Rational>();
    solved.forEach((vector) => vector.forEach((value, id) => sum.set(id, (sum.get(id) ?? new Rational(0)).add(value))));
    if (!vectorsEqual(sum, reactionVector(target))) fail(q.question_id, "Solver verification failed");
    const moves = optimalMoves(solution);
    if (moves === 0) fail(q.question_id, "Zero-move puzzle is invalid");
    const dp = requiredDecimalPlaces(deltaHs, solution);
    const enthalpy = calculateDeltaH(deltaHs, solution);
    return {
      questionId: q.question_id,
      difficulty: q.difficulty as GameQuestion["difficulty"],
      target: q.target,
      reactions: rows.map((r) => ({ reactionNo: Number(r.reaction_no), equation: r.reaction, deltaH: r.delta_h })),
      solution: solution.map(String),
      optimalMoves: moves,
      finalDeltaH: roundRational(enthalpy, dp),
      requiredDp: dp,
    };
  } catch (error) {
    return fail(q.question_id, error instanceof Error ? error.message : String(error));
  }
});

if (!process.argv.includes("--check")) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(generated, null, 2)}\n`);
}
console.log(`Validated ${generated.length} questions and ${reactionRows.length} Given Reactions.`);
