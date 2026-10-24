# Arc Command Bar pour Brave — v0.1.1

Une palette au clavier pour retrouver un onglet, ouvrir un favori ou rechercher avec le moteur par défaut de Brave. JavaScript et CSS natifs, aucune dépendance, aucun build.

## Charger l’extension

1. Ouvrir `brave://extensions` et activer le **Mode développeur**.
2. Choisir **Charger l’extension non empaquetée**, puis sélectionner le dossier **`extension/`** de ce projet.
3. Épingler **Arc Command Bar** pour pouvoir l’ouvrir aussi avec son bouton.
4. Dans `brave://extensions/shortcuts`, attribuer un raccourci à **Arc Command Bar**. Essayer **Cmd+T** pour l’expérience Arc ; si un conflit subsiste, consulter les raccourcis natifs dans **Réglages → Système → Raccourcis** ou choisir une autre combinaison.
5. Tester depuis une page web ordinaire. Après une modification, recharger l’extension dans `brave://extensions`, puis recharger la page de test.

L’association et la priorité de Cmd+T doivent être vérifiées dans la version de Brave utilisée. Aucun raccourci du navigateur n’est modifié automatiquement.

## Utilisation

- La palette apparaît dans la partie haute de la page, centrée horizontalement, et le champ prend le focus. Les résultats grandissent vers le bas sans déplacer le champ. À vide, la liste affiche jusqu’à cinq onglets récemment utilisés, hors onglet actuel.
- La saisie cherche dans les titres et adresses de tous les onglets des fenêtres normales du profil et dans tous les dossiers de favoris. Le classement ignore casse et accents, et demande la présence de tous les mots.
- Les onglets précèdent les favoris, puis vient l’action web. Chaque source affiche au maximum cinq résultats ; la liste défile si nécessaire.
- **↑ / ↓** : choisir un résultat. **Entrée** : exécuter. Un onglet existant est activé avec sa fenêtre ; un favori, une adresse ou une recherche ouvre un nouvel onglet.
- **Tab** : accepter le texte fantôme lorsqu’il existe et que le curseur est en fin de saisie, sans ouvrir la destination. Sinon, Tab et Maj+Tab naviguent entre le champ et le bouton de fermeture.
- **Échap**, clic extérieur, bouton de fermeture ou second déclenchement : fermer. La page et son champ d’origine retrouvent le focus.
- Changer d’onglet ferme la palette : elle ne reste pas affichée au retour. Cette fermeture ne demande pas de rendre le focus à la page quittée.
- Une adresse HTTP(S), un domaine ou `localhost:port` produit « Ouvrir l’adresse ». Un domaine sans protocole utilise HTTPS ; pour un serveur local HTTP, saisir `http://localhost:port`.

Les sources sont relues à chaque ouverture. Si un résultat disparaît avant son activation, la palette affiche une erreur et recharge les résultats. Aucun favori n’est modifié.

## Pages protégées et confidentialité

Sur une page interne comme `brave://settings`, une petite fenêtre séparée contient la même palette. Ce secours est réservé aux pages internes ; il conserve les bordures natives de Brave. Les nouvelles destinations s’ouvrent dans la fenêtre d’origine ; Échap ferme la fenêtre de secours. Le nouvel onglet de Brave n’est pas remplacé.

Sur une page web, le bouton et le raccourci utilisent la superposition. Si l’injection échoue (par exemple sur le store), aucune fenêtre supplémentaire n’est ouverte : un badge `!` et l’infobulle du bouton signalent l’échec. Réessayer sur une page web ordinaire.

Permissions : `activeTab` et `scripting` pour l’affichage à la demande, `tabs` pour les titres/adresses, `bookmarks` pour lire les favoris, `search` pour le moteur par défaut. Brave peut avertir que l’extension peut modifier les favoris : l’API accorde ce droit, mais cette version n’utilise que ses opérations de lecture.

Recherche et classement locaux, aucun stockage persistant, historique, télémétrie ou service distant. Seule une recherche web explicitement exécutée est transmise au moteur configuré. Les titres et adresses sont rendus en texte et les schémas exécutables sont refusés. La navigation privée n’est pas prise en charge.

## Développement et vérification

Node.js 22 ou supérieur suffit ; aucune installation de paquets n’est nécessaire.

```sh
npm test
npm run check
npm run preview
```

`npm test` exécute les tests de logique et du contrôleur avec des API simulées. `npm run check` vérifie la syntaxe, le manifeste et les ressources nécessaires.

`npm run preview` sert [un aperçu local](http://127.0.0.1:4173/preview.html) avec des données fictives et les vrais scripts de la palette. Il peut être ouvert dans le navigateur interne. **F8** simule l’ouverture/fermeture. Les actions affichent leur intention sans ouvrir de destination réelle.

Variantes de vérification :

- `?surface=fallback` : disposition de la fenêtre de secours, racine inspectable.
- `?surface=fallback&theme=light` : force les règles claires dans cette fixture, sans changer le thème système.
- `?failure=bookmarks` : source favoris indisponible.
- `?failure=execute` : résultat disparu lors de l’exécution.
- `?editor=chat&focus-race=1` : éditeur de chat fictif avec gestionnaires qui tentent de reprendre le focus et bloquent les touches de suppression. Vérifier la saisie dans la palette, Retour arrière, Suppr, Cmd+A puis suppression, Tab/Maj+Tab et la restitution du focus à l’éditeur après Échap. Ajouter `&surface=fallback` pour inspecter le champ dans une racine ouverte.

L’aperçu ne valide ni les API d’extension, ni Cmd+T, ni le moteur par défaut de Brave. Les essais réalisés et la checklist Brave sont dans [le compte rendu de validation](docs/validation/v0.1.0.md).

## Organisation

- `extension/` : dossier autonome à charger dans Brave ; service worker, contrôleur, logique commune et palette.
- `tests/` : tests Node, fixture d’aperçu et données fictives.
- `scripts/` : contrôles et serveur d’aperçu local, sans dépendance.

Les sources et références visuelles sont conservées dans [la recherche Arc](docs/research/arc-command-bar.md).
