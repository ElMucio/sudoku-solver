/**
 * Sudoku Solver Engine — 100% Offline (Algorithm X / Dancing Links)
 * Supporta griglie 9x9 (3x3), 12x12 (3x4), 16x16 (4x4) e generiche N x N.
 */
(function (global) {
  'use strict';

  const GRID_CONFIGS = {
    9: { size: 9, boxRows: 3, boxCols: 3, label: '9×9 Classico' },
    12: { size: 12, boxRows: 3, boxCols: 4, label: '12×12 Intermedio' },
    16: { size: 16, boxRows: 4, boxCols: 4, label: '16×16 Maxi' }
  };

  /**
   * Restituisce l'indice del blocco (0 .. size-1) per la cella (r, c).
   */
  function getBoxIndex(r, c, size, boxRows, boxCols) {
    const boxesPerRow = size / boxCols;
    return Math.floor(r / boxRows) * boxesPerRow + Math.floor(c / boxCols);
  }

  /**
   * Individua tutte le celle con valori duplicati nella stessa riga, colonna o blocco.
   * Restituisce un Set di indici cella (r * size + c).
   */
  function findConflicts(board, size, boxRows, boxCols) {
    const conflicts = new Set();

    // Controllo righe
    for (let r = 0; r < size; r++) {
      const seen = new Map();
      for (let c = 0; c < size; c++) {
        const idx = r * size + c;
        const val = board[idx];
        if (val === 0) continue;
        if (seen.has(val)) {
          conflicts.add(idx);
          conflicts.add(seen.get(val));
        } else {
          seen.set(val, idx);
        }
      }
    }

    // Controllo colonne
    for (let c = 0; c < size; c++) {
      const seen = new Map();
      for (let r = 0; r < size; r++) {
        const idx = r * size + c;
        const val = board[idx];
        if (val === 0) continue;
        if (seen.has(val)) {
          conflicts.add(idx);
          conflicts.add(seen.get(val));
        } else {
          seen.set(val, idx);
        }
      }
    }

    // Controllo blocchi
    const numBoxes = size;
    const boxesPerRow = size / boxCols;
    for (let b = 0; b < numBoxes; b++) {
      const startR = Math.floor(b / boxesPerRow) * boxRows;
      const startC = (b % boxesPerRow) * boxCols;
      const seen = new Map();
      for (let dr = 0; dr < boxRows; dr++) {
        for (let dc = 0; dc < boxCols; dc++) {
          const r = startR + dr;
          const c = startC + dc;
          const idx = r * size + c;
          const val = board[idx];
          if (val === 0) continue;
          if (seen.has(val)) {
            conflicts.add(idx);
            conflicts.add(seen.get(val));
          } else {
            seen.set(val, idx);
          }
        }
      }
    }

    return conflicts;
  }

  /**
   * Risolve il Sudoku tramite Exact Cover con Dancing Links (DLX) su TypedArrays.
   * Opzioni:
   *  - maxSolutions: numero massimo di soluzioni da cercare (default 1, usa 2 per test unicità)
   *  - randomize: mescola l'ordine dei candidati (utile per generare nuovi schemi)
   *  - maxSteps: limite di sicurezza sui nodi esplorati
   */
  function solveSudoku(board, size, boxRows, boxCols, options) {
    const opts = options || {};
    const maxSolutions = opts.maxSolutions || 1;
    const randomize = Boolean(opts.randomize);
    const maxSteps = opts.maxSteps || 2500000;

    const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();

    const conflicts = findConflicts(board, size, boxRows, boxCols);
    if (conflicts.size > 0) {
      return {
        status: 'conflict',
        conflicts,
        solutions: [],
        elapsedMs: 0
      };
    }

    // Maschere dei valori già usati per filtrare subito i candidati impossibili
    const rowUsed = new Int32Array(size);
    const colUsed = new Int32Array(size);
    const boxUsed = new Int32Array(size);

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const val = board[r * size + c];
        if (val > 0) {
          const bit = 1 << (val - 1);
          const b = getBoxIndex(r, c, size, boxRows, boxCols);
          rowUsed[r] |= bit;
          colUsed[c] |= bit;
          boxUsed[b] |= bit;
        }
      }
    }

    // Costruzione candidati (r, c, v) con v in 0..size-1
    const candidates = [];
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const existing = board[r * size + c];
        if (existing > 0) {
          candidates.push((r << 10) | (c << 5) | (existing - 1));
        } else {
          const b = getBoxIndex(r, c, size, boxRows, boxCols);
          const usedMask = rowUsed[r] | colUsed[c] | boxUsed[b];
          for (let v = 0; v < size; v++) {
            if ((usedMask & (1 << v)) === 0) {
              candidates.push((r << 10) | (c << 5) | v);
            }
          }
        }
      }
    }

    if (randomize && candidates.length > 1) {
      for (let i = candidates.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = candidates[i];
        candidates[i] = candidates[j];
        candidates[j] = tmp;
      }
    }

    const n2 = size * size;
    const numCols = 4 * n2;
    const maxNodes = numCols + 1 + candidates.length * 4;

    const L = new Int32Array(maxNodes);
    const R = new Int32Array(maxNodes);
    const U = new Int32Array(maxNodes);
    const D = new Int32Array(maxNodes);
    const C = new Int32Array(maxNodes);
    const S = new Int32Array(numCols + 1);
    const rowPayload = new Int32Array(maxNodes);

    // Inizializzazione intestazioni colonne (1 .. numCols) e radice 0
    L[0] = numCols;
    R[0] = 1;
    for (let col = 1; col <= numCols; col++) {
      L[col] = col - 1;
      R[col] = col === numCols ? 0 : col + 1;
      U[col] = col;
      D[col] = col;
      C[col] = col;
      S[col] = 0;
    }

    let nodeCount = numCols + 1;

    for (let i = 0; i < candidates.length; i++) {
      const packed = candidates[i];
      const r = (packed >> 10) & 31;
      const c = (packed >> 5) & 31;
      const v = packed & 31;
      const b = getBoxIndex(r, c, size, boxRows, boxCols);

      const c1 = 1 + (r * size + c);
      const c2 = 1 + n2 + (r * size + v);
      const c3 = 1 + 2 * n2 + (c * size + v);
      const c4 = 1 + 3 * n2 + (b * size + v);

      const n0 = nodeCount;
      const n1 = nodeCount + 1;
      const nn2 = nodeCount + 2;
      const n3 = nodeCount + 3;
      nodeCount += 4;

      const cols = [c1, c2, c3, c4];
      const nodes = [n0, n1, nn2, n3];

      for (let k = 0; k < 4; k++) {
        const nd = nodes[k];
        const col = cols[k];
        rowPayload[nd] = packed;
        C[nd] = col;
        S[col]++;

        // Inserimento verticale in coda alla colonna
        const upNode = U[col];
        U[nd] = upNode;
        D[nd] = col;
        D[upNode] = nd;
        U[col] = nd;

        // Collegamento circolare orizzontale della riga
        L[nd] = nodes[(k + 3) & 3];
        R[nd] = nodes[(k + 1) & 3];
      }
    }

    function cover(col) {
      L[R[col]] = L[col];
      R[L[col]] = R[col];
      for (let i = D[col]; i !== col; i = D[i]) {
        for (let j = R[i]; j !== i; j = R[j]) {
          U[D[j]] = U[j];
          D[U[j]] = D[j];
          S[C[j]]--;
        }
      }
    }

    function uncover(col) {
      for (let i = U[col]; i !== col; i = U[i]) {
        for (let j = L[i]; j !== i; j = L[j]) {
          S[C[j]]++;
          D[U[j]] = j;
          U[D[j]] = j;
        }
      }
      L[R[col]] = col;
      R[L[col]] = col;
    }

    const picked = new Int32Array(n2);
    const solutions = [];
    let steps = 0;
    let aborted = false;

    function search(depth) {
      if (aborted || solutions.length >= maxSolutions) return;
      if (R[0] === 0) {
        const sol = new Int32Array(n2);
        for (let k = 0; k < depth; k++) {
          const packed = rowPayload[picked[k]];
          const r = (packed >> 10) & 31;
          const c = (packed >> 5) & 31;
          const v = packed & 31;
          sol[r * size + c] = v + 1;
        }
        solutions.push(Array.from(sol));
        return;
      }

      if (++steps > maxSteps) {
        aborted = true;
        return;
      }

      // Euristica MRV: scegli la colonna con il minor numero di candidati S[col]
      let bestCol = R[0];
      let minSize = S[bestCol];
      if (minSize > 1) {
        for (let col = R[bestCol]; col !== 0; col = R[col]) {
          if (S[col] < minSize) {
            minSize = S[col];
            bestCol = col;
            if (minSize <= 1) break;
          }
        }
      }

      if (minSize === 0) return;

      cover(bestCol);
      for (let rNode = D[bestCol]; rNode !== bestCol; rNode = D[rNode]) {
        picked[depth] = rNode;
        for (let j = R[rNode]; j !== rNode; j = R[j]) {
          cover(C[j]);
        }

        search(depth + 1);

        for (let j = L[rNode]; j !== rNode; j = L[j]) {
          uncover(C[j]);
        }

        if (aborted || solutions.length >= maxSolutions) break;
      }
      uncover(bestCol);
    }

    search(0);

    const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const elapsedMs = Math.max(0.05, t1 - t0);

    if (solutions.length > 0) {
      return {
        status: 'solved',
        solutions,
        unique: solutions.length === 1,
        elapsedMs
      };
    }

    return {
      status: aborted ? 'timeout' : 'unsolvable',
      solutions: [],
      elapsedMs
    };
  }

  /**
   * Genera un nuovo schema valido con soluzione unica completamente offline.
   */
  function generatePuzzle(size, boxRows, boxCols) {
    const total = size * size;
    const empty = new Array(total).fill(0);

    // Per 16x16 inseriamo prima la prima riga mescolata così il generatore è istantaneo
    const firstRow = [];
    for (let v = 1; v <= size; v++) firstRow.push(v);
    for (let i = size - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = firstRow[i];
      firstRow[i] = firstRow[j];
      firstRow[j] = tmp;
    }
    for (let c = 0; c < size; c++) {
      empty[c] = firstRow[c];
    }

    const fullRes = solveSudoku(empty, size, boxRows, boxCols, {
      maxSolutions: 1,
      randomize: true,
      maxSteps: 400000
    });

    if (fullRes.status !== 'solved') {
      return EXAMPLES[size][0].board.slice();
    }

    const puzzle = fullRes.solutions[0].slice();

    // Ordine casuale delle celle da provare a svuotare mantenendo unicità
    const indices = [];
    for (let i = 0; i < total; i++) indices.push(i);
    for (let i = total - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = indices[i];
      indices[i] = indices[j];
      indices[j] = tmp;
    }

    // Quante celle provare a rimuovere in base alla dimensione per restare rapidi (< 80 ms)
    const targetRemovals = size === 9 ? 50 : size === 12 ? 78 : 135;
    let removed = 0;

    for (let k = 0; k < total && removed < targetRemovals; k++) {
      const idx = indices[k];
      const backup = puzzle[idx];
      puzzle[idx] = 0;

      const check = solveSudoku(puzzle, size, boxRows, boxCols, {
        maxSolutions: 2,
        maxSteps: 15000
      });

      if (check.status === 'solved' && check.solutions.length === 1) {
        removed++;
      } else {
        puzzle[idx] = backup;
      }
    }

    return puzzle;
  }

  /**
   * Schemi di esempio integrati (nessuna connessione esterna necessaria).
   */
  const EXAMPLES = {
    9: [
      {
        name: 'Classico Equilibrato',
        board: [
          5,3,0, 0,7,0, 0,0,0,
          6,0,0, 1,9,5, 0,0,0,
          0,9,8, 0,0,0, 0,6,0,

          8,0,0, 0,6,0, 0,0,3,
          4,0,0, 8,0,3, 0,0,1,
          7,0,0, 0,2,0, 0,0,6,

          0,6,0, 0,0,0, 2,8,0,
          0,0,0, 4,1,9, 0,0,5,
          0,0,0, 0,8,0, 0,7,9
        ]
      },
      {
        name: 'Difficile (Logica Avanzata)',
        board: [
          0,0,5, 3,0,0, 0,0,0,
          8,0,0, 0,0,0, 0,2,0,
          0,7,0, 0,1,0, 5,0,0,

          4,0,0, 0,0,5, 3,0,0,
          0,1,0, 0,7,0, 0,0,6,
          0,0,3, 2,0,0, 0,8,0,

          0,6,0, 5,0,0, 0,0,9,
          0,0,4, 0,0,0, 0,3,0,
          0,0,0, 0,0,9, 7,0,0
        ]
      },
      {
        name: 'Estremo (Arto Inkala)',
        board: [
          8,0,0, 0,0,0, 0,0,0,
          0,0,3, 6,0,0, 0,0,0,
          0,7,0, 0,9,0, 2,0,0,

          0,5,0, 0,0,7, 0,0,0,
          0,0,0, 0,4,5, 7,0,0,
          0,0,0, 1,0,0, 0,3,0,

          0,0,1, 0,0,0, 0,6,8,
          0,0,8, 5,0,0, 0,1,0,
          0,9,0, 0,0,0, 4,0,0
        ]
      }
    ],
    12: [
      {
        name: '12×12 Classico (Blocchi 3×4)',
        board: [
           1, 0, 3, 0,  0, 6, 0, 8,  9, 0,11, 0,
           0, 6, 0, 8,  9, 0,11, 0,  1, 0, 3, 4,
           9, 0,11,12,  0, 2, 3, 0,  0, 6, 0, 8,

           2, 3, 0, 5,  6, 0, 8, 0, 10,11, 0, 1,
           6, 0, 8, 9,  0,11, 0, 1,  0, 3, 4, 0,
          10,11, 0, 1,  2, 0, 4, 5,  6, 0, 8, 0,

           3, 0, 5, 6,  0, 8, 9, 0, 11,12, 0, 2,
           0, 8, 0,10, 11, 0, 1, 2,  0, 4, 5, 0,
          11, 0, 1, 0,  3, 4, 0, 6,  7, 0, 9,10,

           0, 5, 6, 0,  8, 9, 0,11, 12, 0, 2, 3,
           8, 0,10,11,  0, 1, 2, 0,  4, 5, 0, 7,
           0, 1, 0, 3,  4, 0, 6, 7,  0, 9,10, 0
        ]
      },
      {
        name: '12×12 Sfida Intermedia',
        board: [
           8, 0, 0, 0, 5, 1, 0, 6, 0, 0,12,11,
          10,12, 2, 0,11, 8, 0, 4, 3, 6, 7, 0,
           6,11, 1, 0, 3, 0, 0, 7, 0, 0, 5, 2,
           4, 0, 0, 0, 0, 0, 7, 0, 8, 9, 0, 0,
           2, 0, 8, 0, 0, 0, 5, 0, 0, 0,10, 6,
           7, 0, 5,10, 0, 9, 8, 0,12, 3,11, 0,
           0, 0, 0, 0,12, 0,11, 0, 0, 0, 0, 0,
           0, 0,10, 0, 0, 2, 6, 0,11, 1, 0, 0,
           0, 5, 0,12, 0, 0, 1, 0, 0, 0, 0, 0,
           0, 4, 7, 8, 1, 6, 0,11, 2, 0, 9,10,
           5, 0, 0, 0, 0,12,10, 0, 4, 0, 0, 3,
           0, 0, 0, 9, 8, 0, 0, 0, 6, 0, 0, 0
        ]
      }
    ],
    16: [
      {
        name: '16×16 Hexadoku Classico',
        board: [
           0,11, 0, 0, 0, 5, 0, 0,16,13, 0, 1, 0, 0, 8, 0,
           0,12, 0, 0, 8, 4, 0, 0, 0, 0, 0, 0,10, 0,15, 0,
           0, 0, 5, 9,14, 3, 6, 0, 7, 0, 0, 0, 0, 4,16, 0,
          13, 8, 6, 3, 0, 0,12,11, 0,15, 0, 4, 0, 0,14, 5,
           0, 0, 0,13, 0, 0, 0,12, 0, 4, 6, 7, 5, 0,10, 0,
           0, 6, 4, 0, 0, 7, 0, 0,10, 0, 0,12, 0, 3, 1, 2,
           9, 0, 0, 0, 0, 8, 5, 0, 0, 3, 0, 2,14,12, 0,11,
          11, 2, 0, 0, 3, 1,10, 0, 0, 0, 5, 0, 0,13, 0, 0,
           6,13, 9, 0, 0,10,15, 3, 0, 0, 0, 0, 8,16,12,14,
           0, 0, 8,11, 4,13, 2, 0, 0, 0,16,14, 6, 0, 0, 0,
          14,16,12, 0, 0, 6, 8, 0, 3, 0, 0, 0,11,10, 4, 0,
           0, 0, 0, 0,12, 0,16, 0,11, 1, 0, 6, 0, 0, 0, 0,
          12, 0, 3, 8, 1, 2, 0, 0, 0, 6, 0, 0,16, 0, 0, 0,
           0, 0, 0, 0, 0,14,11, 6, 0, 0, 0,15, 0, 0, 0,10,
           0,14, 0, 0, 0,15, 0, 8, 0,12, 9, 0, 0, 6, 2, 1,
           5, 0, 0, 6, 0, 0,13,10, 0, 2, 7, 0, 4,14, 3, 8
        ]
      },
      {
        name: '16×16 Hexadoku Impegnativo',
        board: [
           0, 0, 0, 7, 12, 0, 4, 0,  0, 8, 0, 0,  0, 9, 1,10,
          11, 4, 2, 0,  0, 0,14, 0, 10, 0, 0, 9, 13, 0, 0, 0,
          10,14, 9, 0,  0,16, 1, 0,  2, 3, 0, 0,  8,15, 4,12,
          12,15, 0, 8,  9, 3, 0,10,  5, 0, 0, 0,  7, 0,11, 0,

           6, 0, 0, 3,  0, 0, 5, 0,  0, 4, 8, 0,  1,12, 0, 0,
           0,12, 0,16,  0,13, 0, 3,  0, 5,10, 1,  0, 0, 0, 0,
          13, 0, 0, 0,  0, 1, 0, 0,  0,12, 0, 0, 11, 4, 0, 0,
           0, 8, 0, 1,  0, 0, 7,12,  0,11, 0, 0,  3, 5, 0, 9,

           0, 0, 0, 0, 16, 0, 0,11, 12, 0, 6, 0,  5,13, 9, 0,
          15, 0, 0, 4, 13, 7, 0, 8,  0, 0, 3, 5,  0, 0, 2,14,
           0, 0, 0, 0,  0, 5, 0, 6,  0, 2, 0, 0,  0, 0,15, 0,
           0,16, 0, 5,  1, 0, 0, 4, 13, 0, 0,10,  0, 6, 8, 3,

           0, 0, 0, 0,  0, 4, 8, 1, 11,13, 0,16,  0,14, 0, 0,
           0, 0, 8, 0,  7, 0,16,13,  4,15, 9, 3,  2, 0,12, 0,
           1, 0, 0, 0,  2, 0, 3, 0, 14, 0, 0, 0,  0, 0, 7, 0,
           0, 9,16, 0,  5, 0,11, 0,  7,10, 0,12,  6, 0, 0, 4
        ]
      }
    ]
  };

  global.SudokuEngine = {
    GRID_CONFIGS,
    EXAMPLES,
    getBoxIndex,
    findConflicts,
    solveSudoku,
    generatePuzzle
  };
})(typeof window !== 'undefined' ? window : globalThis);
