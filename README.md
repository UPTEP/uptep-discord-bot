# UPTEP — Bot Discord

Bot de suivi des demandes de ressources, convois et floods de l’alliance UPTEP. Il utilise l’API du site, sans connexion directe à PostgreSQL. Les demandes et convois partagent leurs données avec la page [Demandes et convois](https://uptep.top/convois.php).

## Commandes et droits

| Commande ou action | Accès | Résultat |
| --- | --- | --- |
| `/aide` | Membres du serveur | Guide privé des commandes et boutons. |
| `/livraisons vitesse:7` | Joueur UPTEP associé à Discord | Demandes à livrer, distances et durées aller estimées. |
| `/chaine` | Joueur UPTEP associé à Discord | Liste publique des membres, grades et liens Fourmizzz. |
| Créer une demande ou déclarer un convoi | Joueur UPTEP associé à Discord | Enregistrement après confirmation privée. |
| Modifier, ajuster, terminer ou annuler une demande | Demandeur ou responsable | Mise à jour avec contrôle des droits et des quantités. |
| Valider une demande | Droit chaîne sur un compte actif ou `ADMIN_DISCORD_IDS` | Validation et annonce dans le salon des convois. |
| Annuler un convoi déclaré | Expéditeur ou responsable | Annulation de la déclaration et recalcul du restant. |
| `/suspendre-demande demande:123` | `ADMIN_DISCORD_IDS` | Retour en attente sans supprimer les convois existants. |
| `/historique-demandes`, `/historique-convois`, `/stats-convois`, `/recap-demandes` | `ADMIN_DISCORD_IDS` | Rapports privés. |
| Boutons de suivi des floods | Joueur UPTEP associé à Discord | Déclarations et listes privées, avec notifications aux cibles identifiées. |
| `/connexion` | Tous les membres du serveur | Lien privé à usage unique vers le site. |
| `/solde-terrain` | NoobEnCDI, via le service protégé | Analyse incrémentale et publication du solde de terrain. |

L’association Discord doit être unique dans `chaine_members` et correspondre à un joueur actuellement présent dans UPTEP. La liste `ADMIN_DISCORD_IDS` ne contourne pas cette condition. Les droits sont revérifiés côté API ; la liste est relue sans redémarrage.

Sur le **site**, les chefs (`is_chef`) et administrateurs accèdent aux historiques, statistiques et récapitulatifs. Les commandes Discord conservent leur contrôle par `ADMIN_DISCORD_IDS`. Les statistiques et le récapitulatif du site affichent tous les résultats sans pagination ; les rapports Discord utilisent des pages de huit lignes.

Le bot enregistre des déclarations : il ne déclenche ni livraison ni attaque dans Fourmizzz. Une heure d’arrivée est une estimation, pas une confirmation de réception.

Voir le [guide des commandes](docs/commandes.md) pour les options, formats de rapports, calculs, filtres et règles de modification.

## Installation du bot principal

Prérequis : Node.js **24.17 ou supérieur**, une application Discord et un accès à l’API UPTEP. Installer le bot hors du dossier web.

```sh
npm ci --omit=dev --ignore-scripts
cp .env.example .env
chmod 600 .env
```

| Variable | Usage |
| --- | --- |
| `DISCORD_TOKEN` | Token de l’application Discord. |
| `DISCORD_CLIENT_ID` | ID de l’application, à renseigner en production. |
| `DISCORD_GUILD_ID` | Serveur Discord autorisé. |
| `CONVOY_CHANNEL_ID` | Salon du tableau des demandes et convois. |
| `FLOOD_CHANNEL_ID` | Salon des floods, facultatif. |
| `UPTEP_API_URL` | `https://uptep.top/api/bot/v1`. |
| `UPTEP_API_TOKEN` | Secret API avec les scopes des fonctions utilisées. |
| `ADMIN_DISCORD_IDS` | IDs autorisés pour les rapports Discord et la suspension. |
| `BOT_DATA_DIR` | Dossier d’état, `data` par défaut. |

L’API de production lit aussi la liste d’administrateurs dans `/home/uptep/discord-bot/.env`. Déplacer le bot nécessite d’adapter cette lecture côté API.

```sh
npm run check  # Configuration et lectures API ; aucun message Discord.
npm start      # Connexion et publication/reprise des tableaux.
```

Pour la production avec PM2 :

```sh
pm2 start ecosystem.config.cjs
pm2 save
```

Le fichier fourni utilise `/home/uptep/discord-bot` et `/usr/bin/node`. Configurer séparément le démarrage automatique de PM2. Les commandes principales sont enregistrées au démarrage ; `/solde-terrain` est enregistré par son service indépendant.

### Permissions Discord

Autoriser la lecture des salons et de l’historique, l’envoi de messages et les liens intégrés, y compris dans les fils utilisés. La mention `@everyone` nécessite sa permission spécifique pour les annonces de validation. **Message Content Intent** est nécessaire à `/solde-terrain`. Le bot n’a pas besoin du droit Administrateur Discord.

Un salon de test utilise la vraie base si l’API reste celle de production. Les tests locaux ci-dessous n’envoient pas de messages Discord et ne modifient pas l’API.

## Données, synchronisation et notifications

Conserver **`data/state.json`** lors d’un déploiement : il contient les tableaux, confirmations idempotentes et files de notifications. Ne jamais publier `.env`, `data/` ou les identifiants Codex.

Les tableaux sont actualisés environ chaque minute. Une validation effectuée dans Discord ou sur le site produit une annonce `@everyone`. Un convoi déclaré produit un MP au demandeur. Les opérations du site enregistrent un événement dans `convoy_web_events`, dans la même transaction que l’opération ; le bot sauvegarde cet événement dans sa file locale avant de l’acquitter via `/notifications-web`.

Les annonces sont retirées quand une demande est suspendue, terminée ou annulée. Les erreurs temporaires sont réessayées ; les MP bloqués sont abandonnés sans message public de secours. Les nonces limitent les doublons rapprochés, sans garantir une livraison exactement une fois après une longue coupure. Les anciennes opérations ne sont pas notifiées rétroactivement.

Les formulaires et erreurs restent privés. Les réponses ordinaires expirent après cinq minutes, les confirmations réussies après dix secondes ; les floods utilisent un nettoyage plus rapide après succès. Ces minuteries ne survivent pas à un redémarrage.

## Codex : service protégé

`/solde-terrain` est traité par **`uptep-terrain.service`**, sous `uptep-codex`, et non par le processus PM2 modifiable par `uptep`.

| Élément | Emplacement et protection |
| --- | --- |
| Code et dépendances du service | `/opt/uptep-terrain`, détenus par root. |
| Configuration du service | `/etc/uptep-terrain-service.env`, root, mode 600. |
| Authentification Codex | `/var/lib/uptep-codex/.codex`, privée au compte dédié. |
| Lanceur limité | `/usr/local/libexec/uptep-terrain-codex`, root:uptep-codex, mode 750. |
| Binaire et schéma Codex | `/opt/uptep-codex`, accès réservé à root et au groupe dédié. |
| Protection contre les rejeux | `/var/lib/uptep-codex/terrain-service/interactions.json`. |

Le service reçoit les interactions directement de Discord et contrôle l’auteur, l’application, le serveur et la fraîcheur de la commande. Il n’expose aucun port ni socket local de soumission. **`uptep` n’a aucune autorisation sudo pour appeler Codex** et peut continuer à modifier le site et le bot principal.

Le modèle reste `gpt-6-luna`, avec analyse structurée en lecture seule et outils shell/apps/navigation désactivés. Le sous-processus Codex ne reçoit pas les tokens Discord/API. Les messages analysés consomment les quotas du compte Codex configuré.

Actuellement, seul l’ID Discord de NoobEnCDI est autorisé. Une future liste multi-utilisateurs devra être gérée dans la configuration protégée par root et appliquée à tous les contrôles concernés ; elle n’est pas encore implémentée. Modifier `ADMIN_DISCORD_IDS` ne donne pas accès à Codex.

Les changements du service exigent un déploiement explicite par root : modifier les sources du bot ne met jamais à jour le service protégé. Le token Discord est partagé pour conserver l’application existante ; un développeur contrôlant le bot peut perturber ses commandes ou ses messages, sans obtenir le droit de lancer Codex.

Voir [l’exploitation du service protégé](protected-terrain/README.md) et [son unité systemd](protected-terrain/uptep-terrain.service).

## Exploitation et sauvegardes

```sh
# Sous uptep : bot principal
pm2 status
pm2 logs uptep-discord
pm2 restart uptep-discord

# Sous root : service protégé
systemctl status uptep-terrain
journalctl -u uptep-terrain
systemctl restart uptep-terrain
```

Sauvegarder les bases via le dispositif du site, `.env` et `data/` pour le bot, ainsi que le runtime protégé, sa configuration, son authentification et son état anti-rejeu. La sauvegarde serveur `/usr/local/sbin/uptep-db-backup` inclut ces derniers dans l’archive root `protected-terrain.tgz`.

## Vérifications

```sh
npm test
npm run check
```

Les tests locaux couvrent les confirmations et retries, les permissions, les rapports, les notifications, les floods, le calcul du terrain et la protection des interactions. `npm run check` vérifie l’accès réel en lecture à l’API. Ne pas utiliser `npm start` comme test hors ligne : il agit sur les tableaux Discord.

Une analyse réelle se vérifie en lançant `/solde-terrain` depuis le compte Discord autorisé. Les tests automatisés ne lancent pas de requête Codex facturable.

Licence MIT.


### Import de plusieurs convois

Le formulaire « Déclarer un convoi » accepte jusqu’à 20 lignes « Vous allez livrer … » (4 000 caractères), avec retours à la ligne ou collage compact. Tous les destinataires doivent correspondre à la demande sélectionnée. Chaque occurrence est conservée, même identique ; chaque durée produit son heure d’arrivée, figée lors de l’analyse. Le récapitulatif privé affiche les quantités et arrivées individuelles, ainsi que les totaux exacts. Le total est vérifié contre le restant connu avant confirmation ; l’API revérifie les droits et le restant réel à chaque écriture.

La confirmation groupée enregistre les convois successivement via l’API existante : ce n’est pas une transaction atomique du lot. Les corps et identifiants de commande par ligne sont persistés avant toute écriture. Après une erreur ou un redémarrage, le bouton de reprise conserve les succès et réutilise la même commande pour les réponses incertaines. Le compteur indique uniquement les enregistrements confirmés par l’API. Les notifications existantes restent dédupliquées par ID de convoi. Les entrées mixtes (rapports et champs manuels), les lignes invalides et les autres destinataires sont refusés avant confirmation. Test de reprise, réponse perdue, concurrence et limites Discord : `test/convoy-batch.test.js`.
