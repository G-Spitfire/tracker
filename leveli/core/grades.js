// Pure transformation of schoolGrades/{uid}. No Firebase access and no writes.
const TERM_RE = /^\s*([1-4])\s*четверть\s*$/iu;
const GRADE_RE = /^([1-5])\/5$/;
export function normalizeGrade(record) {
  const type = String(record?.type ?? "").trim();
  const code = String(record?.valueCode ?? "").trim();
  const term = type.match(TERM_RE);
  const grade = code.match(GRADE_RE);
  const kind = type === "Посещаемость" ? "attendance" : term ? "final" : grade ? "current" : "other";
  return {
    id: String(record?.id ?? ""),
    subjectId: String(record?.subjectId ?? ""),
    subject: String(record?.subject ?? ""),
    date: String(record?.date ?? ""),
    type,
    kind,
    quarter: term ? Number(term[1]) : null,
    grade: kind === "current" || kind === "final" ? Number(grade?.[1]) : null,
    valueCode: code,
    value: String(record?.value ?? "")
  };
}
export function normalizeSchoolDocument(document) {
  if (!document || !Array.isArray(document.grades)) throw new TypeError("В документе отсутствует массив grades.");
  const entries = document.grades.map(normalizeGrade);
  return {
    entries,
    current: entries.filter(x => x.kind === "current"),
    finals: entries.filter(x => x.kind === "final"),
    attendance: entries.filter(x => x.kind === "attendance"),
    other: entries.filter(x => x.kind === "other")
  };
}
export function averageGrade(entries) {
  const grades = entries.filter(x => x.kind === "current" && Number.isInteger(x.grade)).map(x => x.grade);
  return grades.length ? grades.reduce((sum,grade) => sum + grade,0)/grades.length : null;
}
