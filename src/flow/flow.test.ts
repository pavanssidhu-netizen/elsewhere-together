import { describe, expect, it } from 'vitest';
import { FlowController, type FlowEvent } from './flow';

const run = (f: FlowController, ...evs: FlowEvent[]) => evs.forEach(e => f.dispatch(e));
const toForest = (f = new FlowController(1)) => { run(f, { type: 'START' }, { type: 'SKIP' }, { type: 'SELECT', character: 'JENSEN' }); return f; };

describe('flow controller', () => {
  it('starts at the title and walks title -> intro -> select -> forest', () => {
    const f = new FlowController(1);
    expect(f.state).toBe('TITLE');
    run(f, { type: 'START' }); expect(f.state).toBe('COSMIC_INTRO');
    run(f, { type: 'SKIP' }); expect(f.state).toBe('CHARACTER_SELECT');
    run(f, { type: 'SELECT', character: 'SAM' }); expect(f.state).toBe('FOREST_GAME');
    expect(f.snapshot().character).toBe('SAM');
    expect(f.snapshot().forestSeed).not.toBeNull();
  });
  it('forest win -> success beat -> reunion ending -> replay returns to the title', () => {
    const f = toForest();
    run(f, { type: 'FOREST_WON' }); expect(f.state).toBe('FOREST_SUCCESS');
    run(f, { type: 'SKIP' }); expect(f.state).toBe('REUNION_ENDING');
    expect(f.snapshot().ending).toBe('FOREST_REUNION');
    run(f, { type: 'REPLAY' }); expect(f.state).toBe('TITLE');
    expect(f.snapshot().ending).toBeNull();
  });
  it('forest failure -> abduction -> office -> refuse -> soup ending (replayable at once)', () => {
    const f = toForest();
    run(f, { type: 'FOREST_LOST' }, { type: 'CONTINUE' }, { type: 'CONTINUE' });
    expect(f.state).toBe('TIME_MASTER_OFFICE');
    run(f, { type: 'REFUSE' }); expect(f.state).toBe('SOUP_ENDING');
    run(f, { type: 'REPLAY' }); expect(f.state).toBe('TITLE');
  });
  it('accept -> runner win -> repaired ending; runner loss -> retry (new seed) or collapse ending', () => {
    const f = toForest();
    run(f, { type: 'FOREST_LOST' }, { type: 'SKIP' }, { type: 'SKIP' }, { type: 'ACCEPT' });
    expect(f.state).toBe('THREAD_RUNNER');
    const seed1 = f.snapshot().runnerSeed;
    run(f, { type: 'RUNNER_LOST' }); expect(f.state).toBe('RUNNER_FAILURE');
    run(f, { type: 'RETRY' }); expect(f.state).toBe('THREAD_RUNNER');
    expect(f.snapshot().runnerSeed).not.toBe(seed1);
    run(f, { type: 'RUNNER_WON' }, { type: 'SKIP' });
    expect(f.state).toBe('FINAL_ENDING'); expect(f.snapshot().ending).toBe('RUNNER_REPAIRED');
    const g = toForest();
    run(g, { type: 'FOREST_LOST' }, { type: 'SKIP' }, { type: 'SKIP' }, { type: 'ACCEPT' }, { type: 'RUNNER_LOST' }, { type: 'SKIP' });
    expect(g.snapshot().ending).toBe('RUNNER_COLLAPSE');
  });
  it('skipping every cutscene reaches the same states as watching them; skip never leaves a gameplay state', () => {
    const f = toForest();
    run(f, { type: 'SKIP' }); expect(f.state).toBe('FOREST_GAME'); // not skippable
    run(f, { type: 'FOREST_LOST' }, { type: 'SKIP' }, { type: 'SKIP' });
    expect(f.state).toBe('TIME_MASTER_OFFICE');
    run(f, { type: 'SKIP' }); expect(f.state).toBe('TIME_MASTER_OFFICE'); // the choice stays on screen
  });
  it('timers run only in gameplay and never while paused or in cutscenes', () => {
    const f = new FlowController(1);
    expect(f.timersRunning).toBe(false);
    run(f, { type: 'START' }); expect(f.timersRunning).toBe(false);
    run(f, { type: 'SKIP' }, { type: 'SELECT', character: 'JENSEN' }); expect(f.timersRunning).toBe(true);
    run(f, { type: 'PAUSE' }); expect(f.timersRunning).toBe(false);
    run(f, { type: 'FOREST_LOST' }); expect(f.state).toBe('FOREST_GAME'); // a paused game ignores results
    run(f, { type: 'RESUME' }, { type: 'FOREST_LOST' }); expect(f.timersRunning).toBe(false);
  });
  it('seeds are deterministic per base seed and attempt, and differ between attempts', () => {
    const a = toForest(new FlowController(7)), b = toForest(new FlowController(7));
    expect(a.snapshot().forestSeed).toBe(b.snapshot().forestSeed);
    const s1 = a.snapshot().forestSeed;
    run(a, { type: 'FOREST_LOST' }, { type: 'RETRY' });
    expect(a.state).toBe('FOREST_GAME'); expect(a.snapshot().forestSeed).not.toBe(s1);
    expect(a.snapshot().lastOutcome).toMatchObject({ game: 'FOREST', result: 'LOSE', seed: s1, character: 'JENSEN' });
  });
  it('out-of-place events are ignored and never throw; restart is only allowed once unlocked', () => {
    const f = new FlowController(1);
    expect(f.dispatch({ type: 'FOREST_WON' })).toBe(false);
    expect(f.dispatch({ type: 'RESTART_RUNNER' })).toBe(false);
    expect(f.dispatch({ type: 'REPLAY' })).toBe(false);
    toForest(f); expect(f.dispatch({ type: 'RESTART_RUNNER' })).toBe(false); // office not reached yet
    expect(f.dispatch({ type: 'RESTART_FOREST' })).toBe(true); expect(f.state).toBe('FOREST_GAME');
  });
  it('replay clears the character so the full story can be played again (and restart creates no stale state)', () => {
    const f = toForest(); run(f, { type: 'FOREST_WON' }, { type: 'SKIP' }, { type: 'REPLAY' });
    const sn = f.snapshot(); expect(sn.character).toBeNull(); expect(sn.paused).toBe(false); expect(sn.forestSeed).toBeNull();
    run(f, { type: 'START' }, { type: 'SKIP' }, { type: 'SELECT', character: 'SAM' });
    expect(f.state).toBe('FOREST_GAME');
  });
});
