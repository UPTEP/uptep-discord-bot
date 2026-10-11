# UPTEP — Bot Discord

Bot Node.js pour demander des ressources, déclarer des convois, valider, terminer ou annuler des demandes et annuler des déclarations. Trois commandes slash permettent aussi aux chefs de consulter les historiques et les statistiques des convois. Il utilise exclusivement l’API UPTEP et ne se connecte pas directement à PostgreSQL.

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

Le bot nécessite Voir le salon, Envoyer des messages, Intégrer des liens et Voir les anciens messages. Aucun intent privilégié ni permission Administrateur Discord n’est requis. Un seul serveur est actif par processus. Le tableau et ses boutons utilisent le salon défini par `CONVOY_CHANNEL_ID` ; les trois commandes de rapports sont utilisables dans tous les salons de ce serveur.

Les joueurs doivent être associés par leur ID Discord dans `chaine_members` et présents dans UPTEP. Le droit chaîne d’un compte actif ou la liste `ADMIN_DISCORD_IDS` accorde les actions administratives. Cette liste est relue par l’API sur le même serveur dans `/home/uptep/discord-bot/.env` ; déplacer le bot sur une autre machine nécessite d’adapter cette configuration côté API. Elle ne contourne pas l’association obligatoire.

Les demandes utilisent JJ-MM-AAAA dans les formulaires. La déclaration de convoi accepte une ligne du jeu ou une saisie manuelle. Le bot ne lance ni n’annule aucun envoi dans Fourmizzz : il gère le suivi.

Changer les IDs de serveur/salon dans `.env`, puis redémarrer pour basculer. Un salon Discord de test utilise la vraie base si l’API configurée reste celle de production. Prévoir une API distincte pour isoler entièrement les tests.

## Données locales

`data/state.json` contient l’ID du tableau et les confirmations privées avec leur commande idempotente. Garder ce dossier lors des déploiements. Ne jamais publier ce fichier ni `.env`. Les réponses privées expirent après cinq minutes ; les messages de réussite après dix secondes. Ces minuteries ne survivent pas à un redémarrage du processus.

`npm test` exécute les tests locaux sans envoyer de messages Discord ni modifier l’API. Les secrets ne sont pas inclus. Code sous licence MIT.

## Commandes slash : historiques et statistiques

Les trois commandes ci-dessous fonctionnent dans **tous les salons du serveur configuré**, avec leur pagination et le détail des demandes. Leurs réponses sont **privées** : seul l’utilisateur de la commande les voit.

Pour les utiliser, saisir `/` dans Discord, choisir une commande du bot UPTEP+, puis renseigner les options souhaitées. Sans filtre, le rapport couvre les **7 derniers jours**, journée en cours incluse.

### `/historique-demandes`

Consulter les demandes de ressources, y compris celles qui sont terminées ou annulées.

| Option facultative | Utilisation |
| --- | --- |
| `joueur` | Pseudo exact du demandeur en jeu. |
| `etat` | Tous les états, À valider, En cours, Terminées ou Annulées. |
| `periode`, `debut`, `fin` | Choisir la période décrite plus bas. |

La liste affiche le demandeur, l’objet et le niveau, les quantités demandées, l’état et les dates de création, de validation et de fin ou d’annulation. **Sélectionner une demande dans le menu** pour consulter les quantités restantes, le validateur, la date souhaitée et les convois associés, toutes dates confondues. Le détail distingue une clôture automatique d’une clôture manuelle.

Exemple : choisir `/historique-demandes`, puis `joueur:Achak` et `etat:Terminées` pour retrouver les demandes terminées d’Achak créées pendant la période sélectionnée.

### `/historique-convois`

Consulter les déclarations de convois avec leurs quantités, l’expéditeur, le destinataire, le numéro de demande, la date d’envoi et l’arrivée prévue.

| Option facultative | Utilisation |
| --- | --- |
| `expediteur` | Pseudo exact du joueur qui a envoyé les ressources. |
| `destinataire` | Pseudo exact du joueur qui les reçoit. |
| `demande` | Numéro de la demande, sans le `#`. |
| `periode`, `debut`, `fin` | Choisir la période décrite plus bas. |

Les déclarations annulées restent visibles, avec la mention **Annulé**, la date et l’auteur de l’annulation.

Exemple : `/historique-convois demande:11` affiche les convois de la demande nº 11 envoyés pendant la période sélectionnée. Pour retrouver tous ses convois indépendamment de leur date, ouvrir le détail de la demande depuis `/historique-demandes`.

### `/stats-convois`

Afficher, pour chaque joueur ayant une activité pendant la période :

- les quantités de nourriture et de matériaux envoyées et reçues ;
- le nombre de convois envoyés et reçus ;
- les moyennes quotidiennes envoyées et reçues, pour chaque ressource.

| Option facultative | Utilisation |
| --- | --- |
| `joueur` | Limiter le bilan à un pseudo exact en jeu. |
| `periode`, `debut`, `fin` | Choisir la période décrite plus bas. |

Exemple : choisir `/stats-convois`, puis `joueur:Achak` et `periode:30 jours` pour consulter son bilan sur 30 jours.

**Calcul : total sur la période ÷ nombre de jours de la période.** Les jours sans activité sont inclus : 70 000 matériaux envoyés sur 7 jours donnent une moyenne de 10 000 par jour, même si tous les envois ont eu lieu le même jour. Les convois annulés sont exclus des totaux et des nombres de convois. Les joueurs sans mouvement pendant la période ne sont pas listés.

### Périodes, filtres et navigation

Les trois commandes partagent les mêmes options de dates :

| Option | Valeurs et comportement |
| --- | --- |
| `periode` | **7 jours** par défaut, **30 jours** ou **Dates personnalisées**. |
| `debut` | Date de début au format **JJ-MM-AAAA**, incluse. |
| `fin` | Date de fin au format **JJ-MM-AAAA**, incluse. |

Pour une période personnalisée, renseigner **les deux dates**, par exemple `debut:01-10-2026 fin:11-10-2026`. Elles prennent le dessus sur le choix de période. La durée maximale est de 366 jours et aucune date ne peut être future. Les périodes de 7 ou 30 jours incluent la journée en cours ; les dates et heures utilisent le fuseau **Europe/Paris**.

La période filtre la **date de création** pour les demandes et la **date d’envoi déclarée** pour les convois et les statistiques. Les filtres par pseudo attendent le pseudo exact en jeu, sans distinction entre majuscules et minuscules. Plusieurs filtres peuvent être combinés.

Les rapports affichent jusqu’à **8 résultats par page**. Les boutons **Précédent** et **Suivant** permettent de naviguer ; le détail d’une demande propose aussi **Retour aux demandes**. Les messages privés disparaissent après cinq minutes : relancer la commande pour consulter à nouveau le rapport.

### Droits et configuration

Ces commandes exigent les deux conditions suivantes :

- l’ID Discord figure dans `ADMIN_DISCORD_IDS` du `.env` ;
- cet ID est associé de façon unique dans `chaine_members` à un joueur actuellement membre d’UPTEP.

**Le droit chaîne seul ne donne pas accès à ces trois commandes.** Le bot et l’API contrôlent les droits à chaque lecture, y compris lors de la pagination. Les commandes peuvent apparaître dans le menu Discord à un non-chef, mais leur utilisation est refusée.

Les commandes sont enregistrées automatiquement au démarrage dans le serveur défini par `DISCORD_GUILD_ID`. Le bot lit la liste des chefs dans le `.env` de son répertoire de travail ; l’API la lit dans `/home/uptep/discord-bot/.env`. Une suppression de la liste prend effet sans redémarrage. Le secret API doit posséder le scope **`rapports:read`**. Les rapports utilisent les tables existantes : aucune migration de base n’est nécessaire.

### Interprétation des données

Les chiffres représentent les **envois déclarés au bot**, sans confirmation de livraison dans Fourmizzz. Les heures d’arrivée sont prévisionnelles. La date de fin d’une demande correspond à la clôture des déclarations, automatique ou manuelle ; elle ne prouve pas l’arrivée des ressources dans le jeu.

## Ajuster le restant d’une demande

Le bouton bleu **Modifier une demande**, dans le tableau des convois, permet au demandeur ou à un responsable (droit chaîne ou liste `ADMIN_DISCORD_IDS`) de modifier une demande **validée et en cours**.

1. Choisir la demande.
2. Renseigner le **nouveau total encore nécessaire** pour chaque ressource dans le formulaire prérempli. Exemple : 80 000 matériaux restants moins 30 000 produits = saisir **50 000**, pas 30 000.
3. Vérifier les anciennes et nouvelles quantités, puis confirmer.

Les quantités initiales et les convois déclarés sont conservés. Les ajustements sont historisés séparément avec leur auteur, la date et les valeurs avant/après ; les derniers sont visibles dans Consulter et dans le détail de `/historique-demandes`. Ils ne comptent pas comme des livraisons dans `/stats-convois`. La barre de progression reflète la part du besoin couverte par les convois et les ajustements.

Les restants peuvent être corrigés à la hausse dans la limite du montant initial moins les convois non annulés. Si les deux restants sont mis à zéro, la demande est terminée manuellement. Si un convoi ou un autre ajustement change le restant pendant la saisie, le bot refuse cette confirmation : repartir de **Modifier une demande** pour ouvrir un formulaire à jour.

Déploiement : appliquer `app/bot-demand-adjustments.sql` du dépôt du site sur une base existante, déployer l’API correspondante, et ajouter le scope `demandes:adjust` au secret du bot. Les nouvelles installations utilisent le schéma complet de la base UPTEP, qui inclut cette table.
