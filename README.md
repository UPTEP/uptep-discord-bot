# UPTEP — Bot Discord

Bot Node.js pour demander des ressources, déclarer des convois, valider, terminer ou annuler des demandes et annuler des déclarations. Les commandes slash permettent de consulter les historiques et statistiques, de classer les livraisons par distance et de suivre le solde de terrain. Le bot annonce les validations dans le salon et notifie les destinataires des convois par MP. Il utilise exclusivement l’API UPTEP et ne se connecte pas directement à PostgreSQL.

## Repères rapides

| Fonction | Accès | Résultat |
| --- | --- | --- |
| `/livraisons vitesse:7` | Joueur associé à Discord | Liste privée des demandes validées, distances et trajets estimés. |
| `/historique-demandes`, `/historique-convois`, `/stats-convois` | Chefs de `ADMIN_DISCORD_IDS` associés | Historiques et statistiques privés. |
| `/solde-terrain` | ID de test autorisé, voir section dédiée | Lecture incrémentale des rapports, sauvegarde via l’API et solde public. |
| Validation d’une demande via le bot | Droit chaîne ou administrateur associé | Annonce `@everyone` dans le salon des convois. |
| Déclaration d’un convoi via le bot | Joueur associé | MP au demandeur : expéditeur, quantités et arrivée prévue. |

Les MP bloqués sont abandonnés sans annonce de secours dans le salon. Les notifications concernent les nouvelles opérations effectuées via le bot et ne sont pas envoyées rétroactivement.

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

Le bot nécessite Voir le salon, Envoyer des messages, Intégrer des liens et Voir les anciens messages. La permission « Mentionner @everyone, @here et tous les rôles » est nécessaire pour les annonces de validation. Message Content Intent est nécessaire uniquement au suivi `/solde-terrain`. La permission Administrateur Discord n’est pas nécessaire. Un seul serveur est actif par processus. Le tableau et ses boutons utilisent le salon défini par `CONVOY_CHANNEL_ID` ; les commandes slash sont utilisables dans tous les salons et fils accessibles de ce serveur, sous réserve des droits propres à chaque commande.

Les joueurs doivent être associés par leur ID Discord dans `chaine_members` et présents dans UPTEP. Le droit chaîne d’un compte actif ou la liste `ADMIN_DISCORD_IDS` accorde les actions administratives. Cette liste est relue par l’API sur le même serveur dans `/home/uptep/discord-bot/.env` ; déplacer le bot sur une autre machine nécessite d’adapter cette configuration côté API. Elle ne contourne pas l’association obligatoire.

Les demandes utilisent JJ-MM-AAAA dans les formulaires. La déclaration de convoi accepte une ligne du jeu ou une saisie manuelle. Le bot ne lance ni n’annule aucun envoi dans Fourmizzz : il gère le suivi.

Changer les IDs de serveur/salon dans `.env`, puis redémarrer pour basculer. Un salon Discord de test utilise la vraie base si l’API configurée reste celle de production. Prévoir une API distincte pour isoler entièrement les tests.

## Données locales

`data/state.json` contient l’ID du tableau, les confirmations privées avec leur commande idempotente et les files/statuts des annonces de validation et des MP de convois. Garder ce dossier lors des déploiements. Ne jamais publier ce fichier ni `.env`. Les réponses privées des boutons du tableau et des rapports sont supprimées après cinq minutes ; les messages de réussite après dix secondes. `/livraisons` reste éphémère mais n’utilise pas cette minuterie. `/solde-terrain` supprime sa progression privée après succès et publie le solde dans le salon. Ces minuteries ne survivent pas à un redémarrage du processus.

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

## `/solde-terrain` — suivi persistant

Commande sans paramètre, utilisable dans les salons textuels et fils du serveur configuré. **Seul l’ID Discord `1544667516364652659` peut l’exécuter**, indépendamment de `ADMIN_DISCORD_IDS` et des droits chaîne. Les autres utilisateurs peuvent voir la commande mais sont refusés avant toute lecture ou analyse.

Au premier lancement, le bot lit l’historique accessible du salon/fil courant, analyse les rapports avec Luna puis les enregistre via l’API UPTEP. Le suivi est séparé par serveur et salon/fil. Les lancements suivants ne lisent que les messages postérieurs au dernier message enregistré. Les rapports sources, mouvements, avertissements et curseur sont sauvegardés ensemble dans une transaction PostgreSQL ; Codex n’a aucun accès à la base.

Après enregistrement, le bot publie uniquement `Solde : +1 234 cm²` dans le salon. La progression et les erreurs restent éphémères ; le message de progression disparaît après succès. Aucun fichier de synthèse n’est généré. Les fichiers de travail Codex sont supprimés par le lanceur. En cas d’échec de publication, le prochain lancement reprend le solde enregistré avant toute nouvelle analyse. Un nonce Discord stable limite les doubles publications lors des reprises rapprochées ; une coupure prolongée entre publication et accusé API peut toutefois entraîner une répétition du message de solde, sans doubler les mouvements.

L’API nécessite les scopes `terrain:read`, `terrain:write` et `terrain_guild_id` correspondant au serveur du bot. Routes : `GET /terrain/{guild_id}/{channel_id}`, `POST …/lots` et `POST …/publication`. Les lots utilisent l’ID d’interaction comme clé d’idempotence. Le total publié est calculé par PostgreSQL à partir des mouvements enregistrés.

Activer **Message Content Intent** dans le portail développeur Discord → Bot. Le bot doit avoir Voir le salon, Lire l’historique et Envoyer des messages (dans les fils également), y compris l’accès au fil privé concerné. Pas de permission Administrateur nécessaire. La commande vérifie le privilège de contenu avant de lire l’historique via REST ; elle n’ajoute pas de souscription Gateway aux messages.

Les phrases standard du jeu sont désormais extraites et comptées par le code avant l’analyse IA. Chaque occurrence possède une référence `message:position` : trois lignes identiques de 800 cm² restent trois attaques, même à la même minute. Luna enrichit les identités/dates et interprète les passages non standard. Une opération standard omise par Luna reste comptée et son absence d’enrichissement est signalée.

Titres et détails ne doivent pas être additionnés deux fois. L’IA reçoit des règles pour les rapports incomplets, les recopies, les contradictions et les dates. Les références, citations et montants sont revérifiés dans le texte original avant totalisation ; un résultat incohérent est refusé. Pour chaque bloc standard, les détails sont retenus quand leur somme atteint ou dépasse le titre : un titre ancien de 2 044 suivi des attaques de 2 044, 1 600 et 313 donne 3 957, avec avertissement, sans additionner le titre. Si le détail est inférieur au titre, le total du titre est conservé une seule fois avec avertissement. Une recopie intégrale datée du même auteur est dédupliquée ; des lignes identiques dans un rapport ou des messages d’auteurs différents ne sont pas supprimés automatiquement. Les extraits non standard utilisent un numéro d’occurrence explicite et ne peuvent ajouter un titre/détail déjà couvert. L’interprétation IA reste à vérifier dans le détail, en particulier si plusieurs messages se chevauchent. Les pièces jointes/images ne sont pas analysées et sont signalées. La date d’envoi Discord n’est pas assimilée à la date d’attaque.

Limites actuelles : une analyse à la fois, 20 000 messages et 200 000 caractères de données JSON, délai Codex de 8 minutes. Un dépassement refuse le bilan plutôt que tronquer silencieusement la conversation. Les anciennes modifications et suppressions de messages ne sont pas relues automatiquement. Les recopies intégrales datées du même auteur sont aussi dédupliquées entre deux lancements ; les recopies partielles ou reformulées peuvent nécessiter une correction manuelle. Les limites portent sur les nouveaux messages à analyser. Les messages sont envoyés à OpenAI pour l’analyse et consomment les quotas de la connexion Codex configurée.

### Lanceur Codex isolé

`CODEX_MODEL=gpt-6-luna` et `TERRAIN_CODEX_RUNNER=/usr/local/libexec/uptep-terrain-codex` configurent le bot. Le lanceur Python fourni dans `ops/` fonctionne sous le compte système dédié `uptep-codex` (home `/var/lib/uptep-codex`, shell nologin). Son installation et son authentification nécessitent une configuration administrateur explicite ; ne jamais versionner `auth.json`.

- Binaire Codex : `/opt/uptep-codex/codex`, schéma : `/opt/uptep-codex/terrain-schema.json` ; détenus par root, non modifiables par le bot.
- Lanceur : `/usr/local/libexec/uptep-terrain-codex`, root, mode 755. Seul argument accepté : `gpt-6-luna`.
- Home, `.codex` et `jobs` du compte dédié : mode 700 ; connexion Codex privée dans `.codex`, mode 600. Le compte ne doit pas avoir accès aux secrets du site/bot.
- Si approuvée par l’administrateur, règle sudo strictement limitée : `uptep ALL=(uptep-codex) NOPASSWD: /usr/local/libexec/uptep-terrain-codex gpt-6-luna`.
- Entrée via stdin, jamais via une commande shell interpolée. Environnement filtré, pas de token Discord/API UPTEP transmis. Configuration utilisateur ignorée, shell/apps/navigation/multi-agent désactivés, sandbox lecture seule, session éphémère.
- Répertoire de tâche temporaire supprimé à la fin, sortie JSON vérifiée. Les logs Codex ne sont ni envoyés à Discord ni conservés par ce lanceur. La connexion persistante reste privée au compte dédié.

Tests : `npm test` couvre les contrôles d’identité/serveur, les réponses éphémères, la pagination, les limites, le calcul, les preuves sources, les doublons de sélection et les erreurs. Ne pas démarrer `src/index.js` pour un test hors ligne : le démarrage normal maintient le tableau public de convois existant.

Les mouvements terrain conservent `member_discord_id` quand le nom du propriétaire du rapport correspond sans ambiguïté aux noms Discord des participants lus. Cet ID est résolu par le bot depuis les métadonnées Discord et non inventé par Luna. En cas d’ambiguïté il reste null ; `terrain_discord_reports.author_id` conserve séparément l’auteur du message source.

## `/livraisons vitesse:7`

Disponible à tous les membres associés à un joueur UPTEP via `chaine_members.iddiscord`, dans tous les salons et fils du serveur configuré. Aucun compte sur le site nécessaire. Le niveau de **Vitesse d’attaque** est obligatoire (0 à 999), utilisé uniquement pour ce calcul et jamais sauvegardé.

La réponse est privée et liste les demandes validées en cours des autres joueurs, avec leurs ressources restantes, la distance arrondie au supérieur et le temps aller estimé. Le tri utilise la distance exacte. Les coordonnées viennent des derniers relevés fzzz ; les coordonnées manquantes sont signalées et placées en dernier. Les pages de huit demandes se parcourent avec Précédent/Suivant, réservés à l’auteur de la commande. Une demande par ligne, même si un destinataire en a plusieurs. Aucun convoi n’est envoyé ou déclaré.

Endpoint : `GET /livraisons?discord_id=…&vitesse=7&page=1`, scope existant `demandes:read`. Une association absente ou ambiguë invite à contacter NoobEnCDI. La formule de trajet est celle du userscript UPTEP : `round(86400 × (1 − exp(−distance / 350)) × 7.375 × 0.9^vitesse)`.

## Annonce des validations

Après validation réussie via le bot, une annonce `@everyone` est envoyée dans `CONVOY_CHANNEL_ID`, avec le demandeur, le numéro de demande et les ressources restantes. Le bot doit avoir la permission « Mentionner @everyone, @here et tous les rôles ». Seule cette annonce autorise la mention everyone ; les autres messages gardent leurs protections de mentions.

Les annonces sont conservées dans le fichier privé `data/state.json`, avec le statut d’envoi par demande. Les échecs sont réessayés lors de l’actualisation du tableau ; un nonce stable protège les reprises rapprochées. Une coupure prolongée entre envoi Discord et sauvegarde locale peut toutefois produire un doublon. Aucune annonce rétroactive pour les demandes déjà validées avant ce déploiement. Les validations effectuées par un autre client API ne déclenchent pas cette annonce.

## MP après déclaration de convoi

Chaque convoi déclaré avec succès via le bot déclenche un MP au `discord_demandeur` de la demande. Il contient le numéro de demande/convoi, l’expéditeur, les quantités et l’arrivée prévue (date Discord dans le fuseau du destinataire, ou « Non renseignée »). Il s’agit d’une déclaration, pas d’une confirmation de réception dans le jeu.

Les MP bloqués ou destinataires inaccessibles sont abandonnés sans message public de secours. Les erreurs temporaires sont réessayées à l’actualisation du tableau. La file privée dans `data/state.json` conserve le statut par convoi pour éviter les répétitions ; aucune notification rétroactive. Comme pour les annonces, une coupure prolongée entre envoi et sauvegarde peut entraîner un doublon malgré le nonce Discord. Aucun changement de schéma SQL nécessaire.

## `/chaine`

Publie dans le salon ou fil courant un embed avec tous les membres présents de l’alliance UPTEP, présentés sur une ligne chacun : **Joueur · Grade · Flooder**, avec un lien **Flooder** : `https://s5.fourmizzz.fr/ennemie.php?Attaquer=ID_JOUEUR&lieu=1`. La commande est disponible aux joueurs associés à Discord, dans tous les salons accessibles du serveur configuré. Le bot doit pouvoir écrire et intégrer des liens. Aucune mention n’est déclenchée ; les erreurs restent privées.

Le classement suit celui du site : grades prioritaires, Passeurs du plus grand numéro au plus petit, autres grades croissants, puis membres sans grade. Les membres sortis de l’alliance ne sont pas inclus. La liste tient dans un seul embed tant que sa description ne dépasse pas 4 000 caractères. Elle est découpée uniquement au-delà de ce seuil, sans limite fixe de joueurs par bloc. Chaque exécution publie une nouvelle liste ; les anciens messages ne sont pas actualisés automatiquement. Les liens ouvrent la page d’attaque sans lancer eux-mêmes une attaque ni vérifier la portée.

API : `GET /chaine?discord_id=…`, scope existant `membres:read`. Aucun changement de schéma de base.
