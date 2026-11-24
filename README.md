# Sudoku Solver

> **EN** — Browser-based Sudoku solver for 9×9, 12×12 and 16×16 grids, using Knuth's Algorithm X with
> Dancing Links. Solves even the hardest known 9×9 puzzles in milliseconds, generates new puzzles with a
> unique solution, highlights conflicts and gives step-by-step hints. Vanilla JavaScript, works fully offline.

Risolutore di sudoku che gira interamente nel browser, senza connessione. Supporta griglie
**9×9** classiche, **12×12** (blocchi 3×4) e **16×16** (blocchi 4×4).

## Funzioni

- **Risoluzione** con l'Algorithm X di Knuth (Dancing Links): anche il sudoku "più difficile del mondo"
  di Arto Inkala viene risolto in pochi millisecondi.
- **Controllo dei conflitti**: numeri ripetuti in riga, colonna o blocco vengono segnalati.
- **Suggerimento**: rivela una sola cella alla volta, per farsi aiutare senza vedere tutta la soluzione.
- **Verifica dello schema** inserito e **generazione di nuovi schemi casuali** con soluzione unica.
- **Schemi di esempio** di difficoltà diverse per ogni dimensione.
- **Importazione ed esportazione come testo** (`.` o `0` per le celle vuote).
- Per le griglie 16×16 si può scegliere la notazione: lettere, numeri o esadecimale.
- Navigazione da tastiera (frecce, cifre, `Canc`) e tema chiaro/scuro.

## Avvio

Nessuna installazione: basta aprire `index.html` nel browser (funziona anche da file locale).

## Struttura

```
index.html    interfaccia
styles.css    stile e temi
solver.js     motore: conflitti, risoluzione (Algorithm X / Dancing Links), generazione degli schemi
app.js        griglia, tastiera, suggerimenti, importazione ed esportazione
```

---

Sviluppato da [Luca Sonno](https://lucasonno.com). Licenza [MIT](LICENSE).
