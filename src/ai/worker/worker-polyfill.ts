// ─── worker-polyfill.ts ──────────────────────────────────────────────────────
//
//   DOIT être importé EN PREMIER dans ai-worker.ts, AVANT @magenta/music.
//
//   Magenta (et certaines déps TF.js) référencent `window` au chargement du
//   module.  Les Web Workers n'ont pas `window` (ils ont `self` / globalThis).
//   On aliase `window → globalThis` pour satisfaire ces références.
//
//   Pourquoi un module séparé : les imports ES sont hoistés, donc on ne peut
//   pas faire ce setup avant l'import de Magenta DANS le même fichier.  En le
//   mettant dans un module importé en premier, son code top-level s'exécute
//   avant le chargement de Magenta (ordre source des imports).
//
//   On ne fake PAS `document` : si Magenta en avait besoin, ce serait le signe
//   que MusicRNN ne tourne pas en worker, et il vaut mieux le voir échouer
//   franchement que masquer le problème avec un faux document.

const g = globalThis as any;

if (typeof g.window === "undefined") {
    g.window = g;
}

export {};
