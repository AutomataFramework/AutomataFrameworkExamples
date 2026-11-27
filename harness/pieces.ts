// Which pod runs which case. One pod a run for now; when a measured run passes the job's time limit, the cases are
// split here across up to 3 pods (the pod limit). A test checks every case sits in exactly one piece.
export const pieces: string[][] = [['1a/starter-wins-on-phone']]

/** The ids in piece `n` (counted from 1), or why there is no such piece. */
export function piece(n: number): string[] {
  const ids = pieces[n - 1]
  if (!ids) throw new Error(`There is no piece ${n}; there are ${pieces.length}.`)
  return ids
}

/** Every way the pieces and the cases disagree: a case in no piece or in two, or a piece naming a case that is gone. */
export function pieceProblems(caseIds: string[], list: string[][] = pieces): string[] {
  const problems: string[] = []
  for (const id of caseIds) {
    const count = list.filter((p) => p.includes(id)).length
    if (count !== 1) problems.push(`${id} is in ${count} pieces; it must be in exactly one (harness/pieces.ts).`)
  }
  for (const id of list.flat()) if (!caseIds.includes(id)) problems.push(`harness/pieces.ts names ${id}, which is not a case.`)
  return problems
}
