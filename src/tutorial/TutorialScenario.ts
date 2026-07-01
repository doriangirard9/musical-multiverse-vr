export const TUTORIAL_KINDS = {
    piano: "livepiano",
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
        title: "Bienvenue dans le Musical Metaverse",
        objective: "Ici, on construit des instruments dans l’espace, on joue en live avec d’autres personnes et on peut préparer de vraies performances. Commençons par les bases.",
        hint: "Le tutoriel vous fera créer une première chaîne audio complète, la jouer, la modifier et suivre le tempo commun.",
        success: "Bienvenue.",
        awaitAdvanceOnly: true,
    },
    {
        id: "move-around",
        title: "Se déplacer dans l’espace",
        objective: "Déplacez-vous avec le stick, puis tournez-vous pour regarder autour de vous. Prenez votre temps pour vous familiariser avec les mouvements.",
        hint: "Avancez, reculez ou glissez avec le stick. Utilisez aussi la rotation au stick pour changer votre point de vue. Quand vous êtes à l’aise, passez à la suite.",
        success: "Vous avez pris vos repères dans l’espace.",
        awaitAdvanceOnly: true,
    },
    {
        id: "open-shop",
        title: "Ouvrir le shop",
        objective: "Ouvrez le shop avec A, ou depuis le menu de la main gauche.",
        hint: "Le shop contient uniquement les quatre éléments nécessaires à votre premier instrument.",
        success: "Parfait. Le shop est votre boîte à outils musicale.",
    },
    {
        id: "add-piano",
        title: "Créer les notes",
        objective: "Ajoutez LivePiano dans MIDI > Generator.",
        hint: "Le piano ne produit pas encore de son : il envoie seulement des notes MIDI.",
        success: "Le contrôleur est prêt. Il décidera quelles notes jouer.",
        expectedKind: TUTORIAL_KINDS.piano,
        expectedSection: "MIDI",
    },
    {
        id: "place-piano",
        title: "Placer le piano",
        objective: "Attrapez le LivePiano avec le trigger et déplacez-le vers sa zone. Pendant que vous le tenez, utilisez aussi le stick droit vers le haut ou le bas pour le rapprocher ou l’éloigner.",
        hint: "Le premier déplacement est important : attraper un module sert à le placer dans la scène, pas seulement à le bouger de quelques centimètres. Prenez votre temps puis passez à la suite.",
        success: "Parfait. Le piano est bien placé pour lancer la chaîne.",
    },
    {
        id: "add-synth",
        title: "Donner un son aux notes",
        objective: "Ajoutez le Pro54 dans MIDI > Instrument.",
        hint: "Un instrument transforme les notes MIDI en signal audio.",
        success: "Excellent. Le Pro54 sera la voix de votre chaîne.",
        expectedKind: TUTORIAL_KINDS.synth,
        expectedSection: "MIDI",
    },
    {
        id: "place-synth",
        title: "Placer le synthé",
        objective: "Déplacez le Pro54 vers la deuxième zone de la chaîne.",
        hint: "Gardez un espace confortable entre les modules pour que les câbles restent bien lisibles.",
        success: "Très bien. Le synthé est à sa place.",
    },
    {
        id: "connect-midi",
        title: "Relier le contrôleur",
        objective: "Reliez la sortie verte du piano à l’entrée MIDI verte du Pro54.",
        hint: "Maintenez le trigger sur une prise, visez l’autre prise, puis relâchez. Les repères flottants montrent les deux boules à relier.",
        success: "Connexion MIDI réussie : les gestes du piano atteignent maintenant le synthé.",
    },
    {
        id: "add-delay",
        title: "Ajouter de l’espace",
        objective: "Ajoutez Ping Pong Delay dans Audio > Effect.",
        hint: "Un effet reçoit un son, le transforme, puis le renvoie.",
        success: "Le delay est prêt à créer des échos entre la gauche et la droite.",
        expectedKind: TUTORIAL_KINDS.delay,
        expectedSection: "Audio",
    },
    {
        id: "place-delay",
        title: "Placer l’effet",
        objective: "Déplacez le Ping Pong Delay dans la troisième zone de la chaîne.",
        hint: "Gardez la chaîne lisible devant vous, avec assez d’espace entre les modules pour distinguer facilement les connexions.",
        success: "Le delay est bien positionné pour la suite.",
    },
    {
        id: "connect-delay",
        title: "Faire entrer le son dans l’effet",
        objective: "Reliez la sortie audio du Pro54 à l’entrée audio du delay.",
        hint: "Les prises MIDI sont vert foncé ; les prises audio sont vert clair. Les repères flottants pointent les deux prises audio utiles.",
        success: "Le son du synthé traverse maintenant le Ping Pong Delay.",
    },
    {
        id: "play-first-note",
        title: "Tester le circuit incomplet",
        objective: "Appuyez sur quelques touches du piano.",
        hint: "Vous ne devriez encore rien entendre : le signal audio n’a pas encore de destination.",
        success: "Les notes circulent, mais l’absence de son est normale : il manque encore une sortie audio.",
    },
    {
        id: "add-output",
        title: "Ouvrir la sortie",
        objective: "Ajoutez Speaker dans Output.",
        hint: "Le Speaker est la destination finale du graphe : c’est lui qui diffuse le son.",
        success: "La destination est en place. Il ne reste qu’un câble.",
        expectedKind: TUTORIAL_KINDS.output,
        expectedSection: "Output",
    },
    {
        id: "place-output",
        title: "Placer le Speaker",
        objective: "Déplacez le Speaker dans la dernière zone de la chaîne.",
        hint: "La chaîne finale doit rester lisible : piano, synthé, effet, puis sortie.",
        success: "Parfait. La sortie finale est bien séparée du reste.",
    },
    {
        id: "connect-output",
        title: "Terminer le graphe",
        objective: "Reliez la sortie du delay à l’entrée du Speaker.",
        hint: "Suivez les prises audio vert clair : piano → synthé → effet → sortie. Les repères flottants montrent la sortie du delay et l’entrée finale.",
        success: "Circuit complet ! Chaque note peut maintenant devenir un son audible.",
    },
    {
        id: "remove-output-connection",
        title: "Supprimer un câble",
        objective: "Visez le câble, le delay ou le Speaker, appuyez sur Y, puis choisissez Delete a connection.",
        hint: "Si le menu du câble n’apparaît pas, ouvrez le menu contextuel du delay ou du Speaker : l’option Delete a connection y est aussi.",
        success: "Parfait. Vous savez maintenant retirer une connexion devenue inutile.",
    },
    {
        id: "restore-output-connection",
        title: "Reconnecter proprement",
        objective: "Reliez à nouveau la sortie du delay à l’entrée du Speaker.",
        hint: "Reprenez le même geste de connexion : trigger maintenu sur une boule, visée de l’autre boule, puis relâchez.",
        success: "Très bien. Vous savez maintenant couper puis réparer une chaîne audio.",
    },
    {
        id: "play-chain",
        title: "Jouer en direct",
        objective: "Jouez quelques notes et expérimentez librement avec votre chaîne.",
        hint: "Prenez votre temps : cette étape sert à vous habituer au jeu en direct, sans vous presser.",
        success: "Votre premier instrument modulaire fonctionne.",
    },
    {
        id: "shape-sound",
        title: "Sculpter le synthé",
        objective: "Modifiez le filtre du Pro54 et écoutez comment le timbre change.",
        hint: "Les repères flottants montrent les contrôles les plus adaptés pour modifier clairement le son. Prenez le temps d’essayer.",
        success: "Vous venez de modifier le timbre à la source.",
    },
    {
        id: "shape-delay",
        title: "Régler l’effet",
        objective: "Modifiez Mix, Time ou Feedback sur le Ping Pong Delay.",
        hint: "Mix dose l’effet, Time espace les échos, Feedback règle leur durée. Prenez le temps d’écouter chaque changement.",
        success: "Le même son prend maintenant une autre profondeur.",
    },
    {
        id: "start-transport",
        title: "Faire apparaître le tempo",
        objective: "Une chaîne rythmique va apparaître au-dessus de votre installation. Quand elle est prête, appuyez sur Play depuis le menu de la main gauche.",
        hint: "Le séquenceur 16 joue kick, snare et clap dans un drum sampler relié à sa propre sortie audio.",
        success: "Le beat matérialise le tempo global : chaque pulse correspond à un temps.",
    },
    {
        id: "change-tempo",
        title: "Changer le tempo",
        objective: "Ouvrez les réglages du transport et changez le BPM, puis prenez le temps d’écouter l’effet sur le beat.",
        hint: "Écoutez le beat et observez le pulse accélérer ou ralentir avant de passer à la suite.",
        success: "Le beat et le pulse suivent bien votre nouveau tempo.",
    },
    {
        id: "complete",
        title: "Tutoriel terminé",
        objective: "Jouez maintenant votre piano et votre Pro54 par-dessus le beat, puis clôturez le tutoriel quand vous êtes satisfait.",
        hint: "Quand vous êtes prêt, fermez ce panneau : un dernier effet visuel rythmé apparaîtra au-dessus de la scène.",
        success: "Bravo !",
        awaitAdvanceOnly: true,
        advanceLabel: "Clore le tutoriel",
    },
]
