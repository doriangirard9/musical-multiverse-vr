import { ImportMeshAsync, Quaternion, TransformNode, Vector3 } from "@babylonjs/core"
import { Tool } from "../../Tool"
import { ToolKind } from "../../ToolKind"
import { ToolContext } from "../../ToolContext"
import { DrawingStroke, DrawingSystem } from "../../../app/social/DrawingSystem"
import MAGIC_MODEL_URL from "./magic.glb?url"
import THUMBNAIL_URL from "./thumbnail.png?url"

/**
 * The distance from the controller to the tip of the wand, where the stroke is drawn. It is also
 * the length of the wand, whose base rests on the hand.
 */
const TIP_DISTANCE = 0.2

/**
 * The half turn putting the wand the right way round.
 *
 * The model already lies along the axis the hand points at, but with its tip towards the wrist:
 * the glTF has it pointing towards -Z, which the axis conversion of the import turns into +Z.
 */
const MODEL_YAW = Math.PI

/** The delay between two points of a stroke, in milliseconds. */
const STROKE_INTERVAL = 50

/**
 * How far the stroke may bow away from a straight run before an elbow is called, as a share of the
 * length of that run.
 *
 * Being a share and not a distance, it reads the same shape out of a drawing whatever its size. And
 * being measured against the whole run rather than between two points, the shake of a hand, small
 * next to the run it happens on, does not shatter a smooth stroke into false elbows.
 */
const ELBOW_SHARPNESS = 0.15

/**
 * The least a stretch may be long, as a share of the whole stroke.
 *
 * Over two or three points the shake of a hand is larger than the run it happens on, so an elbow
 * read that close is tremor rather than drawing. Waiting for this much stroke before calling an
 * elbow leaves the shake averaged out inside the run.
 */
const MIN_STRETCH = 0.04

/**
 * How far {@link ELBOW_SHARPNESS} and {@link MIN_STRETCH} are loosened, in turn, while the stroke
 * yields too few stretches to read.
 *
 * A gently curved stroke bows little against any of its own chords, so at first reading it comes out
 * in one or two pieces; loosening lets the curve be followed more closely.
 */
const RELAX = [1, 0.5, 0.25, 0.125]

/**
 * A stretch count growing by this much under a single loosening is taken for tremor being cut up
 * rather than a drawing being read more closely, and the loosening stops there.
 */
const NOISE_BURST = 4

/** How many stretches a stroke has to be read in before anything can be recognised in it. */
const MIN_STRETCHES = 8

/** How many elbows back a stretch is recognised on at first, before the window has to widen. */
const MIN_WINDOW = 2

/**
 * The angle below which an elbow counts as none at all, in degrees.
 *
 * The axis an elbow turns around comes from a cross product of the two directions it joins, and on
 * a bend this shallow those are almost the same direction: the axis is then rounding error pointing
 * anywhere, and reading a turn off it would compare noise to noise.
 */
const FLAT_ELBOW_DEG = 12

/** How far two angles of an identity may stray from each other and still be called the same, in degrees. */
const IDENTITY_ANGLE_DEG = 25

/** How far two lengths of an identity may stray from each other, as a share of the larger one. */
const IDENTITY_LENGTH_TOLERANCE = 0.4

/** How many points a period is compared on when the repetition is fitted to it. */
const SAMPLES = 24

/**
 * How far the repetition may sit from the drawing it was fitted to, as a share of the size of a
 * period, before the drawing is called unrepeating.
 *
 * A scribble does have stretches that resemble one another by chance, but no motion carries one part
 * of it onto another, so its best fit still lands far away; a real pattern lands within a few
 * percent.
 */
const MAX_RESIDUAL = 0.2

/** The smallest scale a pattern may be repeated with, below which the spell fizzles. */
const MIN_SCALE = 0.2

/** The largest scale a pattern may be repeated with, above which the spell fizzles. */
const MAX_SCALE = 5

/** How many times the pattern is repeated. */
const REPEAT_COUNT = 3

/** The strength of one pulse of the haptic feedback of a failed spell. */
const FIZZLE_STRENGTH = 0.6

/** The duration of one pulse of the haptic feedback of a failed spell, in milliseconds. */
const FIZZLE_DURATION = 40

/** When the pulses of the haptic feedback of a failed spell are fired, in milliseconds. */
const FIZZLE_DELAYS = [0, 70, 140]

/** Lengths below this are treated as zero. */
const EPSILON = 1e-9

/** Whether every cast reports to the console what it read in the stroke and what it did with it. */
const DEBUG = true

/**
 * A run of the stroke between two elbows, the unit the drawing is read in.
 *
 * @remarks
 * Cutting the stroke on its elbows rather than on a length or on a delay is what makes the reading
 * belong to the drawing: a stretch is a feature the hand drew, so counting and comparing stretches
 * says the same thing about a gesture whatever its size and whatever speed it was drawn at.
 */
interface Stretch {

    /** Where in the stroke the stretch starts. */
    from: number

    /** Where in the stroke the stretch ends. */
    to: number

    /** The direction from its start to its end, of unit length. */
    direction: Vector3

    /** The distance from its start to its end. */
    length: number

    /** The angle of the elbow it makes with the stretch before it, in radians. */
    angle: number

    /** The unit axis that elbow turns around, or a zero vector when the bend is too shallow to have one. */
    axis: Vector3

}

/**
 * One step backwards over an elbow, as the identity of a stretch is made of.
 *
 * @remarks
 * Nothing in it is a length or an absolute direction: an angle, a turn read against the first elbow
 * of the identity, and a length read against the first stretch of it. Two gestures of the same shape
 * therefore have the same identity however large, however turned, and wherever they were drawn.
 */
interface Step {

    /** The angle of the elbow, in radians. */
    angle: number

    /** How far the elbow turns around another axis than the first elbow of the identity, in radians. */
    turn: number

    /** The length of the stretch before the elbow, over the length of the first one of the identity. */
    ratio: number

}

/** A similarity fitted to two parts of a drawing, and how far it lands from the one it was fitted to. */
interface Repetition {

    /** Carry a point one period forward. */
    apply(point: Vector3): Vector3

    /** How much larger a period is than the one before it. */
    scale: number

    /** The mean distance from the fit to the drawing, as a share of the size of a period. */
    residual: number

}

/**
 * The hand holding a magic wand: pressing the trigger draws a stroke like a pencil does, but
 * releasing it casts a spell repeating what the drawing was already repeating.
 *
 * @remarks
 * The stroke is first cut on its elbows into {@link Stretch}es, then each stretch is given an
 * identity: the shape of the few elbows behind it, in angles and length ratios only. The stretch the
 * stroke ends on is looked up among the others by that identity; while more than one answers, the
 * identity is widened by one more elbow. Every stretch that answers names a candidate period, and
 * the one kept is the period whose motion, fitted to the drawing, really does carry it onto itself.
 * Everything drawn after that stretch is then replayed {@link REPEAT_COUNT} times, each replay
 * carried one period further by that same motion.
 *
 * Nothing is ever measured in meters or per point. Lengths only ever appear as ratios and angles as
 * angles, so the same gesture drawn small or large, slowly or quickly, gives the same figure.
 */
export class MagicTool implements Tool {

    constructor(context: ToolContext){
        this.#context = context
        this.#loadModel()

        this.#trigger = context.controller.trigger.setPressInterval(
            STROKE_INTERVAL,
            () => this.#add(this.#tipPosition()),
            () => { this.#points = []; this.#stroke = DrawingSystem.getInstance().startStroke() },
            () => { this.#cast(); this.#stroke = null; this.#points = [] },
        )
    }

    public dispose(): void {
        this.#trigger.remove()
        this.#stroke = null
        this.#points = []
        for(const timeout of this.#fizzleTimeouts) clearTimeout(timeout)
        this.#fizzleTimeouts = []
        this.#isDisposed = true
        this.#model?.dispose(false, true)
        this.#model = undefined
    }

    readonly #context: ToolContext

    readonly #trigger: { remove(): void }

    #stroke: DrawingStroke | null = null

    /** The points of the stroke being drawn, which {@link DrawingStroke} does not give back. */
    #points: Vector3[] = []

    #fizzleTimeouts: ReturnType<typeof setTimeout>[] = []

    #model?: TransformNode

    #isDisposed = false

    /** The world position of the tip of the wand, where the stroke is drawn. */
    #tipPosition(): Vector3 {
        const pointer = this.#context.controller.pointer
        return pointer.origin.add(pointer.forward.scale(TIP_DISTANCE))
    }

    /**
     * Append a point to the stroke.
     *
     * @remarks
     * Every point is kept, uneven as they are: the drawing drops the ones closer than
     * {@link DrawingStroke.MIN_DISTANCE} to keep the curve light, but the spell reads the stroke by
     * its elbows, and a coarser stroke would only round them off.
     */
    #add(point: Vector3): void {
        if(this.#stroke === null) return
        this.#stroke.add(point)
        this.#points.push(point)
    }

    /** The arc length of the stroke from its start to each of its points. */
    #arcLengths(): number[] {
        const lengths = [0]
        for(let i = 1; i < this.#points.length; i++)
            lengths.push(lengths[i - 1] + Vector3.Distance(this.#points[i - 1], this.#points[i]))
        return lengths
    }

    /** Whether the stroke bows further than a share off the straight line between two of its points. */
    #bows(from: number, to: number, sharpness: number): boolean {
        const start = this.#points[from]
        const chord = this.#points[to].subtract(start)
        const span = chord.length()
        if(span < EPSILON) return false

        const direction = chord.scale(1 / span)
        const limit = sharpness * span
        for(let k = from + 1; k < to; k++){
            const offset = this.#points[k].subtract(start)
            const along = direction.scale(Vector3.Dot(offset, direction))
            if(offset.subtract(along).length() > limit) return true
        }
        return false
    }

    /** Where the stroke bends, as the indices bounding each of its straight runs. */
    #elbows(sharpness: number, shortest: number): number[] {
        const arcs = this.#arcLengths()
        const floor = shortest * arcs[arcs.length - 1]
        const bounds = [0]
        let from = 0

        for(let to = 2; to < this.#points.length; to++){
            if(arcs[to] - arcs[from] < floor) continue
            if(this.#bows(from, to, sharpness) === false) continue
            bounds.push(to - 1)
            from = to - 1
        }

        bounds.push(this.#points.length - 1)
        return bounds
    }

    /** The same bounds, but cut into equal parts, for a stroke with no bend to be cut on. */
    #equalParts(count: number): number[] {
        const arcs = this.#arcLengths()
        const total = arcs[arcs.length - 1]
        const bounds = [0]

        for(let part = 1; part < count; part++){
            let index = bounds[bounds.length - 1] + 1
            while(index < this.#points.length - 1 && arcs[index] < total * part / count) index++
            bounds.push(index)
        }

        bounds.push(this.#points.length - 1)
        return bounds
    }

    /** Turn bounds into stretches, each knowing the elbow it makes with the one before it. */
    #build(bounds: number[]): Stretch[] {
        const stretches: Stretch[] = []

        for(let k = 1; k < bounds.length; k++){
            const from = bounds[k - 1]
            const to = bounds[k]
            if(to <= from) continue

            const chord = this.#points[to].subtract(this.#points[from])
            const length = chord.length()
            if(length < EPSILON) continue

            const direction = chord.scale(1 / length)
            const before = stretches[stretches.length - 1]
            const angle = before === undefined ? 0 : Math.acos(Math.min(1, Math.max(-1, Vector3.Dot(before.direction, direction))))
            const axis = before === undefined ? Vector3.Zero() : Vector3.Cross(before.direction, direction)
            const turn = axis.length()

            // Too shallow a bend has no axis worth the name, only the rounding error of two nearly
            // equal directions, so it is left without one rather than turning noise into a turn.
            const bent = angle > FLAT_ELBOW_DEG * Math.PI / 180 && turn > EPSILON

            stretches.push({ from, to, direction, length, angle, axis: bent ? axis.scale(1 / turn) : Vector3.Zero() })
        }
        return stretches
    }

    /**
     * Cut the stroke into the stretches its elbows delimit.
     *
     * @remarks
     * The threshold is loosened while the stroke comes out in too few pieces to read, which is what
     * a gently curved stroke does, and the loosening is abandoned as soon as the count explodes,
     * which is what a straight stroke does once the threshold reaches the tremor of the hand. A
     * stroke that never yields enough either way is simply cut into equal parts, so that even one
     * without a single bend has stretches to compare and carries straight on.
     *
     * The trailing stretch is dropped in every case: the trigger is released wherever it is
     * released, so that last piece is a fragment of a stretch, and its length would say more about
     * when the hand stopped than about the drawing.
     */
    #cut(): { stretches: Stretch[], how: string } {
        let previous: number | null = null

        for(const relax of RELAX){
            const stretches = this.#build(this.#elbows(ELBOW_SHARPNESS * relax, MIN_STRETCH * relax))
            if(previous !== null && stretches.length > previous * NOISE_BURST) break
            if(stretches.length > MIN_STRETCHES) return { stretches: stretches.slice(0, -1), how: `elbows at ${relax}` }
            previous = stretches.length
        }

        return { stretches: this.#build(this.#equalParts(MIN_STRETCHES + 1)).slice(0, -1), how: "equal parts" }
    }

    /**
     * How a stretch recognises itself: the shape of the elbows behind it, in angles and ratios only.
     *
     * @remarks
     * The first elbow going back is the reference the others are read against, so the first step
     * always comes out as a turn of zero and a ratio of one. That is what makes an identity
     * comparable between two places of the drawing that face different ways and are not the same
     * size: only the shape of the gesture survives it.
     *
     * @param stretches - The stretches of the whole stroke.
     * @param index - The stretch the identity is taken of.
     * @param window - How many elbows back it reaches.
     * @returns The identity, or `null` when the stroke does not reach that far back.
     */
    static #identityOf(stretches: Stretch[], index: number, window: number): Step[] | null {
        if(index - window < 0) return null

        const reference = stretches[index]
        const unit = stretches[index - 1].length
        if(unit < EPSILON) return null

        const steps: Step[] = []
        for(let back = 0; back < window; back++){
            const at = stretches[index - back]
            const flat = at.axis.lengthSquared() < 0.5 || reference.axis.lengthSquared() < 0.5
            steps.push({
                angle: at.angle,
                turn: flat ? 0 : Math.acos(Math.min(1, Math.max(-1, Vector3.Dot(at.axis, reference.axis)))),
                ratio: stretches[index - back - 1].length / unit,
            })
        }
        return steps
    }

    /** Whether two identities are close enough to be called the same gesture. */
    static #alike(one: Step[], other: Step[]): boolean {
        const tolerance = IDENTITY_ANGLE_DEG * Math.PI / 180

        for(let k = 0; k < one.length; k++){
            if(Math.abs(one[k].angle - other[k].angle) > tolerance) return false
            if(Math.abs(one[k].turn - other[k].turn) > tolerance) return false

            const larger = Math.max(one[k].ratio, other[k].ratio)
            if(larger > EPSILON && Math.abs(one[k].ratio - other[k].ratio) / larger > IDENTITY_LENGTH_TOLERANCE) return false
        }
        return true
    }

    /** A run of the stroke, retaken as evenly spaced points, so two runs can be compared one to one. */
    #evenly(from: number, to: number, count: number): Vector3[] {
        const points = this.#points.slice(from, to + 1)
        const arcs = [0]
        for(let i = 1; i < points.length; i++) arcs.push(arcs[i - 1] + Vector3.Distance(points[i - 1], points[i]))

        const total = arcs[arcs.length - 1]
        if(points.length < 2 || total < EPSILON) return Array.from({ length: count }, () => points[0] ?? Vector3.Zero())

        const even: Vector3[] = []
        for(let k = 0; k < count; k++){
            const at = total * k / (count - 1)
            let i = 1
            while(i < points.length - 1 && arcs[i] < at) i++
            const span = arcs[i] - arcs[i - 1]
            even.push(Vector3.Lerp(points[i - 1], points[i], span < EPSILON ? 0 : (at - arcs[i - 1]) / span))
        }
        return even
    }

    /**
     * The similarity carrying one run of points onto another, fitted to all of them at once.
     *
     * @remarks
     * The turn is taken from every point rather than from one or two directions, because two
     * directions barely tell apart when the stroke is smooth, and a turn read off them would be
     * mostly tremor. Fitted to the whole run it averages that tremor away, and it recovers a turn
     * that also travels, as a helix or a staircase does, which no pair of directions can express.
     *
     * The turn itself is the classic closed form: the largest eigenvector of a matrix built from the
     * cross covariance of the two runs is the quaternion of the best rotation, and it is reached
     * here by iterating the matrix on a vector until it settles on that eigenvector.
     */
    static #fitBetween(source: Vector3[], target: Vector3[]): Repetition {
        const count = source.length
        const fromCenter = source.reduce((sum, point) => sum.add(point), Vector3.Zero()).scale(1 / count)
        const toCenter = target.reduce((sum, point) => sum.add(point), Vector3.Zero()).scale(1 / count)
        const a = source.map(point => point.subtract(fromCenter))
        const b = target.map(point => point.subtract(toCenter))

        let xx = 0, xy = 0, xz = 0, yx = 0, yy = 0, yz = 0, zx = 0, zy = 0, zz = 0
        for(let i = 0; i < count; i++){
            xx += a[i].x * b[i].x; xy += a[i].x * b[i].y; xz += a[i].x * b[i].z
            yx += a[i].y * b[i].x; yy += a[i].y * b[i].y; yz += a[i].y * b[i].z
            zx += a[i].z * b[i].x; zy += a[i].z * b[i].y; zz += a[i].z * b[i].z
        }
        const matrix = [
            [xx + yy + zz, yz - zy, zx - xz, xy - yx],
            [yz - zy, xx - yy - zz, xy + yx, zx + xz],
            [zx - xz, xy + yx, -xx + yy - zz, yz + zy],
            [xy - yx, zx + xz, yz + zy, -xx - yy + zz],
        ]

        // Iterating settles on the eigenvector of the largest eigenvalue in size, so the diagonal is
        // raised first to make every eigenvalue positive and the largest one the one wanted.
        let shift = 0
        for(const row of matrix) shift = Math.max(shift, row.reduce((sum, value) => sum + Math.abs(value), 0))
        for(let r = 0; r < 4; r++) matrix[r][r] += shift

        let quaternion = [1, 0, 0, 0]
        for(let step = 0; step < 128; step++){
            const next = matrix.map(row => row.reduce((sum, value, c) => sum + value * quaternion[c], 0))
            const size = Math.hypot(...next)
            if(size < EPSILON) break
            quaternion = next.map(value => value / size)
        }
        const turn = new Quaternion(quaternion[1], quaternion[2], quaternion[3], quaternion[0])

        let matched = 0, spread = 0
        for(let i = 0; i < count; i++){
            matched += Vector3.Dot(a[i].applyRotationQuaternion(turn), b[i])
            spread += a[i].lengthSquared()
        }
        const scale = spread < EPSILON ? 1 : matched / spread
        const apply = (point: Vector3) => toCenter.add(point.subtract(fromCenter).applyRotationQuaternion(turn).scale(scale))

        let residual = 0
        for(let i = 0; i < count; i++) residual += Vector3.Distance(apply(source[i]), target[i])
        const size = Math.sqrt(spread / count)

        return { apply, scale, residual: size < EPSILON ? Infinity : residual / count / size }
    }

    /**
     * The motion a candidate period implies, fitted to the two periods before the end of the stroke.
     *
     * @param stretches - The stretches of the whole stroke.
     * @param candidate - The stretch supposed to close the period.
     * @returns The motion, or `null` when the stroke is too short to hold two periods, or when the
     *          motion grows or shrinks beyond what a drawing is allowed to.
     */
    #periodOf(stretches: Stretch[], candidate: number): Repetition | null {
        const last = stretches.length - 1
        const period = last - candidate
        if(candidate - period < 0) return null

        const before = this.#evenly(stretches[candidate - period].to, stretches[candidate].to, SAMPLES)
        const after = this.#evenly(stretches[candidate].to, stretches[last].to, SAMPLES)

        const fitted = MagicTool.#fitBetween(before, after)
        return fitted.scale < MIN_SCALE || fitted.scale > MAX_SCALE ? null : fitted
    }

    /**
     * The stretch closing the period the drawing repeats, and the motion that carries it on.
     *
     * @remarks
     * Resemblance alone names too many stretches, and never quite settles on a regular drawing: a
     * staircase, whose every elbow is the same as the next, answers at every width. What settles it
     * is that a period has to carry the whole drawing onto itself, not merely look like it, so each
     * stretch that answers is tried out as a period and kept on how far its motion lands from the
     * stroke it was fitted to. A stroke where the best of them still lands far away, a scribble say,
     * repeats nothing.
     *
     * @param stretches - The stretches of the whole stroke.
     * @returns The chosen stretch and its motion, or `null` when the drawing repeats nothing.
     */
    #select(stretches: Stretch[]): { chosen: number, window: number, repetition: Repetition } | null {
        const last = stretches.length - 1
        let discriminating: { answering: number[], window: number } | null = null
        let widest: { answering: number[], window: number } | null = null

        for(let window = MIN_WINDOW; window <= last; window++){
            if(last - window < 1) break

            const identity = MagicTool.#identityOf(stretches, last, window)
            if(identity === null) break

            const answering: number[] = []
            for(let other = window; other < last; other++){
                const compared = MagicTool.#identityOf(stretches, other, window)
                if(compared !== null && MagicTool.#alike(identity, compared)) answering.push(other)
            }
            if(answering.length === 0) break

            // Widening also shrinks the stretches able to answer at all, each needing that many
            // elbows behind it too. Once a single one is eligible it wins by default rather than by
            // resemblance, so such a round is kept only for want of a better one.
            if(last - window >= 2) discriminating = { answering, window }
            widest = { answering, window }
        }

        const round = discriminating ?? widest
        if(round === null) return null

        let chosen: number | null = null
        let repetition: Repetition | null = null
        let closest = Infinity
        for(const candidate of round.answering){
            const fitted = this.#periodOf(stretches, candidate)
            if(fitted === null || fitted.residual >= closest) continue
            closest = fitted.residual
            chosen = candidate
            repetition = fitted
        }

        if(chosen === null || repetition === null) return null
        if(repetition.residual > MAX_RESIDUAL) return null
        return { chosen, window: round.window, repetition }
    }

    /** Report what the spell read in the stroke, to work out why it behaves the way it does. */
    #report(stretches: Stretch[], how: string): void {
        if(DEBUG !== true) return

        const shape = stretches
            .map(stretch => `${(stretch.angle * 180 / Math.PI).toFixed(0)}deg/${stretch.length.toFixed(2)}m`)
            .join(" ")
        console.log(`[magic] ${this.#points.length} points cut by ${how} into ${stretches.length} stretches: ${shape}`)
    }

    /** Cast the spell on the stroke just released, repeating what it repeats, or fizzle. */
    #cast(): void {
        if(this.#points.length < 3) return this.#fizzle("the stroke is too short to be read")

        const { stretches, how } = this.#cut()
        this.#report(stretches, how)

        const last = stretches.length - 1
        if(last < MIN_WINDOW + 1) return this.#fizzle(`${stretches.length} stretches is too few to recognise one`)

        const selected = this.#select(stretches)
        if(selected === null) return this.#fizzle("nothing in the stroke carries the drawing onto itself")

        const { chosen, window, repetition } = selected
        if(DEBUG === true) console.log(`[magic] stretch ${chosen} of ${last} closes the period, on ${window} elbows, scale ${repetition.scale.toFixed(2)}, residual ${(repetition.residual * 100).toFixed(0)}%`)

        // Everything drawn after the chosen stretch is one period, and carrying it one period further
        // each time draws what the drawing would have gone on to draw.
        const drawings = DrawingSystem.getInstance()
        let pattern = this.#points.slice(stretches[chosen].to, stretches[last].to + 1)
        for(let repeat = 0; repeat < REPEAT_COUNT; repeat++){
            pattern = pattern.map(repetition.apply)
            drawings.draw(pattern)
        }
    }

    /**
     * Tell the hand the spell failed, with a stutter of short pulses.
     * @param reason - Why the stroke could not be repeated, reported when {@link DEBUG} is on.
     */
    #fizzle(reason: string): void {
        if(DEBUG === true) console.log(`[magic] fizzle: ${reason}`)

        for(const delay of FIZZLE_DELAYS){
            this.#fizzleTimeouts.push(setTimeout(
                () => this.#context.controller.pulse(FIZZLE_STRENGTH, FIZZLE_DURATION),
                delay,
            ))
        }
    }

    /**
     * Load the wand model and hang it on the hand, unless the attachment is gone by then.
     *
     * @remarks
     * The model is laid out by a holder node rather than by the imported root itself: that root
     * carries the axis conversion glTF files are imported with, which writing an orientation over it
     * would throw away. The holder takes the placement, the imported roots keep their own.
     */
    #loadModel(): void {
        ImportMeshAsync(MAGIC_MODEL_URL, this.#context.scene).then(result => {
            if(this.#isDisposed === true){
                for(const mesh of result.meshes) mesh.dispose(false, true)
                return
            }

            const holder = new TransformNode("magic wand", this.#context.scene)
            holder.parent = this.#context.visual

            // The model comes in one unit long, centered on the origin and already lying along the
            // axis the hand points at, but the wrong way round: a half turn puts its tip forward,
            // and half its length of offset brings its base onto the hand and its tip where it draws.
            holder.rotationQuaternion = Quaternion.FromEulerAngles(0, MODEL_YAW, 0)
            holder.scaling.setAll(TIP_DISTANCE)
            holder.position.z = TIP_DISTANCE / 2

            for(const mesh of result.meshes){
                mesh.isPickable = false
                if(mesh.parent === null) mesh.parent = holder
            }
            this.#model = holder
        })
    }

}

/** The kind of the hand holding a magic wand. */
export const MAGIC_TOOL_KIND: ToolKind = {
    label: "Magic",
    description: "A wand drawing like a pencil, but repeating what the drawing already repeats three times when released, each repetition carried one period further.",
    thumbnail: THUMBNAIL_URL,
    tags: ["tool", "precise"],
    create: context => new MagicTool(context),
}
