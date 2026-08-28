# RugForge

Ein Windows-Desktop-Werkzeug für Tufting-Teppichmacher: Bild hochladen →
tufting-taugliche Farbflächen-Vorlage, plus (später) Garn-, Material-, Kosten-
und Preisrechner.

**Status:** Iteration 4 — Tufting-Pfad + Kalkulation.

- Bild → Freistellen → Größe → Vorlage → Export
- Bildpipeline läuft komplett offline im Browser (Canvas): Downscale aufs
  Stichraster → LAB-k-Means-Farbreduktion (≤10) → Kleinflächen-Bereinigung →
  Kantenglättung → Vorlage + Legende
- Freistellen: automatische Hintergrund-Entfernung per u2netp (~4,6 MB ONNX)
  über `onnxruntime-web`, single-thread WASM+SIMD — lokal mitgeliefert, kein CDN.
- Vorlage: Farben verschmelzen, Fläche umfärben, Farbe als Hintergrund (nicht
  tuften); „Pfad"-Ansicht mit Kontur (an die Bildkante gesnappt) + Serpentinen-
  Füllung + Reihenfolge, Weglänge → Garnschätzung
- Export: Vorlage-PNG (Raster oder Pfad), Übersichtsblatt (PNG/PDF) mit
  Farblegende + Tufting-Weg + Kalkulation, gekachelte 1:1-A4-PDF,
  `.rugforge.json`-Projektdatei
- Kalkulation (Export-Schritt): Material aus Fläche + Pfadlänge, Arbeitszeit,
  Strom → Herstellkosten; gebührenbewusster Preisvorschlag + Margen-Szenarien;
  Kalibriertest ersetzt die Garn-Schätzung durch einen gemessenen Faktor
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
2. ~~Fotos — Offline-ONNX-Segmentierung, Auto-Maske + Pinsel~~ ✓
3. ~~Tufting-Pfad — Umrandung + Serpentinen-Füllung, Farbreihenfolge~~ ✓
4. ~~Rechner — Material, Kosten, Preis, Szenarien; Kalibriertest~~ ✓
5. **Politur — Electron-Packaging, Auto-Update, Fehlerbehandlung, README** ← aktuell

Electron-Packaging (`.exe` via GitHub Releases + electron-updater) kommt in
Iteration 5; bis dahin ist die GitHub-Pages-Vorschau der Testweg.
