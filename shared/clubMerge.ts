// Combines two copies of the saved book clubs (e.g. this phone's and the synced copy).
// Clubs are matched by id; within a club, members are matched by id. Nothing is dropped:
// anything on either side is kept, and where both sides have the same member, the
// incoming (synced) copy wins.

export type SyncedMember = { id: string; [k: string]: unknown };
export type SyncedClub<M extends SyncedMember = SyncedMember> = { id: string; name: string; members: M[] };

export function mergeClubs<C extends SyncedClub>(local: C[], incoming: C[]): C[] {
  const out: C[] = incoming.map((c) => ({ ...c, members: [...c.members] }));
  for (const lc of local) {
    const match = out.find((c) => c.id === lc.id);
    if (!match) {
      out.push({ ...lc, members: [...lc.members] });
      continue;
    }
    for (const m of lc.members) {
      if (!match.members.some((x) => x.id === m.id)) match.members.push(m);
    }
  }
  return out;
}

/** True when two club lists hold the same clubs and members (ignores order of keys). */
export function sameClubs(a: SyncedClub[], b: SyncedClub[]) {
  return JSON.stringify(a) === JSON.stringify(b);
}
