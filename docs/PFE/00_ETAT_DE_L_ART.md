# État de l'art

*Référentiel central de la littérature consultée pour le PFE. Chaque référence
est citée au moins une fois dans le mémoire. Les sections suivent le découpage
thématique du document de cadrage.*

---

## Sommaire

- [1. Interfaces gestuelles pour la musique (NIME)](#1-interfaces-gestuelles-pour-la-musique-nime)
- [2. Apprentissage interactif et mapping geste→son](#2-apprentissage-interactif-et-mapping-gesteson)
- [3. Génération musicale par apprentissage profond](#3-génération-musicale-par-apprentissage-profond)
- [4. Co-création humain-IA en musique](#4-co-création-humain-ia-en-musique)
- [5. Réalité virtuelle pour la musique](#5-réalité-virtuelle-pour-la-musique)
- [6. Méthodes d'évaluation (HCI musique)](#6-méthodes-dévaluation-hci-musique)

---

## 1. Interfaces gestuelles pour la musique (NIME)

### Statut : à compléter

Références à intégrer :

- **Wessel, D. & Wright, M. (2002).** *Problems and prospects for intimate
  musical control of computers.* Computer Music Journal, 26(3), 11-22.
  - *À lire en priorité* — texte fondateur sur les critères qu'une interface
    gestuelle musicale doit satisfaire (latence, expressivité, prédictibilité).

- **Bevilacqua, F., Zamborlin, B., Sypniewski, A., Schnell, N., Guédy, F. &
  Rasamimanana, N. (2010).** *Continuous realtime gesture following and
  recognition.* Lecture Notes in Computer Science, vol. 5934.
  - Travail de l'IRCAM, méthode HMM pour suivi de gestes — référence pour le
    suivi continu, alternative à notre approche par features géométriques.

- **Borchers, J., Lee, E., Samminger, W. & Mühlhäuser, M. (2004).** *Personal
  Orchestra: a real-time audio/video system for interactive conducting.*
  Multimedia Systems, 9(5), 458-465.
  - Référence directe au problème du "chef d'orchestre virtuel". Système à
    comparer pour positionner notre travail.

- **Lee, E., Karrer, T. & Borchers, J. (2006).** *Toward a framework for
  interactive systems to conduct digital audio and video streams.* Computer
  Music Journal, 30(1), 21-36.

### Notes
*(à compléter après lecture)*

---

## 2. Apprentissage interactif et mapping geste→son

### Statut : à compléter

- **Fiebrink, R. (2011).** *Real-time human interaction with supervised
  learning algorithms for music composition and performance.* Thèse, Princeton
  University.
  - *Wekinator*, foundational pour le mapping appris. Référence centrale si
    nous adoptons le mapping par démonstration en alternative à l'heuristique.

- **Françoise, J. & Bevilacqua, F. (2018).** *Motion-sound mapping through
  interaction: an approach to user-centered design of auditory feedback using
  machine learning.* ACM Transactions on Interactive Intelligent Systems,
  8(2), 1-30.
  - Approfondit Wekinator avec une méthodologie centrée utilisateur. Source
    principale pour notre design d'étude pilote (mois 3).

### Notes
*(à compléter après lecture)*

---

## 3. Génération musicale par apprentissage profond

### Statut : à compléter

#### Modèles symboliques (génération de MIDI)

- **Hadjeres, G., Pachet, F. & Nielsen, F. (2017).** *DeepBach: a steerable
  model for Bach chorales generation.* ICML, vol. 70, pp. 1362-1371.

- **Roberts, A., Engel, J., Raffel, C., Hawthorne, C. & Eck, D. (2018).** *A
  hierarchical latent vector model for learning long-term structure in music*
  (MusicVAE). ICML, pp. 4364-4373.
  - Modèle utilisé probablement (option Magenta).

- **Huang, C.-Z. A., Vaswani, A., Uszkoreit, J., Shazeer, N., Simon, I.,
  Hawthorne, C., Dai, A. M., Hoffman, M. D., Dinculescu, M. & Eck, D.
  (2018).** *Music Transformer.* ICLR 2019.
  - Architecture Transformer pour génération musicale longue-portée.

- **Huang, Y.-S. & Yang, Y.-H. (2020).** *Pop Music Transformer: beat-based
  modeling and generation of expressive pop piano compositions.* ACM
  Multimedia, pp. 1180-1188.

#### Modèles audio (génération de signal)

- **Engel, J., Resnick, C., Roberts, A., Dieleman, S., Norouzi, M., Eck, D. &
  Simonyan, K. (2017).** *Neural audio synthesis of musical notes with WaveNet
  autoencoders* (NSynth). ICML, pp. 1068-1077.

- **Engel, J., Hantrakul, L., Gu, C. & Roberts, A. (2020).** *DDSP:
  Differentiable digital signal processing.* ICLR.

- **Copet, J., Kreuk, F., Gat, I., Remez, T., Kant, D., Synnaeve, G., Adi, Y.
  & Défossez, A. (2023).** *Simple and controllable music generation*
  (MusicGen). NeurIPS.
  - Trop lourd pour le navigateur, hors scope direct mais à mentionner pour
    travaux futurs.

- **Agostinelli, A., Denk, T. I., Borsos, Z., Engel, J., Verzetti, M., Caillon,
  A., Huang, Q., Jansen, A., Roberts, A., Tagliasacchi, M., Sharifi, M., Zeghidour,
  N. & Frank, C. (2023).** *MusicLM: generating music from text.* arXiv:2301.11325.

#### Surveys

- **Briot, J.-P., Hadjeres, G. & Pachet, F. (2019).** *Deep learning techniques
  for music generation — a survey.* Springer Computational Synthesis and
  Creative Systems.
  - Survey de référence — à citer dès l'introduction du mémoire.

### Notes
*(à compléter après lecture)*

---

## 4. Co-création humain-IA en musique

### Statut : à compléter

- **Huang, C.-Z. A., Koops, H. V., Newton-Rex, E., Dinculescu, M. & Cai, C. J.
  (2020).** *AI Song Contest: human-AI co-creation in songwriting.* ISMIR.

- **Louie, R., Coenen, A., Huang, C.-Z. A., Terry, M. & Cai, C. J. (2020).**
  *Novice-AI music co-creation via AI-steering tools for deep generative
  models.* CHI 2020, pp. 1-13.
  - Référence directe à notre cas d'usage : utilisateurs novices contrôlant un
    modèle génératif via des outils dédiés.

- **McCormack, J., Hutchings, P., Gifford, T., Yee-King, M., Llano, M. T. &
  D'Inverno, M. (2020).** *Design considerations for real-time collaboration
  with creative artificial intelligence.* Organised Sound, 25(1), 41-52.

### Notes
*(à compléter après lecture)*

---

## 5. Réalité virtuelle pour la musique

### Statut : à compléter

- **Serafin, S., Erkut, C., Kojs, J., Nilsson, N. C. & Nordahl, R. (2016).**
  *Virtual reality musical instruments: state of the art, design principles,
  and future directions.* Computer Music Journal, 40(3), 22-40.
  - Survey de référence sur les VRMI.

- **Çamcı, A. & Hamilton, R. (2020).** *Audio-first VR: New perspectives on
  musical experiences in virtual environments.* Journal of New Music Research,
  49(1), 1-7.

- **Mäki-Patola, T., Laitinen, J., Kanerva, A. & Takala, T. (2005).**
  *Experiments with virtual reality instruments.* NIME, pp. 11-16.

### Notes
*(à compléter après lecture)*

---

## 6. Méthodes d'évaluation (HCI musique)

### Échelles utilisées

- **Hart, S. G. & Staveland, L. E. (1988).** *Development of NASA-TLX (Task
  Load Index): results of empirical and theoretical research.* In Advances in
  Psychology (vol. 52, pp. 139-183).
  - Charge cognitive. Utilisée dans **H3**.

- **Zentner, M., Grandjean, D. & Scherer, K. R. (2008).** *Emotions evoked by
  the sound of music: characterization, classification, and measurement.*
  Emotion, 8(4), 494-521.
  - Échelle GEMS (Geneva Emotional Music Scale). Utilisée dans **H1**.

- **Tapal, A., Oren, E., Dar, R. & Eitam, B. (2017).** *The sense of agency
  scale: a measure of consciously perceived control over one's mind, body,
  and the immediate environment.* Frontiers in Psychology, 8, 1552.
  - Échelle d'agentivité. Utilisée dans **H1**.

- **Schubert, T., Friedmann, F. & Regenbrecht, H. (2001).** *The experience of
  presence: factor analytic insights.* Presence: Teleoperators and Virtual
  Environments, 10(3), 266-281.
  - Questionnaire IPQ (Igroup Presence Questionnaire). Présence VR.

### Méthodologie

- **Brown, A. R. & Sorensen, A. (2009).** *Interacting with generative music
  through live coding.* Contemporary Music Review, 28(1), 17-29.

### Notes
*(à compléter après lecture)*

---

## À lire en priorité (premier mois)

Les cinq textes à lire en premier, dans l'ordre :

1. Wessel & Wright (2002) — pour les principes de design
2. Fiebrink (2011), chapitres 1-3 — pour le mapping appris
3. Briot et al. (2019), chapitres introduction + état de l'art — pour la
   génération musicale par DL
4. Serafin et al. (2016) — pour la VR musicale
5. Louie et al. (2020) — pour la co-création utilisateur-IA

Une fiche de lecture (2-3 pages) sera produite pour chacune, archivée dans
`docs/PFE/lectures/` (à créer au moment de la lecture).
