# Life_heart — le cœur de Life

`Life_heart.json` décrit tout ce qui fait l'application : interface, verbes, règles, types.
Le noyau (code natif minimal) ne sait que charger ce fichier, trouver un objet, exécuter un
verbe et déclencher les raccourcis. Tout le reste est un objet de ce fichier.

## Ce qui n'entre jamais ici

Aucune donnée de vie (tâches, contacts, lieux, rendez-vous). **Ce dépôt est public.**
Les données restent dans la base de l'appareil (puis sur le NAS).

## Branches

| Branche | Rôle | Qui écrit |
|---|---|---|
| `main` | version validée, celle qu'on utilise | Laurent, par fusion uniquement |
| `claude/<sujet>` | un essai de Claude, une brique à la fois | Claude |
| `laurent/<sujet>` | un essai de Laurent | Laurent |

Chaque proposition de Claude = un commit sur sa branche + une pull request vers `main`.
Laurent l'essaie depuis le lanceur (les branches ouvertes y apparaissent en orange), puis
fusionne ou ferme. Rien n'entre dans `main` sans cette fusion.

## Versions

`version` suit `majeur.mineur.correctif` :
- correctif : un objet corrigé sans changer son sens ;
- mineur : un objet ou un verbe ajouté ;
- majeur : un changement qui casse ce qui existe (un champ renommé, un verbe retiré).

Chaque fusion dans `main` qui change la version reçoit une étiquette Git `heart-vX.Y.Z`.

## Format

Un objet par ligne, champs dans un ordre stable : une modification apparaît comme une
seule ligne changée dans la pull request.
