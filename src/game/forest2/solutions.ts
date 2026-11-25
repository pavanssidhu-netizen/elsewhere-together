// Reference solutions in the BASE (identity) orientation as token strings, transformed per room variant.
// Tokens: N E S W = move (or free turn when blocked), A, B, L = END_LOOP, optional repeat count (E3).
import type { Input, Order, RoomId } from './api';
import { roomVariant, transformDir } from './rooms';

interface Base { phase1: string; phase2: string }
const BASE: Record<RoomId, Record<Order, Base>> = {
  1: {
    PAST_FIRST: { phase1: 'W A N3 A S2 E A B E A E N E L', phase2: 'N2 W A S E3 S2 A N E S N S N' },
    FUTURE_FIRST: { phase1: 'N2 W A S E E B E2 S2 A N E L', phase2: 'W A N3 A S2 E A B E A E N E' },
  },
  2: {
    PAST_FIRST: { phase1: 'N W A E2 S2 A B E A W S2 E A E L', phase2: 'N2 A S E2 S E3 A N2 S N S N' },
    FUTURE_FIRST: { phase1: 'N E A N A S E2 S E B E3 A N2 L', phase2: 'E2 S A B W A E A W S2 E A E' },
  },
  3: {
    PAST_FIRST: { phase1: 'S A E S A E A B E A W S W A A N3 L', phase2: 'S E A E2 S3 E A N3 E2 A E2 W' },
    FUTURE_FIRST: { phase1: 'S E A E2 S B S3 E A N3 E B E2 A E L', phase2: 'S A S A E2 A B E A W S W A A A N3' },
  },
};

function parse(src: string, v: ReturnType<typeof roomVariant>): Input[] {
  const out: Input[] = [];
  for (const tok of src.split(/\s+/).filter(Boolean)) {
    const c = tok[0];
    const n = tok.length > 1 ? parseInt(tok.slice(1), 10) : 1;
    for (let i = 0; i < n; i++) {
      if (c === 'A') out.push({ t: 'A' });
      else if (c === 'B') out.push({ t: 'B' });
      else if (c === 'L') out.push({ t: 'END_LOOP' });
      else out.push({ t: 'MOVE', dir: transformDir(c as 'N' | 'E' | 'S' | 'W', v) });
    }
  }
  return out;
}

export function referenceSolution(roomId: RoomId, order: Order, seed: number): { phase1: Input[]; phase2: Input[] } {
  const v = roomVariant(seed);
  const b = BASE[roomId][order];
  return { phase1: parse(b.phase1, v), phase2: parse(b.phase2, v) };
}
