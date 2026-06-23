export const TUTORIAL_KINDS = {
    piano: "livepiano",
    synth: "server-pro54michel",
    delay: "wam3d-Ping Pong Delay",
    output: "audiooutput",
} as const

export type TutorialStepId =
    | "open-shop"
    | "add-piano"
    | "add-synth"
    | "connect-midi"
    | "play-first-note"
    | "add-delay"
    | "connect-delay"
    | "add-output"
    | "connect-output"
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
    expectedKind?: string
    expectedSection?: string
}

export const TUTORIAL_STEPS: TutorialStep[] = [
    {
        id: "open-shop",
        title: "Bienvenue dans le Multiverse",
        objective: "Ouvrez le shop avec A, ou depuis le menu de la main gauche.",
        hint: "Le shop contient uniquement les quatre éléments nécessaires à notre premier instrument.",
        success: "Parfait. Le shop est votre boîte à outils musicale.",
    },
    {
        id: "add-piano",
        title: "Créer les notes",
        objective: "Dans MIDI > Generator, ajoutez LivePiano.",
        hint: "Le piano ne produit pas encore de son : il envoie des notes MIDI.",
        success: "Le contrôleur est prêt. Il décidera quelles notes jouer.",
        expectedKind: TUTORIAL_KINDS.piano,
        expectedSection: "MIDI",
    },
    {
        id: "add-synth",
        title: "Donner un son aux notes",
        objective: "Dans MIDI > Instrument, ajoutez le Pro54.",
        hint: "Un instrument transforme les notes MIDI en signal audio.",
        success: "Excellent. Le Pro54 sera la voix de notre chaîne.",
        expectedKind: TUTORIAL_KINDS.synth,
        expectedSection: "MIDI",
    },
    {
        id: "connect-midi",
        title: "Relier le contrôleur",
        objective: "Reliez la sortie verte du piano à l’entrée MIDI verte du Pro54.",
        hint: "Maintenez le trigger sur une prise, visez l’autre prise, puis relâchez.",
        success: "Connexion MIDI réussie : les gestes du piano atteignent maintenant le synthé.",
    },
    {
        id: "add-delay",
        title: "Ajouter de l’espace",
        objective: "Dans Audio > Effect, ajoutez Ping Pong Delay.",
        hint: "Un effet reçoit un son, le transforme, puis le renvoie.",
        success: "Le delay est prêt à créer des échos entre la gauche et la droite.",
        expectedKind: TUTORIAL_KINDS.delay,
        expectedSection: "Audio",
    },
    {
        id: "connect-delay",
        title: "Faire entrer le son dans l’effet",
        objective: "Reliez la sortie audio du Pro54 à l’entrée audio du delay.",
        hint: "Les prises MIDI sont vert foncé ; les prises audio sont vert clair.",
        success: "Le son du synthé traverse maintenant le Ping Pong Delay.",
    },
    {
        id: "play-first-note",
        title: "Tester le circuit incomplet",
        objective: "Appuyez sur quelques touches du piano.",
        hint: "Vous ne devriez encore rien entendre : le signal audio n’a pas de destination.",
        success: "Les notes circulent, mais l’absence de son est normale : il manque encore une sortie audio.",
    },
    {
        id: "add-output",
        title: "Ouvrir la sortie",
        objective: "Dans Output, ajoutez Audio Output.",
        hint: "La sortie audio est la destination finale du graphe.",
        success: "La destination est en place. Il ne reste qu’un câble.",
        expectedKind: TUTORIAL_KINDS.output,
        expectedSection: "Output",
    },
    {
        id: "connect-output",
        title: "Terminer le graphe",
        objective: "Reliez la sortie du delay à l’entrée de Audio Output.",
        hint: "Suivez les prises audio vert clair : synthé → effet → sortie.",
        success: "Circuit complet ! Chaque note peut maintenant devenir un son audible.",
    },
    {
        id: "play-chain",
        title: "Jouer en direct",
        objective: "Jouez au moins trois notes sur le piano et écoutez le résultat.",
        hint: "Essayez une petite mélodie : les échos doivent suivre chaque note.",
        success: "Votre premier instrument modulaire fonctionne.",
    },
    {
        id: "shape-sound",
        title: "Sculpter le synthé",
        objective: "Modifiez un paramètre du Pro54, par exemple le filtre.",
        hint: "Saisissez une commande du synthé et déplacez la main verticalement.",
        success: "Vous venez de modifier le timbre à la source.",
    },
    {
        id: "shape-delay",
        title: "Régler l’effet",
        objective: "Modifiez Mix, Time ou Feedback sur le Ping Pong Delay.",
        hint: "Mix dose l’effet, Time espace les échos, Feedback règle leur durée.",
        success: "Le même son prend maintenant une autre profondeur.",
    },
    {
        id: "start-transport",
        title: "Faire apparaître le tempo",
        objective: "Une chaîne rythmique va apparaître. Quand elle est prête, appuyez sur Play depuis la main gauche.",
        hint: "Le séquenceur 16 joue kick, snare et clap dans un drum sampler relié à sa propre sortie audio.",
        success: "Le beat matérialise le tempo global : chaque pulse correspond à un temps.",
    },
    {
        id: "change-tempo",
        title: "Changer le tempo",
        objective: "Ouvrez les réglages du transport et changez le BPM.",
        hint: "Écoutez le beat et observez le pulse accélérer ou ralentir avec le BPM.",
        success: "Le beat et le pulse suivent bien votre nouveau tempo.",
    },
    {
        id: "complete",
        title: "Tutoriel terminé",
        objective: "Jouez maintenant votre piano et votre Pro54 par-dessus le beat.",
        hint: "Vous contrôlez un graphe audio complet et un tempo partagé. Continuez à improviser, ou quittez le tutoriel.",
        success: "Bravo !",
    },
]
