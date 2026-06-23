# Guided Tutorial Storyboard

## Purpose

The tutorial is a solo, temporary session using the normal scene, shop, plugins,
connections, parameters and transport. It teaches one complete musical signal
path without introducing tutorial-only audio objects:

`LivePiano -> Pro54 -> Ping Pong Delay -> Audio Output`

The current objective remains visible both in the browser HUD and in a
lightweight world-space panel. Successful actions receive a green confirmation
before the next objective appears. Incorrect but valid actions are never
deleted; the tutorial explains what is expected and lets the user continue.

## Steps

| Step | Musical idea | Objective | Validation | Success feedback |
| --- | --- | --- | --- | --- |
| 1 | The shop is the toolbox | Open the shop | Shop opened | Introduce the four available building blocks |
| 2 | MIDI creates intentions | Add LivePiano | Piano node exists | Explain that the keyboard sends notes, not audio |
| 3 | An instrument creates sound | Add Pro54 | Pro54 node exists | Identify the synth as the voice of the graph |
| 4 | MIDI routing | Connect piano to Pro54 | Correct MIDI connection exists | Confirm that notes now reach the synth |
| 5 | Effects transform audio | Add Ping Pong Delay | Delay node exists | Introduce input, processing and output |
| 6 | Audio routing into an effect | Connect Pro54 to delay | Correct audio connection exists | Explain MIDI/green versus audio/red |
| 7 | A circuit needs a destination | Play a piano key | Piano button pressed | Explain that silence is expected without an audio output |
| 8 | Audio needs a destination | Add Audio Output | Output node exists | Identify the final destination |
| 9 | Complete the graph | Connect delay to output | Correct audio connection exists | Celebrate the first complete circuit |
| 10 | Live performance | Play three notes | Three piano presses | Confirm that the full chain is playable |
| 11 | Sound design at the source | Change a Pro54 parameter | User parameter event on Pro54 | Explain timbre shaping |
| 12 | Sound design in the effect | Change a delay parameter | User parameter event on delay | Explain Mix, Time and Feedback |
| 13 | Shared musical clock | Spawn a configured Sequencer 16 → Drum → Output chain, then start transport | Beat chain is ready and global transport is playing | Make every beat visible with a lightweight pulse |
| 14 | Tempo control | Change BPM | Tempo differs from its initial value | Hear and see the beat follow the new tempo, then invite live improvisation |

## Error And Variant Handling

- If the user opens the wrong top-level shop section, the current objective is
  repeated and the expected section is named.
- If the user creates a different tutorial module early, it is kept. The
  tutorial explains at which later step it will be used.
- If a required node or connection already exists when its step begins, that
  step completes automatically.
- If the user creates another valid connection, it is kept and the requested
  connection is restated.
- Precise ports remain the primary connection targets. Whole-object release
  still follows the application's unique-compatible-port rule.
- Reopening and closing menus does not reset progress.
- Tutorial sessions accept one participant, never save CRDT data and do not
  appear in the public session browser.
- A newly created temporary session has a five-minute first-join grace period,
  allowing time for headset loading, certificate acceptance and WebAudio/WebXR
  authorization.

## Performance Budget

- No per-frame tutorial graph traversal.
- One lightweight world-space GUI panel follows the camera.
- Progress reacts to existing observables for nodes, connections, buttons,
  parameters and transport.
- Tutorial shop factories are filtered before loading, so unrelated plugins and
  thumbnails are not initialized.
- Reward effects are limited to color transitions and one short browser toast.
- The final beat uses GM notes 36 (kick), 38 (snare) and 39 (clap).

## First User-Test Questions

- Is the world-space objective readable without obstructing the graph?
- Is the delay introduced at the right moment, or should audio output come first?
- Does requiring three notes feel rewarding or repetitive?
- Are green MIDI and red audio explanations sufficient without extra arrows?
- Is the transport section useful in this first tutorial, or better suited to a
  second sequencer-focused lesson?
