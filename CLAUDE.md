# Sillage — contexte projet

Gestionnaire de tâches personnel, PWA autonome, hébergée sur GitHub Pages
(dépôt **public** — voir Sécurité). Utilisateur unique : Laurent. Interface
et code en français.

## Architecture

- `store.js` — couche DONNÉES. **Zéro DOM, zéro réseau.** Source de vérité
  unique. Toute écriture passe par `Store.actions.*`, jamais par mutation
  directe de l'état. Persistance via un adaptateur `persist` (localStorage).
- `ui.js` — couche PRÉSENTATION + réseau. Client du store.
- `capture.js` — relève de la boîte de capture (voir plus bas).
- `index.html` — structure + CSS. Le CSS et le HTML sont dans ce fichier :
  ne jamais coller de balise HTML dans un bloc de style, ni dans un `.js`.

### Schéma (store.js)

Un seul type d'objet, trois natures : `tache` | `rdv` | `projet`.
Statuts : `dormante` | `active` | `faite` | `a_planifier` | `corbeille`.
`a_planifier` = **le vivier** (idées capturées, pas encore engagées).

Mécaniques propres au projet, à respecter :
- **glissement élastique** : une tâche active dans le passé glisse à
  aujourd'hui, `glissements` +1. Les `rdv` sont ancrés, jamais glissés.
- **tick** : idempotent, une fois par jour (`meta.tick_dernier`).
- versions (anneau de 10), journal (300 entrées), corbeille — jamais de
  suppression directe.

### Conventions de code

- IIFE + API publique en bas de fichier, style `const Store = (() => {...})()`.
- Nommage, commentaires et messages **en français**.
- Les actions renvoient `{ok:true, data}` ou `{ok:false, erreur}`.
- Chaque écriture est journalisée avec une `source` ("ui", "capture",
  "systeme"…).

## Capture (opérationnel depuis le 17/07/2026)

Chaîne : raccourci iOS « Capture » (dictée) → API GitHub → `inbox.txt` du
dépôt **privé** `Laurent1meyer/sillage-inbox`. Une ligne = une capture,
format `2026-07-17 19:25 | texte dicté`.

Côté PWA, `capture.js` relève ce fichier au démarrage et au retour au
premier plan, crée une entrée par ligne via
`Store.actions.creer({titre, nature:"tache", statut:"a_planifier"}, "capture")`,
puis vide le fichier.

**Pourquoi GitHub et pas le NAS** : le NAS (Tailscale, WebDAV HTTP) est
injoignable depuis une PWA servie en HTTPS (mixed content + CORS).
Ne pas re-proposer le NAS pour la capture.

## Sécurité

- Le dépôt est **public**. Le jeton GitHub (`github_pat_…`) ne doit
  **jamais** apparaître dans le code, un commit, ou un fichier de config.
  Il vit dans le `localStorage` de chaque appareil, saisi via un bouton
  dans les Réglages.
- Ne jamais commiter d'export de données personnelles (`sillage_*.json`).

## Contraintes d'environnement

- Développement souvent depuis un iPhone → **pas de console navigateur**.
  Un `window.onerror` affiche les erreurs en `alert()` : le garder.
- localStorage n'est pas partagé entre Safari, la PWA installée et le PC.
  Le transfert se fait par export/import JSON (UTF-8, `charset=utf-8`
  obligatoire dans le Blob — sinon mojibake sur iOS).

## Discipline de projet

Sillage est un outil, pas un projet. Il est en **gel fonctionnel** après le
chantier « vue plate ». Toute idée d'amélioration qui surgit → au vivier,
pas dans le code. Refuser poliment le scope creep, y compris quand
Laurent le propose. 😄

---

# Chantier en cours : la vue plate « Actives aujourd'hui »

## Le besoin (mot pour mot)

« Il me faudrait une vision directe de la tâche, pas des parents. Si je dois
réparer le mur, j'ai la tâche "réparer le mur" qui apparaît, mais pas
"entretenir la maison" — l'info n'est pas utile ! »

## Ce qu'il faut faire

1. **Vue par défaut à l'ouverture** : une liste **plate**, tous projets
   confondus, des tâches réellement actionnables aujourd'hui.
   Source : `Store.duJour()` existe déjà — l'utiliser plutôt que de
   réinventer.
2. **Pas de hiérarchie affichée** : ni le parent, ni le chemin
   (`Store.chaine()`), ni le tag de projet en évidence. Le titre de la
   tâche, et c'est tout. Un indice discret du domaine (perso/pro) est
   acceptable.
3. **Tri** : rdv ancrés du jour en premier (par heure), puis les tâches.
   Discuter du critère secondaire avec Laurent avant de coder
   (ancienneté ? glissements ? ordre libre ?).
4. **La structure par projets reste disponible** — elle sert à la revue
   hebdomadaire, pas à l'action quotidienne. Ne rien supprimer, juste
   changer ce qui est montré par défaut.

## Méthode attendue

- Modifier `ui.js` uniquement. `store.js` ne doit pas bouger : tout ce qui
  est nécessaire s'y trouve déjà (`duJour`, `actifs`, `vivier`).
- Proposer avant de coder si un choix d'affichage est ambigu.
- Commit atomique, message en français.
