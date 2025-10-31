/* ---------------------
    Core data + config
--------------------- */
const NOTES = [["C"],["C#"],["D"],["Eb"],["E"],["F"],["F#"],["G"],["Ab"],["A"],["Bb"],["B"]];
const DEGREE_MAP = {"1":0,"♭2":1,"2":2,"♭3":3,"3":4,"4":5,"♯4/♭5":6,"5":7,"♭6":8,"6":9,"♭7":10,"7":11};
const DEGREES = Object.keys(DEGREE_MAP);
const FRETS_STRINGS = ["C","B","G","E","A","D"];
const FRET_MIN = 1, FRET_MAX = 24;

// defaults
let mode = "find";
let qNum = 0, score = 0, total = 0, questionStart = 0, answered = false;
let correctIndex = 0, intervalAuto = null, timeoutId = null;
let timeLimit = 10000; // ms - applies to all modes (including auto)
let rounds = 20; // number of questions before end; Infinity for unlimited
let correctTimes = [];

// Used to mark the current entry we just saved (for highlighting in leaderboard)
let lastSavedEntry = null;
let currentLeaderboardView = "overall";
/* ---------------------
    Tiny helpers
    --------------------- */
const $ = id => document.getElementById(id);
function randInt(n) { return Math.floor(Math.random() * n); }
function choose(arr) { return arr[randInt(arr.length)]; }
function noteLabelAt(i) { return NOTES[i].length>1 ? NOTES[i][0] + "/" + NOTES[i][1] : NOTES[i][0]; }
function degreeToOffset(d) { return DEGREE_MAP[d]; }
function findNoteIndexByName(name) { return NOTES.findIndex(n => n[0] === name); }

/* ---------------------
    Rounds & Time toggles
    --------------------- */
function setTimeLimit(sec) {
    timeLimit = sec * 1000;
    ["btn10","btn20","btn30"].forEach(id=>{
    $(id).classList.remove("active");
    $(id).classList.add("inactive");
    });
    $("btn"+sec).classList.add("active");
    $("btn"+sec).classList.remove("inactive");
}

function setRounds(r) {
    rounds = r;
    ["r10","r20","rInf"].forEach(id=>{
    $(id).classList.remove("active");
    $(id).classList.add("inactive");
    });
    if (r === Infinity) {
    $("rInf").classList.add("active");
    $("rInf").classList.remove("inactive");
    } else {
    $("r"+r).classList.add("active");
    $("r"+r).classList.remove("inactive");
    }
}

/* ---------------------
    Date formatting helpers
    - round to nearest 10 minutes
    - format DD/MM/YY HH:MM (nearest 10)
    --------------------- */
function roundToNearest10Min(date) {
    // returns a Date object rounded to nearest 10 minutes
    const ms = 1000 * 60 * 10;
    return new Date(Math.round(date.getTime() / ms) * ms);
}
function formatShort(dt) {
    // dt is Date
    const d = dt.getDate().toString().padStart(2,'0');
    const m = (dt.getMonth()+1).toString().padStart(2,'0');
    const yy = (dt.getFullYear() % 100).toString().padStart(2,'0');
    const hh = dt.getHours().toString().padStart(2,'0');
    const mins = dt.getMinutes().toString().padStart(2,'0');
    return `${d}/${m}/${yy} ${hh}:${mins}`;
}

/* ---------------------
    LocalStorage helpers for entries
    Entry object:
    {
        id: <timestamp or uuid>,
        dateISO: <ms>,
        dateRounded: <string formatted>,
        mode: "find"|"move"|"fret",
        weighted: <number> (0-100, two decimals)
    }
    --------------------- */
function keyForMode(m) { return `quizHistory_${m}`; }

function saveResultEntry(modeName, weighted) {
    const now = new Date();
    const rounded = roundToNearest10Min(now);
    const entry = {
    id: Date.now() + "-" + Math.floor(Math.random()*9999),
    dateISO: rounded.getTime(),
    dateRounded: formatShort(rounded),
    mode: modeName,
    weighted: parseFloat(weighted.toFixed(2))
    };
    const key = keyForMode(modeName);
    const arr = JSON.parse(localStorage.getItem(key) || "[]");
    arr.push(entry);
    localStorage.setItem(key, JSON.stringify(arr));
    lastSavedEntry = entry;
    return entry;
}

function getEntriesForMode(m) {
    return JSON.parse(localStorage.getItem(keyForMode(m)) || "[]");
}
function getAllEntries() {
    const all = [];
    ["find","move","fret"].forEach(m=>{
    const arr = getEntriesForMode(m);
    arr.forEach(e => all.push(e));
    });
    return all;
}

/* ---------------------
    Leaderboard UI logic
    - show top 10
    - show overall label for latest entry
    - highlight current run (green if top10, red if outside top10 with shown rank)
    --------------------- */
function openLeaderboard(viewMode = "overall", afterGame=false) {
    // viewMode = "overall" | "find" | "move" | "fret"
    // highlight top button
    ["btnOverall","btnFind","btnMove","btnFret"].forEach(b => {
    $(b).classList.remove("active");
    $(b).classList.add("inactive");
    });
    if (viewMode === "overall") $("btnOverall").classList.add("active");
    if (viewMode === "find") $("btnFind").classList.add("active");
    if (viewMode === "move") $("btnMove").classList.add("active");
    if (viewMode === "fret") $("btnFret").classList.add("active");

    // show ui
    $("menu").classList.add("hidden");
    $("quiz").classList.add("hidden");
    $("summary").classList.add("hidden");
    $("leaderboard").classList.remove("hidden");

    // prepare the table
    const tbody = $("leaderTable").querySelector("tbody");
    tbody.innerHTML = "";

    let rows = [];
    if (viewMode === "overall") {
    rows = getAllEntries();
    } else {
    rows = getEntriesForMode(viewMode);
    }

    // sort by weighted desc, then date desc
    rows.sort((a,b) => {
    if (b.weighted !== a.weighted) return b.weighted - a.weighted;
    return b.dateISO - a.dateISO;
    });

    // latest entry label (for overall)
    if (viewMode === "overall") {
    const all = getAllEntries();
    if (all.length > 0) {
        const latest = all.reduce((p,c) => c.dateISO > p.dateISO ? c : p, all[0]);
        $("leaderLatestLabel").textContent = `Latest: ${latest.dateRounded}`;
    } else {
        $("leaderLatestLabel").textContent = "";
    }
    } else {
    $("leaderLatestLabel").textContent = "";
    }

    // determine top10
    const top10 = rows.slice(0, 10);

    // fill top10 into table
    for (let i = 0; i < top10.length; i++) {
    const r = top10[i];
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${i+1}</td><td>${r.dateRounded}</td><td>${r.mode}</td><td>${r.weighted.toFixed(2)}</td>`;
    // highlight if this is the lastSavedEntry
    if (lastSavedEntry && r.id === lastSavedEntry.id) {
        tr.classList.add("rank-highlight");
    }
    tbody.appendChild(tr);
    } 

    // if after game and the saved entry isn't in top10, show its real rank at bottom (highlight red)
    if (afterGame && lastSavedEntry) {
    // compute rank among the same dataset (overall or mode)
    let allRows = rows;
    // find rank index
    const rankIndex = allRows.findIndex(e => e.id === lastSavedEntry.id);
    if (rankIndex === -1) {
        // shouldn't happen, but handle
    } else {
        if (rankIndex >= 10) {
        // show a highlighted row with the actual rank
        const r = allRows[rankIndex];
        const tr = document.createElement("tr");
        tr.classList.add("rank-out");
        tr.innerHTML = `<td>${rankIndex+1}</td><td>${r.dateRounded}</td><td>${r.mode}</td><td>${r.weighted.toFixed(2)}</td>`;
        tbody.appendChild(tr);
        } else {
        // already highlighted above as green
        }
    }
    }

    // show exit button available (already present)
}

$("exitLeaderboard").onclick = () => {
    $("leaderboard").classList.add("hidden");
    $("menu").classList.remove("hidden");
    // clear lastSavedEntry so it doesn't linger unexpectedly
    lastSavedEntry = null;
};
$("debugLeaderboard").onclick = () => {
    let rows = currentLeaderboardView === "overall"
    ? getAllEntries()
    : getEntriesForMode(currentLeaderboardView);
    alert(JSON.stringify(rows, null, 2));
};

$("clearLeaderboard").onclick = () => {
    if (currentLeaderboardView === "overall") {
    ["find","move","fret"].forEach(m => localStorage.removeItem(keyForMode(m)));
    } else {
    localStorage.removeItem(keyForMode(currentLeaderboardView));
    }
    openLeaderboard(currentLeaderboardView); // refresh table after clearing
};

/* ---------------------
    Game Flow
    - rounds variable controls number of rounds
    - timeLimit controls reveal time and also applies to auto
    - next question delay globally set to 2000ms
    --------------------- */
const NEXT_DELAY = 2000;

function startRound(selectedMode) {
    mode = selectedMode;
    qNum = 0;
    score = 0;
    total = 0;
    correctTimes = [];
    lastSavedEntry = null;

    $("menu").classList.add("hidden");
    $("summary").classList.add("hidden");
    $("leaderboard").classList.add("hidden");
    $("quiz").classList.remove("hidden");

    // show qTotal if rounds finite
    if (rounds === Infinity) {
    $("qTotal").textContent = "";
    } else {
    $("qTotal").textContent = "/" + rounds;
    }

    // if starting auto, ensure qNum blanking behavior still okay
    nextQuestion();
}

$("exitGame").onclick = () => {
    // if mid-run, treat as partial end: save stats and show leaderboard for that mode
    if (mode === "find" || mode === "move" || mode === "fret") {
    endRound(true);
    } else {
    // auto mode mid-exit: stop timers and return to menu and show overall leaderboard
    clearTimeout(intervalAuto);
    clearTimeout(timeoutId);
    $("quiz").classList.add("hidden");
    $("menu").classList.remove("hidden");
    openLeaderboard('overall', false);
    }
};

function nextQuestion() {
    // check rounds cap for finite rounds (applies to all modes)
    if (rounds !== Infinity && (mode === "find" || mode === "move" || mode === "fret" || mode === "auto") && qNum >= rounds) {
    // rounds exhausted, end. For auto special case below
    if (mode === "auto") {
        // end auto: go to main menu and auto-open overall leaderboard
        $("quiz").classList.add("hidden");
        $("menu").classList.remove("hidden");
        openLeaderboard('overall', false, currentLeaderboardView = viewMode);
        return;
    } else {
        endRound();
        return;
    }
    }

    // For 'find','move','fret' we keep a count; for auto show qNum blank
    qNum++;
    $("qNum").textContent = (mode !== "auto") ? qNum : "";
    $("answers").innerHTML = "";
    $("feedback").textContent = "";

    if (mode === "find") nextQuestionFind();
    else if (mode === "move") nextQuestionMove();
    else if (mode === "auto") nextQuestionAuto();
    else if (mode === "fret") nextQuestionFret();

    questionStart = performance.now();
    answered = false;

    if (mode !== "auto") {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
        if (!answered) {
        answered = true;
        total++;
        // reveal correct
        if ($("answers").children[correctIndex]) {
            $("answers").children[correctIndex].classList.add("correct");
        }
        $("feedback").textContent = "⏰ Time's up!";
        Array.from($("answers").children).forEach(b => b.disabled = true);
        setTimeout(nextQuestion, NEXT_DELAY);
        }
    }, timeLimit);
    }
}

/* --- question types (unchanged logic but adapted to new globals) --- */
function nextQuestionFind() {
    const noteIndex = randInt(12);
    const degree = choose(DEGREES);
    const offset = degreeToOffset(degree);
    correctIndex = (noteIndex - offset + 12) % 12;
    $("rootNote").textContent = NOTES[noteIndex][0];
    $("degree").textContent = degree;
    document.querySelectorAll('.big div')[0].textContent = "The note";
    document.querySelectorAll('.big div')[2].textContent = "is the";
    document.querySelectorAll('.big div')[4].textContent = "of what key?";

    for (let i = 0; i < 12; i++) {
    const b = document.createElement("button");
    b.textContent = noteLabelAt(i);
    b.onclick = () => checkAnswer(i, b);
    $("answers").appendChild(b);
    }
}

function nextQuestionAuto() {
    const noteIndex = randInt(12);
    const degree = choose(DEGREES);
    const offset = degreeToOffset(degree);
    const rootIndex = (noteIndex - offset + 12) % 12;
    $("rootNote").textContent = NOTES[noteIndex][0];
    $("degree").textContent = degree;

    for (let i = 0; i < 12; i++) {
    const b = document.createElement("button");
    b.textContent = noteLabelAt(i);
    b.disabled = true; // auto-mode not clickable
    $("answers").appendChild(b);
    }

    // reveal correct after timeLimit ms, then proceed to next after NEXT_DELAY
    intervalAuto = setTimeout(() => {
    if ($("answers").children[rootIndex]) {
        $("answers").children[rootIndex].classList.add("correct");
    }
    // in auto we don't save results per question; but we still count rounds for stopping
    intervalAuto = setTimeout(() => {
        // increment total? For auto we won't track score/accuracy, but we still progress rounds
        // Move to next question (or finish if rounds reached; nextQuestion will handle that)
        nextQuestion();
    }, NEXT_DELAY);
    }, timeLimit);
}

function nextQuestionMove() {
    const rootIndex = randInt(12);
    const degree = choose(DEGREES);
    const offset = degreeToOffset(degree);
    correctIndex = (rootIndex + offset) % 12;
    $("rootNote").textContent = NOTES[rootIndex][0];
    $("degree").textContent = degree;
    document.querySelectorAll('.big div')[0].textContent = "In the key of";
    document.querySelectorAll('.big div')[2].textContent = "what note is the";
    document.querySelectorAll('.big div')[4].textContent = "interval?";

    for (let i = 0; i < 12; i++) {
    const b = document.createElement("button");
    b.textContent = noteLabelAt(i);
    b.onclick = () => checkAnswer(i, b);
    $("answers").appendChild(b);
    }
}

function nextQuestionFret() {
    const stringIndex = randInt(FRETS_STRINGS.length);
    const fret = randInt(FRET_MAX - FRET_MIN + 1) + FRET_MIN;
    const stringNoteIndex = findNoteIndexByName(FRETS_STRINGS[stringIndex]);
    correctIndex = (stringNoteIndex + fret) % 12;
    $("rootNote").textContent = FRETS_STRINGS[stringIndex];
    $("degree").textContent = "fret " + fret;
    document.querySelectorAll('.big div')[0].textContent = "On the";
    document.querySelectorAll('.big div')[2].textContent = "string, what note is at";
    document.querySelectorAll('.big div')[4].textContent = "?";

    for (let i = 0; i < 12; i++) {
    const b = document.createElement("button");
    b.textContent = noteLabelAt(i);
    b.onclick = () => checkAnswer(i, b);
    $("answers").appendChild(b);
    }
}

function checkAnswer(i, btn) {
    if (answered) return;
    answered = true;
    clearTimeout(timeoutId);

    const elapsed = (performance.now() - questionStart) / 1000;
    total++;

    if (i === correctIndex) {
    score++;
    btn.classList.add("correct");
    $("feedback").textContent = "✓ Correct!";
    correctTimes.push(elapsed);
    } else {
    btn.classList.add("wrong");
    if ($("answers").children[correctIndex]) {
        $("answers").children[correctIndex].classList.add("correct");
    }
    $("feedback").textContent = "✗ Wrong!";
    }

    Array.from($("answers").children).forEach(b => b.disabled = true);

    // next after global NEXT_DELAY
    setTimeout(nextQuestion, NEXT_DELAY);
}

/* ---------------------
    End round: compute metrics, save entry, and auto-show leaderboard
    - Score weighting: keep previous weighted logic but output 2 decimals
    - After non-auto games, show respective game leaderboard automatically
    - If auto mode ends, go back to main menu and auto show overall leaderboard
    --------------------- */
function endRound(partial = false) {
    // compute accuracy and avg correct time
    const acc = total > 0 ? (score / total) * 100 : 0;
    const avg = correctTimes.length > 0 ? (correctTimes.reduce((a,b)=>a+b,0)/correctTimes.length) : 0;

    // compute weighted score: 60% accuracy, 40% speed
    // speed normalization: assume 10s map to 100 (as before); avoid divide by zero
    const speedScore = avg > 0 ? Math.max(0, Math.min(100, (10 / avg) * 100)) : 0;
    const weighted = (0.6 * acc) + (0.4 * speedScore);
    const weightedRounded = parseFloat(weighted.toFixed(2));

    // hide quiz and show summary briefly (summaryText) then show leaderboard for that mode
    $("quiz").classList.add("hidden");
    $("summary").classList.remove("hidden");
    $("summaryText").textContent = `Mode: ${mode} | Score: ${score}/${total} | Accuracy: ${acc.toFixed(2)}% | Avg: ${avg.toFixed(2)}s | Weighted: ${weightedRounded.toFixed(2)}`;

    // Save results (except for auto)
    if (mode !== "auto") {
    const entry = saveResultEntry(mode, weightedRounded);
    // After saving, automatically show the respective game leaderboard
    // Show mode-specific leaderboard and indicate it's afterGame to show rank if outside top10
    setTimeout(() => {
        $("summary").classList.add("hidden");
        openLeaderboard(mode, true);
    }, 700); // slight delay so user sees summary briefly
    } else {
    // For auto: go straight back to main menu and auto show overall leaderboard
    setTimeout(() => {
        $("summary").classList.add("hidden");
        $("menu").classList.remove("hidden");
        openLeaderboard('overall', false);
    }, 700);
    }
}

/* ---------------------
    Save / show history (legacy fallback)
    --------------------- */
function saveResult(modeName, weighted) {
    // kept for compatibility but prefer saveResultEntry
    saveResultEntry(modeName, weighted);
}

// Back buttons
$("backToMenuSummary").onclick = () => {
    $("summary").classList.add("hidden");
    $("menu").classList.remove("hidden");
};

/* ---------------------
    Play again + show leaderboard shortcuts
    --------------------- */
$("playAgain").onclick = () => startRound(mode);


// default UI state
setTimeLimit(10); // default 10s
setRounds(20);    // default 20 rounds

// Ensure that when opening the overall leaderboard from menu we show all entries top10
// (function attached above: openLeaderboard('overall'))

/* ---------------------
    NOTE:
    - All leaderboard scores are saved with two decimals (see saveResultEntry)
    - Dates are rounded to nearest 10 minutes and formatted as DD/MM/YY HH:MM (see formatShort)
    - Only top 10 are displayed; if the current game is outside top 10, the actual rank is appended and highlighted red
    - If current game is in top 10 it is highlighted green
    - Time before automatic reveal & rounds selection apply to auto as well
    - NEXT_DELAY is 3 seconds globally
--------------------- */