# RugForge

Ein Windows-Desktop-Werkzeug für Tufting-Teppichmacher: Bild hochladen →
tufting-taugliche Farbflächen-Vorlage, plus (später) Garn-, Material-, Kosten-
und Preisrechner.

**Status:** Iteration 2 — Fotos: automatische Freistellung.

- Bild → Freistellen → Größe → Vorlage → Export
- Bildpipeline läuft komplett offline im Browser (Canvas): Downscale aufs
  Stichraster → LAB-k-Means-Farbreduktion (≤10) → Kleinflächen-Bereinigung →
  Kantenglättung → Vorlage + Legende
- Freistellen: automatische Hintergrund-Entfernung per u2netp (~4,6 MB ONNX)
  über `onnxruntime-web`, single-thread WASM+SIMD — Modell und Runtime werden
  lokal aus `public/models/` bzw. `public/` mitgeliefert, kein CDN. Danach
  Pinsel-Korrektur.
- Export: Vorlage-PNG, Übersichtsblatt (PNG/PDF), gekachelte 1:1-A4-PDF,
  `.rugforge.json`-Projektdatei
- Speicherung: IndexedDB, Autosave + manueller Speicherpunkt

## Entwicklung

```bash
npm install
npm run dev        # lokale Vorschau
npm test           # Vitest — nur die reinen Rechenfunktionen
npm run build      # Produktions-Build
```

## Web-Vorschau

Jeder Push auf `main` baut die App und veröffentlicht sie über GitHub Pages
(`.github/workflows/pages.yml`). Der `GITHUB_PAGES=true`-Build setzt den
Basis-Pfad auf `/rugforge/`.

## Roadmap

1. ~~Muster für grafische Motive~~ ✓
2. **Fotos — Offline-ONNX-Segmentierung, Auto-Maske + Pinsel** ← aktuell
3. Tufting-Pfad — Umrandung + Serpentinen-Füllung, Farbreihenfolge
4. Rechner — Material, Kosten, Preis, Szenarien; Kalibriertest
5. Politur — Electron-Packaging, Auto-Update, Fehlerbehandlung, README

Electron-Packaging (`.exe` via GitHub Releases + electron-updater) kommt in
Iteration 5; bis dahin ist die GitHub-Pages-Vorschau der Testweg.
