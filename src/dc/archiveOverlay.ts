// Bonus: the old causal archive (DOM + SVG) shown over the game after the forest. Optional, never forced.
import type { SimulationState } from '../sim/types';
import { ArchiveView } from '../ui/archive';
import type { DCSession } from './contracts';

export function openForestArchive(session: DCSession, onClose: () => void): void {
  const state = session.forestState as SimulationState | null;
  if (!state) return;
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;inset:0;z-index:50;background:#0b0f1c;pointer-events:auto;overflow:hidden';
  host.className = 'screen archive open';
  document.body.appendChild(host);
  const close = () => { host.remove(); onClose(); };
  new ArchiveView(host, state, { restart: close, close });
}
