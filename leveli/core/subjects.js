import {normalizeSchoolDocument,averageGrade} from "./grades.js";

// Pure aggregation; preserve unknown and attendance entries separately.
export function groupGradesBySubject(document) {
  const normalized = normalizeSchoolDocument(document);
  const subjects = new Map();
  for (const entry of normalized.entries) {
    const key = entry.subjectId || entry.subject;
    if (!key) continue;
    if (!subjects.has(key)) subjects.set(key,{
      subjectId: entry.subjectId,
      subject: entry.subject,
      current: [], finals: [], attendance: [], other: [],
      average: null
    });
    const subject = subjects.get(key);
    if (!subject.subject && entry.subject) subject.subject = entry.subject;
    if (entry.kind === "current") subject.current.push(entry);
    else if (entry.kind === "final") subject.finals.push(entry);
    else if (entry.kind === "attendance") subject.attendance.push(entry);
    else subject.other.push(entry);
  }
  return [...subjects.values()].map(subject=>({
    ...subject,
    average: averageGrade(subject.current),
    finals: [...subject.finals].sort((a,b)=>(a.quarter??0)-(b.quarter??0))
  })).sort((a,b)=>a.subject.localeCompare(b.subject,"ru"));
}
