# Guide des commandes UPTEP

Pour l’installation, les droits et les services de production, voir le [README](../README.md).

## Commandes slash : historiques et statistiques

Les commandes ci-dessous fonctionnent dans **tous les salons du serveur configuré**, avec leur pagination et le détail des demandes. Leurs réponses sont **privées** : seul l’utilisateur de la commande les voit.

Pour les utiliser, saisir `/` dans Discord, choisir une commande du bot UPTEP+, puis renseigner les options souhaitées. Sans filtre, les historiques et `/stats-convois` couvrent les **7 derniers jours**, journée en cours incluse. `/recap-demandes` couvre toujours tout l’historique.

### `/suspendre-demande demande:123`

Remet la demande nº 123 en attente de validation. Seuls les administrateurs de `ADMIN_DISCORD_IDS`, associés à un joueur UPTEP, peuvent l’utiliser ; le droit chaîne seul ne suffit pas. La réponse est privée. La vérification est effectuée à chaque appel côté bot et API, y compris lors d’une reprise idempotente.

Seules les demandes validées et non clôturées peuvent être suspendues. Le restant, les convois déclarés et la date de création sont conservés. La demande quitte les livraisons disponibles et son annonce de validation est retirée. Les nouveaux convois ne peuvent plus être déclarés pour cette demande avant une nouvelle validation via le bouton habituel. Une demande partiellement livrée doit être revalidée avant d’ajuster son restant ; le formulaire des demandes non validées ne doit pas réinitialiser les livraisons. La suspension est enregistrée dans les reçus transactionnels `bot_commandes`.

### `/recap-demandes`

Récapitulatif sur **tout l’historique S5**, sans option de période : demandes effectuées, validées, terminées, annulées et date de la dernière demande par joueur (heure de Paris). Les joueurs de `chaine_members` sans demande apparaissent avec des zéros et « Aucune demande » ; les anciens demandeurs restent inclus. Les demandes effectuées incluent les annulées ; les validées incluent les terminées et excluent les annulées.

Le classement suit le nombre de demandes décroissant, avec huit joueurs par page. La réponse est privée. Le bot et l’API vérifient `ADMIN_DISCORD_IDS` à chaque consultation, y compris lors d’un changement de page. Le droit chaîne ou Administrateur Discord seul ne donne pas accès. L’association à un joueur UPTEP reste requise, comme pour les autres rapports.

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

## Modifier une demande avant validation

Le bouton **Modifier une demande** permet au demandeur ou à un responsable (droit chaîne ou liste `ADMIN_DISCORD_IDS`) de corriger une demande en attente : bâtiment/recherche, niveau, pommes, matériaux et date souhaitée. Les champs sont préremplis ; vider la date permet de la supprimer. Au moins une quantité doit rester positive.

Après confirmation, la demande conserve son numéro, son auteur et sa date de création et reste **en attente de validation**. Les quantités demandées et restantes sont mises à jour ensemble. Si la demande a changé ou a été validée entre-temps, la confirmation est refusée : rouvrir le formulaire. La confirmation de validation vérifie aussi que le contenu présenté au responsable n’a pas changé.

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

## `/livraisons vitesse:7`

Disponible à tous les membres associés à un joueur UPTEP via `chaine_members.iddiscord`, dans tous les salons et fils du serveur configuré. Aucun compte sur le site nécessaire. Le niveau de **Vitesse d’attaque** est obligatoire (0 à 999), utilisé uniquement pour ce calcul et jamais sauvegardé.

La réponse est privée et liste les demandes validées en cours des autres joueurs, avec leurs ressources restantes, la distance arrondie au supérieur et le temps aller estimé. Le tri utilise la distance exacte. Les coordonnées viennent des derniers relevés fzzz ; les coordonnées manquantes sont signalées et placées en dernier. Les pages de huit demandes se parcourent avec Précédent/Suivant, réservés à l’auteur de la commande. Une demande par ligne, même si un destinataire en a plusieurs. Aucun convoi n’est envoyé ou déclaré.

Endpoint : `GET /livraisons?discord_id=…&vitesse=7&page=1`, scope existant `demandes:read`. Une association absente ou ambiguë invite à contacter NoobEnCDI. La formule de trajet est celle du userscript UPTEP : `round(86400 × (1 − exp(−distance / 350)) × 7.375 × 0.9^vitesse)`.

## Annonce des validations

Après validation réussie via Discord ou le site, une annonce `@everyone` est envoyée dans `CONVOY_CHANNEL_ID`, avec le demandeur, le numéro de demande et les ressources restantes. Le bot doit avoir la permission « Mentionner @everyone, @here et tous les rôles ». Seule cette annonce autorise la mention everyone ; les autres messages gardent leurs protections de mentions.

Les annonces sont conservées dans le fichier privé `data/state.json`, avec le statut d’envoi par demande. Les échecs sont réessayés lors de l’actualisation du tableau ; un nonce stable protège les reprises rapprochées. Une coupure prolongée entre envoi Discord et sauvegarde locale peut toutefois produire un doublon. Aucune annonce rétroactive pour les demandes déjà validées avant ce déploiement. Les validations du site passent par la file transactionnelle `convoy_web_events` puis par le service de notifications du bot. Un autre client API doit explicitement mettre en place cette transmission.

## MP après déclaration de convoi

Chaque convoi déclaré avec succès via Discord ou le site déclenche un MP au `discord_demandeur` de la demande. Il contient le numéro de demande/convoi, l’expéditeur, les quantités et l’arrivée prévue (date Discord dans le fuseau du destinataire, ou « Non renseignée »). Il s’agit d’une déclaration, pas d’une confirmation de réception dans le jeu.

Les MP bloqués ou destinataires inaccessibles sont abandonnés sans message public de secours. Les erreurs temporaires sont réessayées à l’actualisation du tableau. La file privée dans `data/state.json` conserve le statut par convoi pour éviter les répétitions ; aucune notification rétroactive. Comme pour les annonces, une coupure prolongée entre envoi et sauvegarde peut entraîner un doublon malgré le nonce Discord. Aucun changement de schéma SQL nécessaire.

## `/chaine`

Publie dans le salon ou fil courant un embed avec tous les membres présents de l’alliance UPTEP, présentés sur une ligne chacun : **Flooder · Grade · Joueur**, avec un lien **Flooder** : `https://s5.fourmizzz.fr/ennemie.php?Attaquer=ID_JOUEUR&lieu=1`. La commande est disponible aux joueurs associés à Discord, dans tous les salons accessibles du serveur configuré. Le bot doit pouvoir écrire et intégrer des liens. Aucune mention n’est déclenchée ; les erreurs restent privées.

Le classement suit celui du site : grades prioritaires, Passeurs du plus grand numéro au plus petit, autres grades croissants, puis membres sans grade. Les membres sortis de l’alliance ne sont pas inclus. La liste tient dans un seul embed tant que sa description ne dépasse pas 4 000 caractères. Elle est découpée uniquement au-delà de ce seuil, sans limite fixe de joueurs par bloc. Chaque exécution publie une nouvelle liste ; les anciens messages ne sont pas actualisés automatiquement. Les liens ouvrent la page d’attaque sans lancer eux-mêmes une attaque ni vérifier la portée.

API : `GET /chaine?discord_id=…`, scope existant `membres:read`. Aucun changement de schéma de base.

## `/aide`

Affiche un guide privé des commandes slash, des options usuelles et des droits requis. Présente également les boutons du tableau, les notifications et la procédure d’association auprès de NoobEnCDI. Disponible dans tous les salons et fils accessibles du serveur configuré, sans compte joueur associé ni appel API. Aucun message public n’est envoyé.

## Suivi des floods

Configurer `FLOOD_CHANNEL_ID` dans `.env` puis redémarrer. Le tableau public est retrouvé par son ID sauvegardé ou son marqueur `UPTEP_FLOODS_V1` et n’est pas recréé à chaque démarrage. Le salon doit appartenir au serveur configuré ; permissions nécessaires : voir, écrire, lire l’historique et intégrer des liens. Un défaut d’accès est réessayé chaque minute sans interrompre les convois.

- **Déclarer des floods** : coller jusqu’à 4 000 caractères / 20 attaques dans une modale. Le bot reconnaît le texte brut ou les liens Markdown, les durées en jours/heures/minutes/secondes ou j/h/m/s, les troupes facultatives et l’heure facultative. Terrain de chasse, Dôme et Loge sont reconnus. Les lignes peuvent commencer par un tiret ou non. Le format court `Vous allez attaquer Hardware(UPTEP) dans 8 heures 32 minutes 28 secondes` est accepté : si le lieu manque, Terrain de chasse est utilisé avec un avertissement à vérifier avant confirmation.
- **Tous les floods en cours** : liste privée paginée par arrivée, cinq attaques par page.
- **Floods vers moi** : même liste, filtrée sur le joueur associé à l’ID Discord.

L’expéditeur doit être associé à un joueur UPTEP. L’API résout chaque pseudo exact (casse ignorée) dans les joueurs présents de s5 puis recherche son ID Discord dans la chaîne. Les cibles inconnues ou sans association unique sont signalées et peuvent être enregistrées sans notification. La confirmation privée affiche les informations reconnues et les avertissements ; aucun flood n’est créé avant confirmation. Une attaque incomplète bloque tout le lot. Des attaques identiques restent distinctes, mais un retry d’une même confirmation n’ajoute rien.

L’arrivée est calculée au moment de l’envoi de la modale à partir de la durée restante. Le temps de confirmation ne la décale pas. L’heure copiée est comparée à l’heure de Paris (tolérance de deux minutes), un écart est signalé et la durée reste prioritaire. Coller un relevé récent : un texte ancien peut donner une arrivée fausse. Un formulaire expire après une heure ; une arrivée déjà passée impose de recopier le relevé. Les troupes sont conservées sous forme de texte facultatif, pas converties en terrain gagné.

Après confirmation, le bot envoie un MP par flood aux destinataires identifiés. MP bloqués : abandon silencieux, sans message public. Erreurs temporaires : nouvelles tentatives chaque minute. Les arrivées passées disparaissent des listes, mais restent archivées en base. Les files de MP persistent dans `data/state.json` ; conserver ce fichier. Comme pour les convois, le nonce réduit les doublons rapprochés sans garantir une livraison exactement une fois après une longue coupure.

API : `POST /floods/preview`, `POST /floods`, `GET /floods`. Scopes : `floods:write` et `floods:read`. Tables : `bot_flood_batches` et `floods`, migration `app/bot-floods.sql` dans le dépôt du site, intégrée à `database/uptep/schema.sql`. Aucun accès direct du bot à PostgreSQL. `/aide` présente les trois boutons.

Les messages privés des floods sont nettoyés : passage à une autre page ou confirmation supprime le message éphémère précédent ; succès et abandon disparaissent après trois secondes. Les listes, confirmations en attente et erreurs expirent après cinq minutes. Le tableau public est conservé. Ces minuteries ne survivent pas au redémarrage du bot.

Les annonces de validation sont supprimées dès que leur demande est terminée (automatiquement ou manuellement) ou annulée. Le contrôle a lieu à l’actualisation du tableau, environ chaque minute, via `GET /demandes/statuts`. Il vérifie un état fermé explicite, sans déduire la clôture d’un résultat manquant. Les annonces anciennes sont récupérables avec `ValidationNotifications.recoverAnnouncements()` puis `cleanClosed()` ; seuls les messages du bot portant le texte et le titre exacts des annonces sont concernés.

## Connexion privée au site

`/connexion` est accessible à tous les membres du serveur configuré. Le bot transmet l'identité de l'interaction à `POST /api/bot/v1/connexion`, puis répond uniquement en éphémère avec un lien personnel. Aucun paramètre ne permet de choisir un autre compte. Les messages privés et les autres serveurs sont refusés. La connexion nécessite une association Discord/joueur UPTEP unique, définie par un administrateur. Plusieurs membres peuvent demander leur lien simultanément.

Ce parcours est une connexion par lien privé, pas OAuth2. Le lien est un secret temporaire : il expire en 120 secondes, ne fonctionne qu'une fois et chaque nouvelle demande remplace le précédent. Ne pas le partager. Le site affiche le compte et demande confirmation avant d'ouvrir la session. Les refus et erreurs ne doivent jamais journaliser le lien ou le secret API.

Si ton ID Discord est déjà associé par un administrateur à un joueur mais qu’aucun compte UPTEP n’existe, le lien propose de créer un compte membre à la confirmation. Un compte existant non lié doit être associé explicitement par un administrateur ; aucun compte désactivé n’est réactivé.

La simulation `/connexion-test` a été retirée. `/connexion` est ouverte à tous les membres du serveur. La création d’un compte utilise le pseudo du joueur comme identifiant et nom affiché, puis le site propose de définir un mot de passe. Les migrations et tests isolés du dépôt du site conservent la couverture des inscriptions.

## Déclaration des chasses

Salon `HUNT_CHANNEL_ID`, pour les membres qui n’utilisent pas UPTEP+.

- **Déclarer mes chasses** ouvre un formulaire : colle le bloc « Chasse en cours » de la page Chasse ou Ressources (50 chasses maximum, 4 000 caractères).
- Formats reconnus : « Vos chasseuses vont conquérir 2 205 cm² dans 3 heures 19 minutes 31 secondes », avec ou sans « Arrivée à 09h26 », et « +2 573 cm² · retour dans 3 h 08 (aujourd’hui 23 h 55) ». Plusieurs chasses peuvent être collées d’un coup.
- L’arrivée est l’heure d’envoi du formulaire plus la durée copiée. Si le rapport donne aussi une heure d’arrivée et que les deux diffèrent de plus de 2 minutes (copie ancienne), l’heure copiée est retenue et signalée.
- Une confirmation privée liste chaque chasse (surface, arrivée) et le total. Rien n’est enregistré avant **Confirmer**.
- Une déclaration Discord ajoute ou met à jour des chasses ; elle n’en annule jamais. Une chasse déjà relevée par UPTEP+ (même surface, arrivée à 3 minutes près) n’est pas dupliquée.
- **Mes chasses en cours** liste les chasses enregistrées du joueur, avec leur source (Discord ou UPTEP+).
- **Toutes les chasses en cours** liste les chasses de toute l’alliance par ordre d’arrivée (joueur, surface, heure et temps restant), 10 par page, avec le nombre total et la surface à venir. Réservé aux joueurs associés ; seule la personne qui a ouvert la liste peut la feuilleter.
