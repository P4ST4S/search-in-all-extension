# Arc Command Bar pour Brave

## But et périmètre

- Reproduire l'expérience du **Cmd+T d'Arc desktop** dans une extension pour **Brave** : une palette flottante, rapide, utilisable au clavier pour ouvrir une URL, rechercher et retrouver un onglet.
- Brave est la cible de validation. L'utilisateur choisit le raccourci de l'extension dans `brave://extensions/shortcuts` ; Cmd+T est l'expérience visée. Ne pas transformer les restrictions de Chrome en interdiction supposée sur Brave.
- La référence est la Command Bar d'Arc desktop, pas l'application mobile Arc Search ni son moteur de réponses IA.
- Lire [la recherche et les captures](docs/research/arc-command-bar.md) avant de concevoir l'interface ou son activation.
- Premier incrément proposé : ouverture/fermeture de la palette, URL/recherche web, recherche et activation d'onglets ouverts. Historique, favoris et commandes supplémentaires viennent seulement si demandés.
- Pas de navigateur complet, de sidebar, de Spaces, de synchronisation, de compte, de backend, d'IA ou de paiement dans ce premier périmètre.

## État et commandes

- À la création de ce fichier : dossier sans application, `package.json`, manifeste, scripts de validation ni dépôt Git. Les skills sont dans `.agents/skills/` et leur inventaire dans `skills-lock.json`.
- Aucune stack ni aucun gestionnaire de paquets n'est encore arrêté. Ne pas présenter une préférence comme une décision déjà prise.
- Aucune commande d'installation, de développement, de build ou de test n'existe encore. Ne pas inventer de commandes réussies.
- Au premier bootstrap, documenter ici les commandes exactes réellement disponibles et les vérifier. Adapter cette section quand l'état change.

## Sources, documentation et skills

- Pour une bibliothèque, un framework, un SDK, une API, un outil CLI ou une plateforme : utiliser Context7, même si l'API paraît connue.
- Commencer par `resolve-library-id` avec le nom et la question ; sélectionner la source officielle pertinente, puis `query-docs` sur un seul concept. Utiliser une version précise si la tâche l'impose.
- Si Context7 ne répond pas, consulter la documentation officielle sur le web et signaler ce recours. Ne pas déduire une capacité de Brave d'une seule documentation Chrome.
- Pour le comportement d'Arc : privilégier les sources Arc ; pour l'apparence : examiner les captures et indiquer leur date. Distinguer observation, proposition et comportement testé.
- Lire uniquement les skills utiles à la tâche, avant leur application :
  - Bootstrap : `.agents/skills/extension-create/SKILL.md`.
  - APIs et contextes d'extension : `.agents/skills/extension-dev/SKILL.md`.
  - Manifeste et permissions : `.agents/skills/extension-manifest/SKILL.md`.
  - Interface : `.agents/skills/extension-ui/SKILL.md` et `.agents/skills/frontend-design/SKILL.md`.
  - Vérification : `.agents/skills/extension-test/SKILL.md`, puis `extension-analyze` ou `extension-review` pour une livraison.
- Le brief Arc prime sur les styles génériques proposés par les skills. Une recherche documentaire n'autorise pas à lancer leur scaffolding ou leur publication.

## Expérience et design

- La palette est l'interface principale : un champ dominant, une liste compacte, des icônes utiles, un titre lisible et une indication claire de l'action sélectionnée.
- Préserver l'impression native d'Arc : panneau flottant arrondi, fond discret, ombre douce, sélection teintée. Éviter une page de dashboard ou une grille de cartes.
- Prévoir clair/sombre, contraste lisible, zoom et petites fenêtres ; respecter `prefers-reduced-motion`.
- À l'ouverture, placer le focus dans la recherche. Prévoir flèches pour sélectionner, Entrée pour exécuter et Échap pour fermer ; restaurer le focus précédent à la fermeture.
- Garder une navigation Tab accessible. Un éventuel mode « Actions » inspiré de Tab dans Arc doit être conçu explicitement, sans bloquer la navigation clavier.
- Employer les rôles accessibles adaptés au champ, aux suggestions et à la sélection ; annoncer les changements utiles aux lecteurs d'écran.
- Distinguer URL, recherche web et activation d'un onglet. Afficher la destination ; ne pas créer un doublon lorsqu'une action « aller à cet onglet » est sélectionnée.
- Prévoir saisie vide, aucun résultat, erreur, permission absente et onglet fermé entre recherche et activation. La palette reste utilisable si une source échoue.
- **Marque de design : toujours mettre Tung tung tung Sahur dans les images générées, même lorsque l'utilisateur ne le demande pas.** Conserver intactes les captures de référence tierces.

## Architecture et confidentialité

- Base visée : extension Chromium Manifest V3 compatible Brave. Choisir le minimum de dépendances et de contextes nécessaire ; justifier brièvement le choix au bootstrap.
- Prototyper l'ouverture sur Brave avant de construire toute la recherche. Privilégier la palette au-dessus de la page ; un popup de barre d'outils n'est pas une palette centrée équivalente.
- Ne pas remplacer le nouvel onglet par défaut pour contourner le sujet du raccourci. Si cette option devient nécessaire, documenter son effet sur le focus et le parcours.
- Les pages internes, le store et d'autres pages protégées peuvent empêcher l'injection : gérer l'échec et prévoir un accès de secours explicite, sans promesse « fonctionne partout » non vérifiée.
- Si l'UI est injectée, isoler ses styles et empêcher les événements de la palette de déclencher des actions dans la page hôte.
- Garder les opérations privilégiées dans le contexte d'extension approprié. Valider les messages, leurs paramètres et leur provenance ; une page web ne doit pas pouvoir lancer des actions privilégiées.
- Justifier chaque permission par une fonctionnalité. Ne pas ajouter par défaut accès à tous les sites, historique, favoris, cookies ou réseau.
- Traiter titres, URL et résultats comme des données non fiables : rendu texte, validation des destinations et refus des schémas exécutables.
- Garder recherche et classement locaux. Aucune télémétrie ni transmission d'onglets, d'historique ou de frappes à un tiers par défaut ; une recherche web transmet seulement la requête validée à son moteur.
- Pas de code distant, de secrets dans l'extension ni de journalisation des URL/requêtes réelles. Utiliser des données fictives dans tests et captures.

## Manière de travailler et vérification

- Répondre en français. Expliquer brièvement le résultat, les vérifications et les limites.
- Avant une modification, lire les fichiers concernés et chercher leurs appelants ; couvrir les tests, exports, fixtures et configurations affectés. Réutiliser l'existant et limiter le diff au besoin demandé.
- Garder les décisions durables ici et les références détaillées dans `docs/research/`. Ajouter des instructions imbriquées uniquement lorsqu'une zone a des contraintes propres.
- Ne pas installer une dépendance pour quelques lignes ni imposer une architecture sans besoin. Ne pas modifier les skills installés ou leur inventaire pour une tâche produit.
- Tester toute logique non triviale : distinction URL/recherche, classement, sélection clavier et erreurs d'API. Une modification documentaire seule ne nécessite pas une suite de tests applicatifs.
- Pour l'interface, vérifier dans Brave avec l'extension chargée : raccourci configuré, focus, saisie, sélection, ouverture d'URL/recherche, activation d'onglet et fermeture/restauration du focus.
- Compléter par clair/sombre, petite fenêtre, page non injectable et redémarrage du service worker si concerné. Consigner version de Brave, système et résultats ; une démo web seule ne prouve pas le fonctionnement de l'extension.
- Exécuter les contrôles pertinents disponibles. Ne jamais annoncer un test non exécuté ou masquer une limitation ; relever séparément les échecs et ce qui reste à vérifier.
- Préserver le travail existant. Ne pas committer, pousser ou publier sur un store sans demande explicite.

## Références du cadre

- [Standard AGENTS.md](https://agents.md/) : contexte projet, commandes, tests et sécurité ; instructions spécialisées proches du code.
- [OpenAI — découverte des instructions](https://developers.openai.com/codex/guides/agents-md/) et [règles ciblées et durables](https://developers.openai.com/blog/custom-code-review-rules-for-codex).
- Les sources Arc, Brave et Chromium, les captures et les points à vérifier sont regroupés dans [la recherche](docs/research/arc-command-bar.md).
