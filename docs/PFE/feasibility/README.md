# Tests de faisabilité (Phase 0)

*Scripts éphémères pour valider la viabilité des briques techniques avant
d'investir dans l'intégration au projet Node3D. Tout ce qui est ici sera
supprimé une fois Phase 0 close et les conclusions actées dans
[`../02_DECISIONS.md`](../02_DECISIONS.md).*

## Contenu prévu

- `magenta-latency.html` — Phase 0.2. Charge Magenta MelodyRNN, génère
  100 notes, mesure la latence d'inférence et exporte un CSV.
- `webxr-hand-tracking.html` — Phase 0.3. Active le hand tracking WebXR,
  trace les positions et la fréquence d'échantillonnage.

## Exécution

Chaque fichier HTML est autonome. Pour les lancer :

```bash
cd docs/PFE/feasibility
python3 -m http.server 8080 --bind 127.0.0.1
# Puis ouvrir http://localhost:8080/<fichier>.html
```

Pour le test WebXR, il faut HTTPS et un Quest connecté en USB+adb reverse,
comme pour le projet principal.
