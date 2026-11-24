/**
 * Sudoku Solver UI & Interazione — 100% Offline
 */
(function () {
  'use strict';

  const {
    GRID_CONFIGS,
    EXAMPLES,
    getBoxIndex,
    findConflicts,
    solveSudoku,
    generatePuzzle
  } = window.SudokuEngine;

  // Stato applicativo
  const state = {
    size: 9,
    boxRows: 3,
    boxCols: 3,
    notation: 'alphanum1', // 'alphanum1' (1-9,A-G) | 'numeric' (1-16) | 'hex0' (0-9,A-F)
    board: new Array(81).fill(0),       // Valori 0..size (0 = vuoto)
    cellOrigin: new Array(81).fill(0),  // 0 = vuoto, 1 = dato utente/esempio, 2 = risolto dal solver
    selectedIdx: 0,
    digitBuffer: '',
    digitTimer: null
  };

  // Riferimenti DOM
  const htmlEl = document.documentElement;
  const themeToggle = document.getElementById('themeToggle');
  const themeLabel = document.getElementById('themeLabel');
  const sizeButtons = document.querySelectorAll('.seg-btn[data-size]');
  const notationWrapper = document.getElementById('notationWrapper');
  const notationSelect = document.getElementById('notationSelect');
  const gridEl = document.getElementById('sudokuGrid');
  const keypadEl = document.getElementById('keypad');
  const statusBanner = document.getElementById('statusBanner');
  const statusText = document.getElementById('statusText');
  const statsReadout = document.getElementById('statsReadout');

  const solveBtn = document.getElementById('solveBtn');
  const hintBtn = document.getElementById('hintBtn');
  const verifyBtn = document.getElementById('verifyBtn');
  const clearSolvedBtn = document.getElementById('clearSolvedBtn');
  const clearAllBtn = document.getElementById('clearAllBtn');
  const eraseCellBtn = document.getElementById('eraseCellBtn');

  const exampleSelect = document.getElementById('exampleSelect');
  const loadExampleBtn = document.getElementById('loadExampleBtn');
  const generateBtn = document.getElementById('generateBtn');
  const toggleImportBtn = document.getElementById('toggleImportBtn');
  const importDrawer = document.getElementById('importDrawer');
  const importTextarea = document.getElementById('importTextarea');
  const applyImportBtn = document.getElementById('applyImportBtn');
  const copyExportBtn = document.getElementById('copyExportBtn');

  let cellElements = [];

  /* ========================================================================
     Gestione Tema (Bianco / Dark)
     ======================================================================== */
  function initTheme() {
    let saved = null;
    try {
      saved = localStorage.getItem('sudoku_theme');
    } catch (_) {
      // Ignora blocchi file:// su localStorage in browser restrittivi
    }
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const initial = saved === 'dark' || saved === 'light' ? saved : (prefersDark ? 'dark' : 'light');
    applyTheme(initial);
  }

  function applyTheme(theme) {
    htmlEl.setAttribute('data-theme', theme);
    themeLabel.textContent = theme === 'dark' ? 'Tema Bianco' : 'Tema Dark';
    try {
      localStorage.setItem('sudoku_theme', theme);
    } catch (_) {}
  }

  themeToggle.addEventListener('click', () => {
    const current = htmlEl.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    applyTheme(current === 'dark' ? 'light' : 'dark');
  });

  /* ========================================================================
     Formattazione e Parsing dei Simboli (9x9, 12x12, 16x16)
     ======================================================================== */
  function valueToSymbol(val) {
    if (!val || val < 1 || val > state.size) return '';
    if (state.size <= 9 || state.notation === 'numeric') {
      return String(val);
    }
    if (state.notation === 'hex0') {
      // 1..16 -> '0'..'9','A'..'F'
      const v0 = val - 1;
      return v0 < 10 ? String(v0) : String.fromCharCode(55 + v0);
    }
    // Default 'alphanum1': 1..9 -> '1'..'9', 10..16 -> 'A'..'G'
    return val <= 9 ? String(val) : String.fromCharCode(55 + val);
  }

  function updateNotationOptions() {
    if (state.size <= 9) {
      notationWrapper.hidden = true;
      return;
    }
    notationWrapper.hidden = false;
    const maxLetter = String.fromCharCode(55 + state.size); // 12 -> 'C', 16 -> 'G'
    const hexMaxLetter = String.fromCharCode(54 + state.size); // 12 -> 'B', 16 -> 'F'

    notationSelect.options[0].textContent = `1–9, A–${maxLetter} (Lettere)`;
    notationSelect.options[1].textContent = `1–${state.size} (Numeri)`;
    notationSelect.options[2].textContent = `0–9, A–${hexMaxLetter} (Base 0)`;
  }

  /* ========================================================================
     Stato Messaggi e Statistiche
     ======================================================================== */
  function setStatus(message, type) {
    statusBanner.classList.remove('status-success', 'status-error', 'status-warn');
    if (type === 'success') statusBanner.classList.add('status-success');
    else if (type === 'error') statusBanner.classList.add('status-error');
    else if (type === 'warn') statusBanner.classList.add('status-warn');
    statusText.textContent = message;
  }

  function updateStats() {
    const total = state.size * state.size;
    let filled = 0;
    for (let i = 0; i < total; i++) {
      if (state.board[i] > 0) filled++;
    }
    statsReadout.textContent = `Celle piene: ${filled} / ${total}`;
  }

  /* ========================================================================
     Costruzione Griglia, Tastierino ed Esempi
     ======================================================================== */
  function setGridSize(newSize) {
    const cfg = GRID_CONFIGS[newSize];
    if (!cfg) return;

    state.size = cfg.size;
    state.boxRows = cfg.boxRows;
    state.boxCols = cfg.boxCols;

    const total = state.size * state.size;
    state.board = new Array(total).fill(0);
    state.cellOrigin = new Array(total).fill(0);
    state.selectedIdx = 0;
    clearDigitBuffer();

    sizeButtons.forEach((btn) => {
      btn.classList.toggle('active', Number(btn.dataset.size) === newSize);
    });

    updateNotationOptions();
    populateExampleSelect();
    buildGridDOM();
    buildKeypadDOM();
    renderBoard();
    setStatus(`Griglia ${cfg.label} pronta. Inserisci i valori noti o carica un esempio.`, 'info');
  }

  function populateExampleSelect() {
    const list = EXAMPLES[state.size] || [];
    exampleSelect.innerHTML = '';
    list.forEach((ex, idx) => {
      const opt = document.createElement('option');
      opt.value = String(idx);
      opt.textContent = ex.name;
      exampleSelect.appendChild(opt);
    });
  }

  function buildGridDOM() {
    const { size, boxRows, boxCols } = state;
    gridEl.className = `sudoku-grid size-${size}`;
    gridEl.innerHTML = '';
    cellElements = [];

    const frag = document.createDocumentFragment();
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const idx = r * size + c;
        const cell = document.createElement('div');
        cell.className = 'sudoku-cell';
        cell.setAttribute('role', 'gridcell');
        cell.setAttribute('tabindex', idx === 0 ? '0' : '-1');
        cell.dataset.idx = String(idx);

        const band = Math.floor(r / boxRows);
        const stack = Math.floor(c / boxCols);
        if ((band + stack) % 2 === 1) {
          cell.classList.add('box-alt');
        }
        if ((c + 1) % boxCols === 0 && c < size - 1) {
          cell.classList.add('box-right');
        }
        if ((r + 1) % boxRows === 0 && r < size - 1) {
          cell.classList.add('box-bottom');
        }
        if (c === size - 1) cell.classList.add('last-col');
        if (r === size - 1) cell.classList.add('last-row');

        cell.addEventListener('click', () => {
          selectCell(idx, true);
        });

        frag.appendChild(cell);
        cellElements.push(cell);
      }
    }
    gridEl.appendChild(frag);
  }

  function buildKeypadDOM() {
    keypadEl.className = `keypad keypad-${state.size}`;
    keypadEl.innerHTML = '';
    const frag = document.createDocumentFragment();

    for (let val = 1; val <= state.size; val++) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'key-btn';
      btn.textContent = valueToSymbol(val);
      btn.addEventListener('click', () => {
        setCellValue(state.selectedIdx, val, 1);
      });
      frag.appendChild(btn);
    }
    keypadEl.appendChild(frag);
  }

  /* ========================================================================
     Rendering Stato Griglia ed Evidenziazioni
     ======================================================================== */
  function renderBoard() {
    const { size, boxRows, boxCols, board, cellOrigin, selectedIdx } = state;
    const conflicts = findConflicts(board, size, boxRows, boxCols);

    const selR = selectedIdx >= 0 ? Math.floor(selectedIdx / size) : -1;
    const selC = selectedIdx >= 0 ? selectedIdx % size : -1;
    const selBox = selectedIdx >= 0 ? getBoxIndex(selR, selC, size, boxRows, boxCols) : -1;
    const selVal = selectedIdx >= 0 ? board[selectedIdx] : 0;

    for (let idx = 0; idx < cellElements.length; idx++) {
      const el = cellElements[idx];
      const val = board[idx];
      const origin = cellOrigin[idx];
      const r = Math.floor(idx / size);
      const c = idx % size;
      const b = getBoxIndex(r, c, size, boxRows, boxCols);

      el.textContent = valueToSymbol(val);

      el.classList.toggle('is-selected', idx === selectedIdx);
      el.classList.toggle(
        'is-peer',
        idx !== selectedIdx && (r === selR || c === selC || b === selBox)
      );
      el.classList.toggle('is-same', idx !== selectedIdx && selVal > 0 && val === selVal);
      el.classList.toggle('is-clue', val > 0 && origin !== 2);
      el.classList.toggle('is-solved', val > 0 && origin === 2);
      el.classList.toggle('is-conflict', conflicts.has(idx));
    }

    updateStats();
    return conflicts;
  }

  function selectCell(idx, focusDOM) {
    const total = state.size * state.size;
    if (idx < 0 || idx >= total) return;
    clearDigitBuffer();

    if (cellElements[state.selectedIdx]) {
      cellElements[state.selectedIdx].setAttribute('tabindex', '-1');
    }
    state.selectedIdx = idx;
    if (cellElements[idx]) {
      cellElements[idx].setAttribute('tabindex', '0');
      if (focusDOM) cellElements[idx].focus({ preventScroll: true });
    }
    renderBoard();
  }

  function setCellValue(idx, val, originType) {
    if (idx < 0 || idx >= state.board.length) return;
    state.board[idx] = val;
    state.cellOrigin[idx] = val === 0 ? 0 : originType;

    const conflicts = renderBoard();
    if (conflicts.size > 0) {
      setStatus('Attenzione: valore duplicato nella stessa riga, colonna o blocco.', 'error');
    }
  }

  /* ========================================================================
     Gestione Input da Tastiera (inclusi numeri a 2 cifre in modalità 1-16)
     ======================================================================== */
  function clearDigitBuffer() {
    state.digitBuffer = '';
    if (state.digitTimer) {
      clearTimeout(state.digitTimer);
      state.digitTimer = null;
    }
  }

  document.addEventListener('keydown', (e) => {
    const active = document.activeElement;
    if (active && (active.tagName === 'TEXTAREA' || active.tagName === 'INPUT' || active.tagName === 'SELECT')) {
      return;
    }

    const { size, selectedIdx } = state;
    if (selectedIdx < 0) return;

    const r = Math.floor(selectedIdx / size);
    const c = selectedIdx % size;

    // Navigazione con frecce
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectCell(((r - 1 + size) % size) * size + c, true);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectCell(((r + 1) % size) * size + c, true);
      return;
    }
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      selectCell(r * size + ((c - 1 + size) % size), true);
      return;
    }
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      selectCell(r * size + ((c + 1) % size), true);
      return;
    }

    // Cancellazione cella
    if (e.key === 'Backspace' || e.key === 'Delete' || (e.key === '0' && state.notation !== 'hex0')) {
      e.preventDefault();
      clearDigitBuffer();
      setCellValue(selectedIdx, 0, 0);
      return;
    }

    if (e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1) return;

    const ch = e.key.toUpperCase();

    // Modalità esadecimale 0..9, A..F (per 12x12 o 16x16)
    if (size > 9 && state.notation === 'hex0') {
      let v0 = -1;
      if (ch >= '0' && ch <= '9') v0 = ch.charCodeAt(0) - 48;
      else if (ch >= 'A' && ch <= 'Z') v0 = ch.charCodeAt(0) - 55;
      if (v0 >= 0 && v0 < size) {
        e.preventDefault();
        setCellValue(selectedIdx, v0 + 1, 1);
      }
      return;
    }

    // Modalità numerica pura 1..12 / 1..16 (supporta digitazione rapida es. "1" poi "5" = 15)
    if (size > 9 && state.notation === 'numeric') {
      if (ch >= '0' && ch <= '9') {
        e.preventDefault();
        const combined = state.digitBuffer + ch;
        const combinedNum = Number(combined);
        if (state.digitBuffer === '1' && combinedNum >= 10 && combinedNum <= size) {
          clearDigitBuffer();
          setCellValue(selectedIdx, combinedNum, 1);
          return;
        }
        clearDigitBuffer();
        const single = Number(ch);
        if (single >= 1 && single <= size) {
          setCellValue(selectedIdx, single, 1);
          if (single === 1) {
            state.digitBuffer = '1';
            state.digitTimer = setTimeout(clearDigitBuffer, 650);
          }
        }
        return;
      }
    }

    // Modalità 9x9 oppure alfanumerica 1-9, A-G (accetta anche lettere dirette A-G in ogni caso)
    if (ch >= '1' && ch <= '9') {
      const val = ch.charCodeAt(0) - 48;
      if (val <= size) {
        e.preventDefault();
        setCellValue(selectedIdx, val, 1);
      }
    } else if (ch >= 'A' && ch <= 'Z') {
      const val = ch.charCodeAt(0) - 55; // 'A' -> 10
      if (val >= 10 && val <= size) {
        e.preventDefault();
        setCellValue(selectedIdx, val, 1);
      }
    }
  });

  /* ========================================================================
     Azioni Principali: Risolvi, Suggerisci, Verifica, Pulisci, Esempi
     ======================================================================== */
  solveBtn.addEventListener('click', () => {
    // Risolviamo a partire dai dati utente (o dall'intera griglia se non c'è conflitto)
    // Manteniamo intatti tutti gli indizi originari (cellOrigin === 1)
    const cluesOnly = state.board.map((v, idx) => (state.cellOrigin[idx] === 1 ? v : 0));

    const res = solveSudoku(cluesOnly, state.size, state.boxRows, state.boxCols, {
      maxSolutions: 2
    });

    if (res.status === 'conflict') {
      renderBoard();
      setStatus('Impossibile risolvere: ci sono numeri duplicati nei dati inseriti (evidenziati in rosso).', 'error');
      return;
    }

    if (res.status !== 'solved') {
      setStatus('Nessuna soluzione valida esiste per la configurazione inserita.', 'error');
      return;
    }

    const sol = res.solutions[0];
    for (let i = 0; i < sol.length; i++) {
      if (state.cellOrigin[i] !== 1) {
        state.board[i] = sol[i];
        state.cellOrigin[i] = 2;
      }
    }

    renderBoard();
    const timeStr = res.elapsedMs < 1 ? '< 1 ms' : `${res.elapsedMs.toFixed(1)} ms`;
    const uniqStr = res.unique ? 'Soluzione unica' : 'Più soluzioni possibili (mostrata una)';
    setStatus(`Sudoku risolto in ${timeStr} — ${uniqStr}.`, 'success');
  });

  hintBtn.addEventListener('click', () => {
    const cluesBoard = state.board.slice();
    const res = solveSudoku(cluesBoard, state.size, state.boxRows, state.boxCols, {
      maxSolutions: 1
    });

    if (res.status === 'conflict') {
      renderBoard();
      setStatus('Correggi prima le celle in conflitto (in rosso) per ricevere un suggerimento.', 'error');
      return;
    }

    if (res.status !== 'solved') {
      setStatus('Lo stato attuale non porta a nessuna soluzione valida.', 'error');
      return;
    }

    // Se la cella selezionata è vuota riempiamo quella, altrimenti la prima cella vuota
    let target = state.selectedIdx;
    if (target < 0 || state.board[target] !== 0) {
      target = state.board.findIndex((v) => v === 0);
    }

    if (target === -1) {
      setStatus('La griglia è già completamente compilata e valida!', 'success');
      return;
    }

    const solvedVal = res.solutions[0][target];
    state.board[target] = solvedVal;
    state.cellOrigin[target] = 2;
    selectCell(target, false);
    setStatus(
      `Suggerimento inserito alla riga ${Math.floor(target / state.size) + 1}, colonna ${(target % state.size) + 1}: ${valueToSymbol(solvedVal)}.`,
      'success'
    );
  });

  verifyBtn.addEventListener('click', () => {
    const conflicts = findConflicts(state.board, state.size, state.boxRows, state.boxCols);
    if (conflicts.size > 0) {
      renderBoard();
      setStatus(`Trovate ${conflicts.size} celle in conflitto diretto.`, 'error');
      return;
    }

    const emptyCount = state.board.filter((v) => v === 0).length;
    if (emptyCount === 0) {
      setStatus('Complimenti! La griglia è completa e rispetta tutte le regole del Sudoku.', 'success');
      return;
    }

    const res = solveSudoku(state.board, state.size, state.boxRows, state.boxCols, {
      maxSolutions: 2
    });

    if (res.status === 'solved') {
      if (res.unique) {
        setStatus('Schema valido: ammette esattamente una soluzione unica!', 'success');
      } else {
        setStatus('Schema valido e risolvibile (ammette più di una soluzione possibile).', 'warn');
      }
    } else {
      setStatus('Attenzione: nessun conflitto immediato, ma lo schema non ha soluzioni valide.', 'error');
    }
  });

  clearSolvedBtn.addEventListener('click', () => {
    let cleared = 0;
    for (let i = 0; i < state.board.length; i++) {
      if (state.cellOrigin[i] === 2) {
        state.board[i] = 0;
        state.cellOrigin[i] = 0;
        cleared++;
      }
    }
    renderBoard();
    if (cleared > 0) {
      setStatus('Soluzione rimossa: i dati iniziali sono stati mantenuti.', 'info');
    } else {
      setStatus('Nessuna cella calcolata da rimuovere.', 'info');
    }
  });

  clearAllBtn.addEventListener('click', () => {
    state.board.fill(0);
    state.cellOrigin.fill(0);
    renderBoard();
    setStatus('Griglia completamente svuotata.', 'info');
  });

  eraseCellBtn.addEventListener('click', () => {
    setCellValue(state.selectedIdx, 0, 0);
  });

  /* ========================================================================
     Selettori Dimensione, Simboli, Esempi e Import/Export
     ======================================================================== */
  sizeButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const sz = Number(btn.dataset.size);
      if (sz !== state.size) {
        setGridSize(sz);
      }
    });
  });

  notationSelect.addEventListener('change', () => {
    state.notation = notationSelect.value;
    buildKeypadDOM();
    renderBoard();
  });

  function loadBoardArray(arr, message) {
    const total = state.size * state.size;
    for (let i = 0; i < total; i++) {
      const v = arr[i] || 0;
      state.board[i] = v;
      state.cellOrigin[i] = v > 0 ? 1 : 0;
    }
    renderBoard();
    setStatus(message, 'info');
  }

  loadExampleBtn.addEventListener('click', () => {
    const idx = Number(exampleSelect.value) || 0;
    const list = EXAMPLES[state.size] || [];
    if (!list[idx]) return;
    loadBoardArray(list[idx].board, `Caricato schema: "${list[idx].name}". Premi Risolvi Sudoku!`);
  });

  generateBtn.addEventListener('click', () => {
    setStatus('Generazione nuovo schema in corso...', 'info');
    requestAnimationFrame(() => {
      const generated = generatePuzzle(state.size, state.boxRows, state.boxCols);
      loadBoardArray(generated, `Nuovo schema ${state.size}×${state.size} generato localmente!`);
    });
  });

  toggleImportBtn.addEventListener('click', () => {
    importDrawer.hidden = !importDrawer.hidden;
    if (!importDrawer.hidden) {
      importTextarea.value = exportBoardToString();
    }
  });

  function exportBoardToString() {
    const { size, board } = state;
    const useSpaces = size > 9 && state.notation === 'numeric';
    const lines = [];
    for (let r = 0; r < size; r++) {
      const rowTokens = [];
      for (let c = 0; c < size; c++) {
        const v = board[r * size + c];
        rowTokens.push(v === 0 ? '.' : valueToSymbol(v));
      }
      lines.push(rowTokens.join(useSpaces ? ' ' : ' '));
    }
    return lines.join('\n');
  }

  function parseImportedString(raw) {
    const trimmed = raw.trim();
    const total = state.size * state.size;
    if (!trimmed) return null;

    let tokens = [];
    if (/[\s,;|]/.test(trimmed)) {
      tokens = trimmed.split(/[\s,;|]+/).filter(Boolean);
    } else {
      tokens = trimmed.split('');
    }

    if (tokens.length !== total) {
      return { error: `Attesi ${total} valori per una griglia ${state.size}×${state.size}, trovati ${tokens.length}.` };
    }

    const parsed = new Array(total).fill(0);
    for (let i = 0; i < total; i++) {
      const tk = tokens[i].toUpperCase();
      if (tk === '.' || tk === '-' || tk === '_' || (tk === '0' && state.notation !== 'hex0')) {
        parsed[i] = 0;
        continue;
      }

      let val = -1;
      if (state.size > 9 && state.notation === 'hex0') {
        if (/^[0-9]$/.test(tk)) val = Number(tk) + 1;
        else if (/^[A-Z]$/.test(tk)) val = tk.charCodeAt(0) - 55 + 1;
      } else if (/^\d+$/.test(tk)) {
        val = Number(tk);
      } else if (/^[A-Z]$/.test(tk)) {
        val = tk.charCodeAt(0) - 55;
      }

      if (val < 1 || val > state.size) {
        return { error: `Simbolo non valido alla posizione ${i + 1}: "${tokens[i]}".` };
      }
      parsed[i] = val;
    }

    return { board: parsed };
  }

  applyImportBtn.addEventListener('click', () => {
    const res = parseImportedString(importTextarea.value);
    if (!res) {
      setStatus('Incolla prima uno schema nella casella di testo.', 'warn');
      return;
    }
    if (res.error) {
      setStatus(res.error, 'error');
      return;
    }
    loadBoardArray(res.board, 'Schema importato con successo nella griglia!');
  });

  copyExportBtn.addEventListener('click', () => {
    const text = exportBoardToString();
    importTextarea.value = text;
    importTextarea.select();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        () => setStatus('Schema copiato negli appunti!', 'success'),
        () => setStatus('Schema pronto nel riquadro di testo.', 'info')
      );
    } else {
      setStatus('Schema aggiornato e selezionato nel riquadro di testo.', 'info');
    }
  });

  /* ========================================================================
     Avvio Iniziale con Esempio Precaricato
     ======================================================================== */
  initTheme();
  setGridSize(9);
  loadBoardArray(
    EXAMPLES[9][0].board,
    'Benvenuto! È stato caricato uno schema di esempio: premi "Risolvi Sudoku" o inserisci il tuo.'
  );
})();
