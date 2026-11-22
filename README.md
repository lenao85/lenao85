# Yupoo Finder

Appli iPhone (PWA) qui regroupe tes vendeurs Yupoo :

- **Vendeurs** : tous tes Yupoo au même endroit, parcours des albums et des photos dans l'appli, favoris ★.
- **Recherche** : un mot (ex. « jordan 4 ») est cherché chez **tous** les vendeurs en même temps.
- **Photo** : prends ou choisis une photo → l'appli la compare (directement dans l'iPhone, modèle DINOv2)
  aux couvertures de tous les albums de tes vendeurs et montre les plus ressemblants.
  Dans un album, « Le même article chez d'autres vendeurs » fait pareil avec la photo de l'album.
  Google Lens / Bing restent disponibles en secours.
- **Modifier** : ajouter / renommer / retirer un vendeur, tester quels vendeurs répondent.

## Mise en ligne (une seule fois, gratuit)

Le petit serveur tourne sur Cloudflare Workers (offre gratuite : 100 000 requêtes/jour).

1. Crée un compte sur <https://dash.cloudflare.com/sign-up>.
2. Menu **Compute (Workers)** → **Workers & Pages** → **Create** → **Import a repository**.
3. Connecte GitHub et choisis le dépôt **lenao85/lenao85**, branche `claude/youpo-aggregator-app-7s7dld`
   (ou `main` une fois fusionnée).
4. Laisse les réglages par défaut (commande de déploiement : `npx wrangler deploy`) → **Deploy**.
5. Cloudflare te donne une adresse du type `https://yupoo-finder.<ton-nom>.workers.dev`.

Chaque modification envoyée sur GitHub est ensuite mise en ligne automatiquement.

## Installer sur l'iPhone

1. Ouvre l'adresse `https://yupoo-finder.<ton-nom>.workers.dev` dans **Safari**.
2. Bouton **Partager** (carré avec flèche) → **Sur l'écran d'accueil** → **Ajouter**.
3. L'icône « Yupoo Finder » apparaît : l'appli s'ouvre en plein écran.

Ta liste de vendeurs et tes favoris sont gardés sur le téléphone.

## Index de la recherche par photo

Chaque nuit, GitHub Actions (`.github/workflows/index-photo.yml`) lance `indexer/build-index.mjs` :
il parcourt les 8 premières pages (≈ 960 albums les plus récents) de chaque vendeur, calcule
l'empreinte visuelle de chaque couverture et publie `meta.json` + `vecs.bin` dans la release `index`.
Seuls les nouveaux albums sont recalculés. Lancement manuel : onglet **Actions → Index photo → Run workflow**.

## Tester sur un ordinateur

```bash
node scripts/dev.mjs   # puis ouvrir http://localhost:8787
```

## Organisation du code

| Fichier | Rôle |
| --- | --- |
| `src/worker.js` | serveur : API de recherche, albums, proxy d'images |
| `src/yupoo.js` | lecture des pages Yupoo (titres, photos, liens taobao/weidian) |
| `public/` | l'appli affichée sur le téléphone |
| `public/stores.js` | liste de départ des vendeurs |
| `indexer/build-index.mjs` | construit l'index de la recherche par photo |
| `scripts/liens-bureau.ps1` | récupère les liens des raccourcis Yupoo du bureau Windows |
