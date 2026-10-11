# UPTEP — Bot Discord

Bot Node.js pour demander des ressources, déclarer des convois, valider, terminer ou annuler des demandes et annuler des déclarations. Il utilise exclusivement l’API UPTEP et ne se connecte pas directement à PostgreSQL.

## Installation

Node.js 24.17 minimum. Installer les sources hors du répertoire web, par exemple `/home/uptep/discord-bot`, puis :

```sh
npm ci --omit=dev --ignore-scripts
cp .env.example .env
chmod 600 .env
```

Renseigner le token Discord, l’ID de l’application, du serveur et du salon, ainsi que le secret API UPTEP. `npm run check` contrôle la configuration et les lectures API sans envoyer de message Discord ; `npm start` démarre le bot et publie ou retrouve son tableau dans le salon configuré.

Avec PM2 : `pm2 start ecosystem.config.cjs`, puis `pm2 save`. Adapter le chemin de l’interpréteur Node dans ce fichier à l’installation. Configurer séparément le démarrage automatique du gestionnaire de processus.

## Accès et fonctionnement

Le bot nécessite Voir le salon, Envoyer des messages, Intégrer des liens et Voir les anciens messages. Aucun intent privilégié ni permission Administrateur Discord n’est requis. Un seul serveur/salon est actif par processus.

Les joueurs doivent être associés par leur ID Discord dans `chaine_members` et présents dans UPTEP. Le droit chaîne d’un compte actif ou la liste `ADMIN_DISCORD_IDS` accorde les actions administratives. Cette liste est relue par l’API sur le même serveur dans `/home/uptep/discord-bot/.env` ; déplacer le bot sur une autre machine nécessite d’adapter cette configuration côté API. Elle ne contourne pas l’association obligatoire.

Les demandes utilisent JJ-MM-AAAA dans les formulaires. La déclaration de convoi accepte une ligne du jeu ou une saisie manuelle. Le bot ne lance ni n’annule aucun envoi dans Fourmizzz : il gère le suivi.

Changer les IDs de serveur/salon dans `.env`, puis redémarrer pour basculer. Un salon Discord de test utilise la vraie base si l’API configurée reste celle de production. Prévoir une API distincte pour isoler entièrement les tests.

## Données locales

`data/state.json` contient l’ID du tableau et les confirmations privées avec leur commande idempotente. Garder ce dossier lors des déploiements. Ne jamais publier ce fichier ni `.env`. Les réponses privées expirent après cinq minutes ; les messages de réussite après dix secondes. Ces minuteries ne survivent pas à un redémarrage du processus.

`npm test` exécute les tests locaux sans envoyer de messages Discord ni modifier l’API. Les secrets ne sont pas inclus. Code sous licence MIT.

## Historiques et statistiques (chefs)

Trois commandes slash sont enregistrées au démarrage dans le serveur configuré et utilisables dans le salon des convois. Leurs réponses sont privées, avec pagination et sélection d’une demande pour afficher son détail et tous ses convois :

- `/historique-demandes` : filtre `joueur` (pseudo exact), `etat`, période. Quantités initiales/restantes, création, validation, clôture, annulation et clôture manuelle sont conservées.
- `/historique-convois` : filtre `expediteur`, `destinataire`, `demande`, période. Les déclarations annulées restent visibles et identifiées.
- `/stats-convois` : envois et réceptions par joueur, nourriture/matériaux séparés, nombres de convois et moyennes quotidiennes. Filtre `joueur` facultatif.

La période vaut 7 jours par défaut (aujourd’hui et les six jours précédents, heure de Paris). `periode:30j` affiche 30 jours ; `debut:01-10-2026 fin:11-10-2026` définit une période inclusive de 366 jours maximum. Les jours sans activité comptent dans la moyenne ; les joueurs sans mouvement ne sont pas listés. Les filtres par pseudo sont exacts, sans distinction de casse.

Exemples : `/stats-convois periode:7j joueur:Achak`, `/historique-demandes etat:terminee`, `/historique-convois demande:11`.

**Ces trois commandes exigent la présence dans `ADMIN_DISCORD_IDS` ET une association unique à un membre actuel UPTEP. Le droit chaîne seul ne suffit pas.** Bot et API vérifient les droits à chaque lecture, y compris pagination. Le bot lit `.env` depuis son répertoire de travail ; une suppression de la liste prend effet sans redémarrage. Le secret API nécessite le scope `rapports:read`. Les commandes peuvent apparaître dans le menu Discord à un non-chef, mais leur utilisation sera refusée.

Les historiques des demandes utilisent la date de création ; les convois et statistiques utilisent `date_convoi`. Les statistiques excluent les convois annulés, et comptent les envois déclarés, sans confirmation de livraison dans le jeu. La fin d’une demande est la clôture des déclarations, automatique ou manuelle, pas une preuve d’arrivée. Les dates d’arrivée restent prévisionnelles. Aucune nouvelle table n’est nécessaire.
