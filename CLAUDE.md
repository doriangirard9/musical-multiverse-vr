# CLAUDE.md

## Magic tool

State of the work on `src/tool/kind/magic/MagicTool.ts`, written to be picked up later.

### What it is

A hand tool, sibling of `PencilTool`. Holding the trigger draws a shared stroke exactly like the
pencil does. Releasing it casts a spell: the tool looks for what the drawing was already repeating,
and replays that pattern three more times, each replay carried one period further, so a spiral keeps
spiralling, a staircase keeps climbing, nested squares keep nesting. A drawing that repeats nothing
fizzles: three short haptic pulses, nothing drawn.

Wired in at three places, as every tool kind is:
`MagicTool.ts` itself, the export line in `src/tool/index.ts`, and the `#KINDS` entry in
`src/app/tool/ToolSystem.ts`.

### The one rule everything follows

**Nothing is measured in meters, and nothing is measured per point.**

The stroke is sampled every 50 ms, so the length of one sample says how fast the hand was moving, not
how the drawing is shaped. And a gesture drawn small has to give the same figure as the same gesture
drawn large. So every length in the algorithm is either a ratio of two lengths of the drawing, or a
share of the whole stroke, and every direction comparison is an angle in degrees.

Two earlier versions were thrown away for breaking this rule. Do not reintroduce an absolute
distance without a very good reason.

### How the algorithm works

1. **Capture.** Every tick point is kept in `#points`. No thinning: `DrawingStroke` drops points
   closer than `MIN_DISTANCE` for the drawn curve, but the analysis wants all of them.

2. **Cut into stretches** (`#cut`). The stroke is broken at its elbows into `Stretch`es, each holding
   its point range, direction, length, the elbow angle with the previous stretch, and the unit axis
   that elbow turns around. A cut happens where the stroke bows further than `ELBOW_SHARPNESS` off
   the straight chord of the current run, measured as a share of that chord, never between two
   points, so tremor small next to the run does not create false elbows.
   - While the stroke yields fewer than `MIN_STRETCHES`, the thresholds are loosened by `RELAX` in
     turn. A gently curved stroke comes out in one or two pieces at first and needs this.
   - The loosening is abandoned as soon as the count grows by more than `NOISE_BURST` in one step:
     that is the tremor of the hand being cut up, not the drawing being read more closely.
   - A stroke that never yields enough either way is cut into equal parts. This is what makes a plain
     straight stroke work, with no case of its own for it.
   - **The trailing stretch is always dropped.** The trigger is released wherever it is released, so
     the last piece is a fragment whose length says when the hand stopped, not what was drawn.
     Forgetting this is what made every scale wrong for a long time.

3. **Identity** (`#identityOf`). Each stretch is described by the shape of the `window` elbows behind
   it: for each, the elbow angle, the turn read against the first elbow of the identity, and the
   length of the stretch before it read against the first stretch of the identity. Nothing absolute,
   so two places of a drawing that face different ways and are not the same size still compare.
   `#alike` calls two identities the same within `IDENTITY_ANGLE_DEG` and
   `IDENTITY_LENGTH_TOLERANCE`.

4. **Candidates** (`#select`). The last stretch is looked up among the earlier ones by identity. While
   more than one answers, the window widens by one elbow. Widening also shrinks how many stretches
   are eligible at all, so a round where only one is eligible is kept only for want of a better one:
   it would win by default rather than by resemblance.

5. **Choosing the period** (`#periodOf`, `#fitBetween`). Resemblance alone is not enough, and never
   settles on a regular drawing. Every answering stretch names a candidate period, and each is tried
   out: the two periods before the end of the stroke are resampled to `SAMPLES` evenly spaced points,
   and a similarity is fitted from the earlier one onto the later one. The candidate kept is the one
   whose fit lands closest. If even the best lands further than `MAX_RESIDUAL`, the drawing repeats
   nothing and the spell fizzles.

   The fit is the classic closed form: a 4x4 matrix built from the cross covariance of the two runs,
   whose largest eigenvector is the quaternion of the best rotation, reached by iterating the matrix
   on a vector. Then a least squares scale, then the translation. It is fitted to all the points
   because two directions barely tell apart on a smooth stroke, and because a motion that also
   travels, as a helix does, cannot be expressed by a pair of directions at all.

6. **Repetition** (`#cast`). Everything drawn after the chosen stretch is one period. It is passed
   through the fitted motion and drawn, three times, each pass starting from the previous result.

### Test bench

`src/tool/kind/magic/magic.bench.mjs` is a plain-JS replica of the whole analysis, run on synthetic
strokes with 4 mm of simulated tremor. It has no dependencies.

```sh
node src/tool/kind/magic/magic.bench.mjs
MS=6 MR=0.35 node src/tool/kind/magic/magic.bench.mjs   # override MIN_STRETCHES and MAX_RESIDUAL
```

It prints, per stroke: the stretch count and how they were cut, the period found, the scale, the
residual, and where the three repetitions actually land, so a wrong answer is visible without a
headset. **It is a replica, not the tool itself: any change to the algorithm has to be made in both.**
It exists because most of the wrong turns on this tool were found by running it, and none by
reasoning.

Current results, all with tremor:

| stroke | period | scale found | true scale | verdict |
| --- | --- | --- | --- | --- |
| straight line | 2 | 1.02 | 1.00 | carries straight on |
| staircase | 2 | 1.03 | 1.00 | keeps climbing |
| staircase, steps growing | 2 | 1.27 | 1.25 | steps keep growing |
| spiral x1.5 | 2 | 1.15 | 1.14 | keeps opening |
| same spiral, drawn 4x larger | 2 | 1.15 | 1.14 | same answer, which is the point |
| nested squares | 1 | 1.24 | 1.20 | keeps nesting |
| nested circles | 2 | 1.09 | 1.11 | keeps nesting |
| nested curves | 4 | 1.20 | 1.20 | keeps advancing |
| dna helix | 2 | 1.13 | 1.00 | advances, but swells |
| whirlpool | 1 | 0.96 | 0.94 | keeps closing in |
| arc studded with spikes | 2 | 0.97 | 1.00 | spikes carry on along the arc |
| bell lob | varies | varies | | passes about half the time |
| scribble | | | | fizzles, as it should |

### Left to do

- **The helix swells.** Its period comes out at a scale near 1.13 where a helix of constant radius
  should give 1.00, so a repeated helix grows instead of running true. The advance along the axis is
  right; only the scale is off. Suspect the scale being fitted on two periods that do not start at
  the same phase.
- **The bell lob is intermittent.** A single arc holds barely any period, so depending on the tremor
  it either finds one or reports no fittable candidate. Raising `MIN_STRETCHES` to 8 made it pass
  more often, not always. A lone arc arguably has no pattern to repeat, so the question of what it
  should do is open.
- **`DEBUG` is still `true`** at the top of `MagicTool.ts`. Every cast prints the cut, the period,
  the scale and the residual to the console. Turn it off once the two points above are settled.
- The thresholds were calibrated on the bench, not in a headset. `ELBOW_SHARPNESS`, `MIN_STRETCHES`
  and `MAX_RESIDUAL` are the three worth revisiting against real hands.

### Settled, do not redo

- The stroke is cut on elbows, not on a fixed length or a fixed count. Anything else stops being a
  property of the drawing.
- `S` and the last stretch are the corresponding pair. Aligning the start of the pattern with the
  last stretch instead was tried and measured: the repetitions fold back on themselves.
- The identity cannot tell the two phases of a staircase apart, and no tolerance fixes it: both
  phases have the same relative sequence, since each is read against its own first elbow. That is why
  the choice is settled by fitting, not by resemblance.
- The trailing stretch is dropped. See step 2.

---

The previous contents of this file were a set of coding conventions, deleted before this work
started. They are still in git at `HEAD:CLAUDE.md` if any of them are wanted back. One of them is
worth keeping in mind here: no em dashes in comments.
