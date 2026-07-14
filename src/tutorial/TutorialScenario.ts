export const TUTORIAL_KINDS = {
    piano: "harp",
    synth: "server-pro54michel",
    delay: "wam3d-Ping Pong Delay",
    output: "audiooutput",
} as const

export type TutorialStepId =
    | "welcome-intro"
    | "move-around"
    | "open-shop"
    | "add-piano"
    | "place-piano"
    | "add-synth"
    | "place-synth"
    | "connect-midi"
    | "add-delay"
    | "place-delay"
    | "connect-delay"
    | "play-first-note"
    | "add-output"
    | "place-output"
    | "connect-output"
    | "remove-output-connection"
    | "restore-output-connection"
    | "play-chain"
    | "shape-sound"
    | "shape-delay"
    | "start-transport"
    | "change-tempo"
    | "complete"

export interface TutorialStep {
    id: TutorialStepId
    title: string
    objective: string
    hint: string
    success: string
    awaitAdvanceOnly?: boolean
    advanceLabel?: string
    expectedKind?: string
    expectedSection?: string
}

export const TUTORIAL_STEPS: TutorialStep[] = [
    {
        id: "welcome-intro",
        title: "Welcome to the Musical Metaverse",
        objective: "Here, you can build instruments in space, make music with other people in real time, and prepare live performances. Let’s start with the basics.",
        hint: "This tutorial will guide you step by step: move around, add modules, connect them, make sound, shape it, and follow the shared tempo.",
        success: "Welcome aboard.",
        awaitAdvanceOnly: true,
    },
    {
        id: "move-around",
        title: "Move Around",
        objective: "Use the stick to move, then turn and look around. Take a moment to get comfortable in the space.",
        hint: "Move forward, backward, or sideways with the stick. Use the stick rotation to turn. Continue when you feel ready.",
        success: "You have your bearings now.",
        awaitAdvanceOnly: true,
    },
    {
        id: "open-shop",
        title: "Open the Shop",
        objective: "Open the shop with A, or from the left-hand menu.",
        hint: "The shop is where you spawn modules into the scene. For now, it only shows the few tools needed for this first setup.",
        success: "Perfect. The shop is your musical toolbox.",
    },
    {
        id: "add-piano",
        title: "Create the Notes",
        objective: "Add Harp from MIDI > Generator.",
        hint: "The Harp does not make sound on its own yet. It only sends note information when you pluck its strings.",
        success: "The Harp is ready. It decides which notes to play.",
        expectedKind: TUTORIAL_KINDS.piano,
        expectedSection: "MIDI",
    },
    {
        id: "place-piano",
        title: "Place the Harp",
        objective: "Grab the Harp with the trigger and move it to its target spot. While holding it, push the right stick up or down to move it farther away or closer to you.",
        hint: "Grabbing a module is how you place it in the scene. Use the sticks and your body position to give yourself enough room.",
        success: "Great. The Harp is in place.",
    },
    {
        id: "add-synth",
        title: "Turn Notes into Sound",
        objective: "Add Pro54 from MIDI > Instrument.",
        hint: "An instrument turns note information into real sound.",
        success: "Excellent. Pro54 will be the sound source for this setup.",
        expectedKind: TUTORIAL_KINDS.synth,
        expectedSection: "MIDI",
    },
    {
        id: "place-synth",
        title: "Place the Synth",
        objective: "Move Pro54 to the second spot in the setup.",
        hint: "Keep enough space between modules so the cables stay easy to see and connect.",
        success: "Nice. The synth is in place.",
    },
    {
        id: "connect-midi",
        title: "Connect the Controller",
        objective: "Connect the Harp’s green note output to Pro54’s green note input.",
        hint: "Hold the trigger on one port, aim at the other port, then release. The floating guides show the two ports to connect.",
        success: "Connected. The Harp can now tell the synth which notes to play.",
    },
    {
        id: "add-delay",
        title: "Add an Effect",
        objective: "Add Ping Pong Delay from Audio > Effect.",
        hint: "An effect receives sound, transforms it, then sends it back out.",
        success: "The delay is ready to add bouncing echoes.",
        expectedKind: TUTORIAL_KINDS.delay,
        expectedSection: "Audio",
    },
    {
        id: "place-delay",
        title: "Place the Effect",
        objective: "Move Ping Pong Delay to the third spot in the setup.",
        hint: "Keep the setup readable in front of you, with enough space to see each connection clearly.",
        success: "The delay is in the right spot.",
    },
    {
        id: "connect-delay",
        title: "Send Sound into the Effect",
        objective: "Connect Pro54’s audio output to the delay’s audio input.",
        hint: "Dark green ports carry note information. Light green ports carry sound. The floating guides point to the correct sound ports.",
        success: "The synth now sends its sound through the delay.",
    },
    {
        id: "play-first-note",
        title: "Test the Incomplete Chain",
        objective: "Reach toward a Harp string and pluck it with your controller or hand.",
        hint: "You do not need to press a button here. Brush through a string to trigger a note. You should not hear anything yet because the sound still has nowhere to go.",
        success: "The notes are flowing, but the silence is normal: the setup still needs an output.",
    },
    {
        id: "add-output",
        title: "Add the Output",
        objective: "Add Speaker from Output.",
        hint: "The Speaker is the end of the sound path. It is what plays the sound.",
        success: "The destination is ready. One cable left.",
        expectedKind: TUTORIAL_KINDS.output,
        expectedSection: "Output",
    },
    {
        id: "place-output",
        title: "Place the Speaker",
        objective: "Move the Speaker to the last spot in the setup.",
        hint: "Keep the full setup easy to read: Harp, synth, effect, then Speaker.",
        success: "Perfect. The final output is clearly separated.",
    },
    {
        id: "connect-output",
        title: "Finish the Sound Path",
        objective: "Connect the delay’s output to the Speaker’s input.",
        hint: "Follow the light green sound ports. The floating guides show the last two ports to connect.",
        success: "Setup complete. Every note can now become audible sound.",
    },
    {
        id: "remove-output-connection",
        title: "Remove a Connection",
        objective: "Aim at the floating bar above the Speaker, open the settings icon, then choose Delete a connection.",
        hint: "The floating bar gives you quick actions for that module. If you delete the Speaker by mistake with the red X, it will come back automatically.",
        success: "Perfect. You now know how to remove a connection safely.",
    },
    {
        id: "restore-output-connection",
        title: "Reconnect Cleanly",
        objective: "Reconnect the delay’s output to the Speaker’s input.",
        hint: "Use the same gesture: hold the trigger on one port, aim at the other, then release. If the Speaker was deleted by mistake, it has already been restored.",
        success: "Well done. You can now break and repair the end of a setup cleanly.",
    },
    {
        id: "play-chain",
        title: "Play Live",
        objective: "Play a few notes and explore the setup freely.",
        hint: "Pluck the Harp by brushing through its strings with your controller or hand. Take your time here.",
        success: "Your first playable setup works.",
    },
    {
        id: "shape-sound",
        title: "Shape the Synth",
        objective: "Change the Pro54 filter and listen to how the sound changes.",
        hint: "The floating guides point to a few good controls to try. Take a moment to listen.",
        success: "You just changed the sound at its source.",
    },
    {
        id: "shape-delay",
        title: "Adjust the Effect",
        objective: "Change Mix, Time, or Feedback on the Ping Pong Delay.",
        hint: "Mix changes how much echo you hear. Time changes the gap between echoes. Feedback changes how long the echoes last.",
        success: "The same sound now has a different depth.",
    },
    {
        id: "start-transport",
        title: "Start the Beat",
        objective: "A rhythm setup will appear above your main setup. When it is ready, open the left-hand menu and press Play.",
        hint: "The sequencer, drum instrument, and output are already connected for you.",
        success: "The beat makes the shared tempo easy to hear. Each pulse marks the beat.",
    },
    {
        id: "change-tempo",
        title: "Change the Tempo",
        objective: "Open the left-hand menu, open Settings, then change the BPM.",
        hint: "BPM means the speed of the beat. Listen to it go faster or slower before moving on.",
        success: "The beat and visual pulse now follow your new tempo.",
    },
    {
        id: "complete",
        title: "Tutorial Complete",
        objective: "Now play your Harp and Pro54 over the beat, then finish the tutorial when you feel ready.",
        hint: "Keep plucking the Harp and shaping the sound for as long as you want, then press Finish Tutorial. A final tempo-synced visual effect will appear above the scene.",
        success: "Nicely done!",
        awaitAdvanceOnly: true,
        advanceLabel: "Finish Tutorial",
    },
]
