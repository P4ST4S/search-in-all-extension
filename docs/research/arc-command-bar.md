# Recherche — Command Bar d'Arc pour Brave

Recherche effectuée le 24 octobre 2026. Ce document conserve les références ; les instructions de travail sont dans [AGENTS.md](../../AGENTS.md).

## Objectif confirmé et état

- Reproduire le Cmd+T d'Arc desktop sous forme d'extension installée dans **Brave**.
- Précision de l'utilisateur : le raccourci sera choisi dans les réglages des extensions de Brave. Cette configuration manuelle fait partie du parcours prévu.
- Aucune application ni stack n'existait lors de la recherche. Le fonctionnement dans Brave n'a pas encore été testé.

## Ce que fait Arc

La documentation officielle décrit une commande centrale pour ouvrir un onglet, retrouver un onglet existant et accéder à des actions. Elle s'ouvre avec Cmd+T. [Arc — Master your multitasking](https://start.arc.net/master-multitasking)

La liste officielle inclut notamment fenêtres, copie d'URL, navigation, organisation des onglets et réglages. Elle sert à comprendre le modèle d'interaction ; ce catalogue n'est pas le périmètre à implémenter intégralement. [Arc — Command Bar Actions](https://start.arc.net/command-bar-actions)

## Captures examinées

Ces trois captures ont été ouvertes et examinées visuellement. Elles documentent des versions de 2023, pas une vérification de l'Arc actuel. Les couleurs varient avec le thème ; ne pas en faire des constantes universelles. Les liens sont des références externes, sans incorporation d'assets tiers dans l'extension.

### Recherche et onglets — All Things How, novembre 2023

[Article source, sections 6 et 7](https://allthings.how/how-to-use-the-arc-browser/) · [Capture originale](https://static.allthings.how/content/images/2023/11/Screenshot-2023-11-09-at-3.40.02-PM-1.png)

![Arc : champ Search or Enter URL et liste d'onglets avec Switch to Tab](https://static.allthings.how/content/images/2023/11/Screenshot-2023-11-09-at-3.40.02-PM-1.png)

Observations : panneau flottant dans la partie haute de la page, coins arrondis, champ large en haut, séparation fine, lignes avec favicon et titre. Une ligne verte marque la sélection ; l'action « Switch to Tab » apparaît à droite. Le champ contient une indication « Search Actions Tab ».

### Mode Actions — All Things How, novembre 2023

[Article source](https://allthings.how/how-to-use-the-arc-browser/) · [Capture originale](https://static.allthings.how/content/images/2023/11/Screenshot-2023-11-09-at-3.41.44-PM-1.png)

![Arc : mode Actions avec badge dans le champ, liste de commandes et raccourcis](https://static.allthings.how/content/images/2023/11/Screenshot-2023-11-09-at-3.41.44-PM-1.png)

Observations : badge « Actions » dans le champ, même structure de liste, icônes à gauche et raccourcis à droite. La sélection reste visible sur toute la largeur utile. Le guide décrit Tab pour accéder aux actions ; cela devra être concilié avec l'accessibilité de notre palette.

### Requête et résultats mixtes — TidBITS, mai 2023

[Capture originale](https://tidbits.com/uploads/2023/05/Arc-Command-Bar-commands.jpg)

![Arc : requête archive avec commande sélectionnée, recherche, onglet et historique](https://tidbits.com/uploads/2023/05/Arc-Command-Bar-commands.jpg)

Observations : une seule saisie « archive » produit plusieurs types de résultats. La ligne active violette montre une commande et son raccourci ; les autres lignes distinguent recherche, onglet déjà ouvert et historique grâce aux icônes et aux indications d'action.

## Traduction proposée pour le premier incrément

Ce tableau est une proposition de cadrage du projet, pas une description exhaustive ni un algorithme de classement officiel d'Arc.

| Besoin | Comportement proposé | Preuve attendue |
| --- | --- | --- |
| Ouvrir la palette | Raccourci d'extension configuré dans Brave, champ prêt à saisir | Essai réel sur Brave et version relevée |
| Ouvrir une adresse | Une URL valide ouvre un nouvel onglet | Vérifier destination et onglet créé |
| Chercher sur le web | Un texte devient une requête encodée au moteur retenu | Accents et caractères spéciaux préservés |
| Retrouver un onglet | Recherche sur titre/URL, action de bascule explicite | Activer le bon onglet et sa fenêtre sans doublon |
| Tout faire au clavier | Flèches, Entrée, Échap ; focus visible et restauré | Parcours complet sans souris |
| Préserver la page | Fermeture sans saisie perdue ni événement parasite | Reprendre la page et son champ d'origine |

Historique, favoris et catalogue de commandes restent des extensions possibles. Ne pas demander leurs permissions avant d'en avoir besoin. Choisir le moteur de recherche et le classement lors de l'implémentation, en distinguant les choix projet des capacités des APIs.

## Brave : activation retenue

Brave annonce la compatibilité avec presque toutes les extensions Chromium. Cela justifie l'utilisation de la documentation Chromium pour les APIs communes, avec validation finale sur Brave. [Brave — installer des extensions](https://support.brave.com/hc/en-us/articles/360017909112-How-can-I-add-extensions-to-Brave)

La page des raccourcis d'extensions `brave://extensions/shortcuts` est référencée dans le dépôt officiel Brave. La documentation Brave décrit aussi la personnalisation des raccourcis du navigateur dans Réglages → Système → Raccourcis. [Dépôt Brave, issue 26872](https://github.com/brave/brave-browser/issues/26872), [Brave — raccourcis clavier](https://support.brave.com/hc/en-us/articles/360032272171-What-keyboard-shortcuts-can-I-use-in-Brave)

Décision issue du brief : utiliser une commande d'extension et laisser l'utilisateur choisir son raccourci. Ne pas écarter Cmd+T sur la seule base des restrictions de Chrome. Vérifier l'association et son effet dans la version de Brave utilisée au premier prototype, sans modifier les réglages du navigateur pendant ce travail documentaire.

Context7 a été consulté pour Chromium (`/websites/developer_chrome_extensions`) et Brave (`/brave/brave-core`). La requête Brave n'a retourné aucune documentation pertinente sur ce réglage ; les sources officielles Brave ci-dessus servent de recours.

## Contraintes Chromium à garder en tête

- **Commandes** : l'API fournit des commandes et des raccourcis configurables ; certains raccourcis système ou Chrome restent prioritaires. Cette règle documentée pour Chrome ne suffit pas à conclure au comportement exact de Brave. [Commands API](https://developer.chrome.com/docs/extensions/reference/api/commands)
- **Nouvel onglet** : remplacer cette page est possible, mais la documentation indique que le focus va d'abord à la barre d'adresse. Ce n'est donc pas un équivalent automatique de la palette superposée. Cette approche n'est pas retenue par défaut. [Override Chrome pages](https://developer.chrome.com/docs/extensions/develop/ui/override-chrome-pages)
- **Surface** : vérifier l'injection, les pages protégées, le secours en cas d'échec et le comportement après suspension du service worker dans le prototype. Aucun test d'extension n'a encore été exécuté.

## Pourquoi un AGENTS.md court et ciblé

Le standard recommande de fournir contexte, commandes, conventions, tests et considérations de sécurité. OpenAI décrit la portée des fichiers imbriqués et recommande des règles durables, ciblées et accompagnées d'une voie de résolution. Le fichier racine contient donc les contraintes utiles au travail ; cette recherche porte les captures et les explications. Aucun outil, chemin applicatif ou script inexistant n'est présenté comme opérationnel.

Sources : [AGENTS.md](https://agents.md/), [OpenAI — instructions projet](https://developers.openai.com/codex/guides/agents-md/), [OpenAI — règles de revue](https://developers.openai.com/blog/custom-code-review-rules-for-codex).

## Points à résoudre lors du premier prototype

- Stack minimale et commandes de développement/validation.
- Ouverture réelle de la palette, raccourci choisi et éventuels conflits dans Brave.
- Surface de secours sur les pages où l'injection échoue ; permissions nécessaires à cette approche.
- Moteur de recherche, règles de classement et rendu clair/sombre.
- Validation visuelle sur les références ci-dessus et tests de focus, d'accessibilité et d'activation d'onglets.
