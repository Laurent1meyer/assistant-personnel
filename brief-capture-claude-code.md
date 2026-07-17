# Chantier « Capture » — finalisation

Lis d'abord `CLAUDE.md` à la racine du dépôt : il contient l'architecture,
les conventions et les contraintes du projet. Ce qui suit est la liste des
points restants, à traiter dans l'ordre.

Propose ton plan avant de coder. Un commit atomique par point, message en
français.

---

## 1. Corriger le Blob d'export (bug, iOS)

Dans `ui.js`, autour de la ligne 456, le Blob de l'export est écrit :

```js
new Blob([Store.exporter()],{type:"application/json";charset=utf-8})}
```

Le `;charset=utf-8` est **hors de la chaîne** et il y a une accolade en
trop. Attendu :

```js
new Blob([Store.exporter()],{type:"application/json;charset=utf-8"});
```

Sans le charset, Safari devine mal l'encodage et l'export ressort en
mojibake (« VÃ©hicule Ã©lectrique »). Vérifie s'il existe d'autres
`new Blob` ou `new File` dans le fichier (notamment le bouton « Partager »)
et applique la même correction là où c'est pertinent.

## 2. Intégrer `capture.js`

Le fichier `capture-github.js` (dans mes Téléchargements, je te le fournis)
sert de référence — reprends-le, adapte-le à mes conventions si besoin, et
place-le à la racine sous le nom `capture.js`.

Ce qu'il fait :
- GET `inbox.txt` du dépôt privé `Laurent1meyer/sillage-inbox` via l'API
  GitHub (`https://api.github.com/repos/.../contents/inbox.txt`)
- décode le Base64 **en UTF-8 strict** (`atob` seul casse les accents)
- une ligne = une capture, format `2026-07-17 19:25 | texte dicté`
- crée une entrée au vivier par ligne :
  `Store.actions.creer({titre, nature:"tache", statut:"a_planifier",
  champs:{capture: horodatage}}, "capture")`
- purge le fichier (PUT contenu vide, avec le `sha`) **après** insertion
- anti-doublon sur le couple (horodatage, titre)
- silencieux si hors ligne : ne jamais bloquer le démarrage de la PWA

Intégration :
- `<script src="capture.js"></script>` dans `index.html`, **après**
  `store.js`
- `Capture.init(...)` appelé **après** `Store.init(...)` dans `ui.js`,
  comme instruction à part entière (pas dans un objet, pas dans un `case`)
- brancher le retour sur le `toast()` existant de `ui.js` :
  `Capture.init({ alerter: n => toast(n + " capture(s) au vivier") })`

## 3. Bouton « Configurer la capture »

Il existe déjà mais il a été collé n'importe où (en bas d'`index.html`,
hors du panneau Réglages). Déplace-le **dans le panneau Réglages**, près
des boutons « Exporter (sauvegarde) » / « Partager… », dans le style des
autres boutons (`class="btn"`).

Comportement : demande le jeton, le stocke en localStorage via
`Capture.definirJeton(...)`, puis déclenche une relève.

⚠️ **Le jeton `github_pat_…` ne doit jamais être écrit dans le code, un
commit ou un fichier de config. Le dépôt est public.**

## 4. Audit de sécurité du dépôt

Vérifie que le dépôt public ne contient aucun export de mes données
personnelles ni aucun secret :
- fichiers du type `sillage_*.json`, `sillage_seed_v2.json`, sauvegardes
- toute chaîne ressemblant à `github_pat_`, un mot de passe ou un jeton,
  dans les fichiers **et dans l'historique git**

Si tu trouves quelque chose : dis-le-moi et propose la marche à suivre
(suppression + rotation du secret le cas échéant) avant d'agir.

## 5. Filet de sécurité à conserver

Le `window.onerror` en haut de `<head>` qui affiche les erreurs en
`alert()` : **ne pas le retirer**. Je développe souvent depuis un iPhone,
où aucun navigateur ne donne accès à une console.

## 6. Test

Explique-moi comment vérifier de bout en bout : je dicte une capture sur
l'iPhone, elle doit apparaître dans le vivier de la PWA, et `inbox.txt`
doit être vidé.
