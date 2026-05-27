/**
 * 
 * # L'API Node3D
 * L'API Node3D permet de créer des éléments interactifs en 3D, ajoutable dans le monde virtuel.
 * L'API permet d'héberger le code de son éléments sur un serveur distant, et le charger dynamiquement dans le monde virtuel.
 * 
 * L'API est composée de plusieurs éléments:
 *  - {@link Node3DGUI}: Représente l'interface graphique d'un Node3D, c'est à dire les éléments 3D qui composent le Node3D et avec lesquels l'utilisateur peut interagir.
 *  - {@link Node3D}: Représente la partie fonctionnelle d'un Node3D, c'est à dire le code qui gère les intéractions avec la GUI, les connexions entre les Node3D et la logique de traitement du son ou du MIDI.
 *  - {@link Node3DFactory}: Permet de créer un Node3D et sa GUI.
 * 
 * La {@link Node3DGUI} peut être utilisées sans Node3D pour visualiser l'interface graphique d'un {@link Node3D}, par exemple comme miniature d'un bouton de création de Node3D.
 * 
 * Les API de WamJamParty, ainsi que babylonjs sont passé en paramètre à la création du {@link Node3D}.
 * ce qui permet de les utiliser dans le code du {@link Node3D} .
 * 
 * Des examples de Node3D:
 * @see [SequencerN3D](./subs/SequencerN3D.ts)
 * @see [AudioOutputN3D](./subs/AudioOutputN3D.ts)
 * @see [OscillatorN3D](./subs/OscillatorN3D.ts)
 * 
 * {@includeCode ./subs/OscillatorN3D.ts}
 * 
 * Un template:
 * {@includeCode ./subs/TemplateN3D.ts}
 * 
 * @author Samuel DEMONT
 * 
 * @module Node 3D API
 */

export * from "./Node3D";
export * from "./Node3DContext";
export * from "./Node3DGUIContext";
export * from "./Node3DButton";
export * from "./Node3DConnectable";
export * from "./Node3DParameter";
