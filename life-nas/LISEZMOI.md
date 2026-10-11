# Life NAS

La porte d'entrée de Life vers les fichiers du NAS : lister des dossiers et lire un fichier (vidéo comprise), en lecture seule, avec un jeton.

Pourquoi ce serveur : Life est une page HTTPS (laurent1meyer.github.io). Elle ne peut appeler qu'une adresse **HTTPS** qui **l'autorise** (CORS). Le NAS seul ne fait ni l'un ni l'autre pour ses fichiers. Ce petit serveur fait l'autorisation ; Tailscale fait le HTTPS.

## Installation (une fois, environ 20 minutes)

1. **Le dossier.** Dans File Station, crée `docker/life-nas` et dépose-y `serveur.js` et `docker-compose.yml`.
2. **Le jeton.** Crée-y aussi `life-nas.env` contenant une seule ligne : `JETON=` suivi d'une longue suite aléatoire (au moins 16 caractères). Garde-la : Life te la demandera une fois.
3. **Les dossiers lus.** Dans `docker-compose.yml`, vérifie la ligne `/volume1/video:/data/Vidéos:ro` : le chemin de gauche doit être ton partage vidéo. Ajoute d'autres partages sur le même modèle.
4. **Le conteneur.** Container Manager › Projet › Créer › chemin `docker/life-nas` › il trouve le `docker-compose.yml` › Suivant › Terminé.
   Vérification sur le NAS : `curl http://127.0.0.1:8787/` doit répondre `{"nom":"Life NAS",…}`.
5. **Le HTTPS par Tailscale.**
   - Console d'administration Tailscale (login.tailscale.com) › **DNS** : MagicDNS activé, et **HTTPS Certificates** activé.
   - Sur le NAS, en SSH (Panneau de configuration › Terminal et SNMP › activer SSH) :
     ```
     sudo /var/packages/Tailscale/target/bin/tailscale serve --bg http://127.0.0.1:8787
     ```
   - La commande affiche l'adresse : `https://<nom-du-nas>.<ton-tailnet>.ts.net/`. Ouvre-la dans Safari sur l'iPhone (Tailscale activé) : tu dois voir la description `Life NAS`.
6. **Dans Life.** Sur ton objet « NAS Synology », mets le champ `url = https://<nom-du-nas>.<ton-tailnet>.ts.net`. Puis demande à Claude : « Je veux lire une vidéo de mon NAS ». Il lit la description du serveur, te demande le jeton une fois (rangé au coffre) et écrit les verbes.

## Sécurité
- Lecture seule ; rien ne peut être modifié ou effacé.
- Accessible uniquement depuis ton tailnet (pas d'Internet public : `tailscale serve`, pas `funnel`).
- Jeton obligatoire pour tout sauf la description ; il n'est jamais dans le dépôt.
- Le jeton passe dans l'adresse pour les vidéos (une balise `<video>` ne peut pas envoyer d'en-tête) : il reste dans ton tailnet, en HTTPS.

## Limites
- L'iPhone lit le MP4 et le MOV, pas le MKV.
- Tailscale doit être actif sur l'iPhone.
