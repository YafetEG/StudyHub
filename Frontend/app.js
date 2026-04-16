// =========================================================
// PAGE NAVIGATION
// =========================================================
function switchPage(pageId, navEl) {
  document.querySelectorAll('.page').forEach(function(p) {
    p.classList.remove('active');
  });
  document.querySelectorAll('.nav-item').forEach(function(n) {
    n.classList.remove('active');
  });
  document.getElementById('page-' + pageId).classList.add('active');
  navEl.classList.add('active');
}

// =========================================================
// LOCAL STORAGE HELPERS
// =========================================================

// Returns today's date as a "YYYY-MM-DD" string, used as a key
// so we can compare days without worrying about times.
function todayKey() {
  var d = new Date();
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

// Loads a JSON value from localStorage by key.
// If the key doesn't exist or the value is corrupted, returns the fallback.
function lsGet(key, fallback) {
  try {
    var raw = localStorage.getItem(key);
    return raw !== null ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}

// Saves any value to localStorage as JSON.
function lsSet(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

// =========================================================
// STATS STATE (loaded from localStorage on startup)
// =========================================================
var stats = {
  totalDone:     lsGet('sh_totalDone', 0),
  todayDone:     0,
  streak:        lsGet('sh_streak', 0),
  bestStreak:    lsGet('sh_bestStreak', 0),
  lastActiveDay: lsGet('sh_lastActiveDay', '')
};

// Load today's count from its own dated key
stats.todayDone = lsGet('sh_today_' + todayKey(), 0);

// =========================================================
// STREAK LOGIC
// =========================================================

function recordCompletion() {
  var today = todayKey();

  var yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  var yKey = yesterday.getFullYear() + '-' +
    String(yesterday.getMonth() + 1).padStart(2, '0') + '-' +
    String(yesterday.getDate()).padStart(2, '0');

  stats.totalDone++;
  lsSet('sh_totalDone', stats.totalDone);

  stats.todayDone++;
  lsSet('sh_today_' + today, stats.todayDone);

  if (stats.lastActiveDay !== today) {
    if (stats.lastActiveDay === yKey) {
      stats.streak++;
    } else {
      stats.streak = 1;
    }
    stats.lastActiveDay = today;
    lsSet('sh_lastActiveDay', today);
    lsSet('sh_streak', stats.streak);

    if (stats.streak > stats.bestStreak) {
      stats.bestStreak = stats.streak;
      lsSet('sh_bestStreak', stats.bestStreak);
    }
  }

  renderStats();
}

function recordUncompletion() {
  if (stats.totalDone > 0) {
    stats.totalDone--;
    lsSet('sh_totalDone', stats.totalDone);
  }
  if (stats.todayDone > 0) {
    stats.todayDone--;
    lsSet('sh_today_' + todayKey(), stats.todayDone);
  }
  renderStats();
}

function renderStats() {
  document.getElementById('stat-streak').textContent = stats.streak;
  document.getElementById('stat-total').textContent  = stats.totalDone;
  document.getElementById('stat-today').textContent  = stats.todayDone;
  document.getElementById('stat-best').textContent   = stats.bestStreak;
}

// =========================================================
// TO-DO LIST
// =========================================================
var todos = [];
var todoIdCounter = 0;

document.getElementById('todo-input').addEventListener('keydown', function(e) {
  if (e.key === 'Enter') addTodo();
});

function addTodo() {
  var input = document.getElementById('todo-input');
  var text = input.value.trim();
  if (!text) return;
  todos.push({ id: ++todoIdCounter, text: text, done: false });
  input.value = '';
  renderTodos();
}

function toggleTodo(id) {
  var item = todos.find(function(t) { return t.id === id; });
  if (!item) return;
  item.done = !item.done;
  if (item.done) {
    recordCompletion();
  } else {
    recordUncompletion();
  }
  renderTodos();
}

function deleteTodo(id) {
  var item = todos.find(function(t) { return t.id === id; });
  if (item && item.done) {
    recordUncompletion();
  }
  todos = todos.filter(function(t) { return t.id !== id; });
  renderTodos();
}

function renderTodos() {
  var list = document.getElementById('todo-list');

  if (todos.length === 0) {
    list.innerHTML = '<li class="empty-state">No assignments yet</li>';
    updateProgress();
    return;
  }

  list.innerHTML = todos.map(function(t) {
    return (
      '<li class="todo-item' + (t.done ? ' done' : '') + '" onclick="toggleTodo(' + t.id + ')">' +
        '<div class="todo-checkbox"><span class="checkmark">&#10003;</span></div>' +
        '<span class="todo-text">' + escapeHtml(t.text) + '</span>' +
        '<span class="todo-delete" onclick="event.stopPropagation(); deleteTodo(' + t.id + ')">&#215;</span>' +
      '</li>'
    );
  }).join('');

  updateProgress();
}

function updateProgress() {
  var total = todos.length;
  var done  = todos.filter(function(t) { return t.done; }).length;
  drawPieChart(done, total - done);
}

// =========================================================
// PIE CHART
// =========================================================
function drawPieChart(done, remaining) {
  var canvas = document.getElementById('pie-chart');
  var ctx    = canvas.getContext('2d');
  var w  = canvas.width;
  var h  = canvas.height;
  var cx = w / 2;
  var cy = h / 2;
  var r  = 60;

  ctx.clearRect(0, 0, w, h);

  var total = done + remaining;

  if (total === 0) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = '#e0e0da';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.55, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.fillStyle = '#aaa';
    ctx.font = '12px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('No data', cx, cy);
    return;
  }

  if (done === total) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = '#1a9e75';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.55, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.fillStyle = '#1a9e75';
    ctx.font = 'bold 18px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('100%', cx, cy - 8);
    ctx.fillStyle = '#888';
    ctx.font = '11px "Segoe UI", system-ui, sans-serif';
    ctx.fillText('All done!', cx, cy + 10);
    return;
  }

  var startAngle = -Math.PI / 2;
  var doneAngle  = (done / total) * Math.PI * 2;
  var remAngle   = (remaining / total) * Math.PI * 2;

  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.arc(cx, cy, r, startAngle + doneAngle, startAngle + doneAngle + remAngle);
  ctx.closePath();
  ctx.fillStyle = '#e0e0da';
  ctx.fill();

  if (done > 0) {
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, startAngle, startAngle + doneAngle);
    ctx.closePath();
    ctx.fillStyle = '#1a9e75';
    ctx.fill();
  }

  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.55, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();

  ctx.fillStyle = '#1a1a1a';
  ctx.font = 'bold 17px "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(Math.round((done / total) * 100) + '%', cx, cy - 8);
  ctx.fillStyle = '#888';
  ctx.font = '11px "Segoe UI", system-ui, sans-serif';
  ctx.fillText(done + ' / ' + total, cx, cy + 10);
}

// =========================================================
// POMODORO
// =========================================================
var POMO_DURATIONS = {
  work:      25 * 60,
  break:      5 * 60,
  longbreak: 15 * 60
};

var pomoState = {
  running:            false,
  stage:              'work',
  secondsLeft:        POMO_DURATIONS.work,
  round:              1,
  completedPomodoros: 0,
  goal:               4,
  timer:              null
};

function updatePomoGoal() {
  var val = parseInt(document.getElementById('pomo-goal').value, 10);
  if (val >= 1 && val <= 20) {
    pomoState.goal = val;
    renderPomo();
  }
}

function pomodoroToggle() {
  if (pomoState.running) {
    clearInterval(pomoState.timer);
    pomoState.running = false;
    document.getElementById('pomo-start-btn').textContent = 'Start';
  } else {
    pomoState.running = true;
    document.getElementById('pomo-start-btn').textContent = 'Pause';
    pomoState.timer = setInterval(function() {
      pomoState.secondsLeft--;
      if (pomoState.secondsLeft <= 0) {
        pomoAdvance();
      }
      renderPomo();
    }, 1000);
  }
}

function pomodoroReset() {
  clearInterval(pomoState.timer);
  pomoState.running            = false;
  pomoState.stage              = 'work';
  pomoState.round              = 1;
  pomoState.completedPomodoros = 0;
  pomoState.secondsLeft        = POMO_DURATIONS.work;
  document.getElementById('pomo-start-btn').textContent = 'Start';
  renderPomo();
}

function pomodoroSkip() {
  clearInterval(pomoState.timer);
  pomoState.running = false;
  document.getElementById('pomo-start-btn').textContent = 'Start';
  pomoAdvance();
}

function pomoAdvance() {
  clearInterval(pomoState.timer);
  pomoState.running = false;
  document.getElementById('pomo-start-btn').textContent = 'Start';

  if (pomoState.stage === 'work') {
    pomoState.completedPomodoros++;
    if (pomoState.completedPomodoros >= pomoState.goal) {
      pomoState.completedPomodoros = pomoState.goal;
      pomoState.secondsLeft        = 0;
      renderPomo();
      return;
    }
    if (pomoState.completedPomodoros % 4 === 0) {
      pomoState.stage       = 'longbreak';
      pomoState.secondsLeft = POMO_DURATIONS.longbreak;
    } else {
      pomoState.stage       = 'break';
      pomoState.secondsLeft = POMO_DURATIONS.break;
    }
  } else {
    pomoState.round++;
    pomoState.stage       = 'work';
    pomoState.secondsLeft = POMO_DURATIONS.work;
  }

  renderPomo();
}

function renderPomo() {
  var s   = pomoState;
  var m   = Math.floor(s.secondsLeft / 60);
  var sec = s.secondsLeft % 60;
  document.getElementById('pomo-time').textContent =
    String(m).padStart(2, '0') + ':' + String(sec).padStart(2, '0');

  var badge  = document.getElementById('pomo-badge');
  var labels = { work: 'Work', break: 'Short break', longbreak: 'Long break' };
  badge.textContent = labels[s.stage];
  badge.className   = 'pomo-badge ' + s.stage;

  document.getElementById('pomo-round').textContent = 'Round ' + s.round;

  var totalSec      = POMO_DURATIONS[s.stage];
  var frac          = totalSec > 0 ? s.secondsLeft / totalSec : 0;
  var circumference = 326.7;
  document.getElementById('pomo-ring').setAttribute(
    'stroke-dashoffset',
    String(circumference * frac)
  );

  var ringColors = { work: '#1a9e75', break: '#ef9f27', longbreak: '#7f77dd' };
  document.getElementById('pomo-ring').style.stroke = ringColors[s.stage];

  var dots = document.getElementById('pomo-dots');
  dots.innerHTML = Array.from({ length: s.goal }, function(_, i) {
    return '<div class="pomo-dot' + (i < s.completedPomodoros ? ' filled' : '') + '"></div>';
  }).join('');
}

// =========================================================
// FLASHCARDS
// =========================================================
var cards         = [];
var cardIdCounter = 0;
var fcIndex       = 0;
var fcFlipped     = false;

document.getElementById('fc-q').addEventListener('keydown', function(e) {
  if (e.key === 'Enter') document.getElementById('fc-a').focus();
});
document.getElementById('fc-a').addEventListener('keydown', function(e) {
  if (e.key === 'Enter') addCard();
});

function addCard() {
  var q = document.getElementById('fc-q').value.trim();
  var a = document.getElementById('fc-a').value.trim();
  if (!q || !a) return;
  cards.push({ id: ++cardIdCounter, q: q, a: a });
  document.getElementById('fc-q').value = '';
  document.getElementById('fc-a').value = '';
  document.getElementById('fc-q').focus();
  renderCards();
}

function deleteCard(id) {
  cards = cards.filter(function(c) { return c.id !== id; });
  if (fcIndex >= cards.length) {
    fcIndex = Math.max(0, cards.length - 1);
  }
  renderCards();
}

function renderCards() {
  var list      = document.getElementById('fc-card-list');
  var studyArea = document.getElementById('fc-study-area');
  var emptyMsg  = document.getElementById('fc-empty');

  list.innerHTML = cards.map(function(c) {
    return (
      '<div class="fc-card-row">' +
        '<span class="fc-q">' + escapeHtml(c.q) + '</span>' +
        '<span class="fc-a">' + escapeHtml(c.a) + '</span>' +
        '<span class="fc-del" onclick="deleteCard(' + c.id + ')">&#215;</span>' +
      '</div>'
    );
  }).join('');

  if (cards.length > 0) {
    studyArea.style.display = 'block';
    emptyMsg.style.display  = 'none';
    fcFlipped = false;
    renderFlashcard();
  } else {
    studyArea.style.display = 'none';
    emptyMsg.style.display  = 'block';
  }
}

function renderFlashcard() {
  if (!cards.length) return;
  var c    = cards[fcIndex];
  var card = document.getElementById('flashcard');
  document.getElementById('fc-text').textContent    = fcFlipped ? c.a : c.q;
  document.getElementById('fc-side').textContent    = fcFlipped ? 'Answer' : 'Question';
  document.getElementById('fc-counter').textContent = (fcIndex + 1) + ' / ' + cards.length;
  if (fcFlipped) {
    card.classList.add('flipped');
  } else {
    card.classList.remove('flipped');
  }
}

function flipCard() {
  fcFlipped = !fcFlipped;
  renderFlashcard();
}

function nextCard() {
  fcIndex = (fcIndex + 1) % cards.length;
  fcFlipped = false;
  renderFlashcard();
}

function prevCard() {
  fcIndex = (fcIndex - 1 + cards.length) % cards.length;
  fcFlipped = false;
  renderFlashcard();
}

// =========================================================
// UTILITY
// =========================================================
function escapeHtml(str) {
  return str
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;');
}

// =========================================================
// INIT
// =========================================================
renderPomo();
drawPieChart(0, 0);
renderCards();
renderStats();

// =========================================================
// GRADES — configuration
// =========================================================

// When running locally: 'http://localhost:3000'
// When hosted on Railway: replace with your Railway URL e.g. 'https://studyhub-server.up.railway.app'
// We detect automatically: if the frontend is served from localhost, use localhost backend.
var API_BASE = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  ? 'http://localhost:3000'
  : 'https://YOUR_RAILWAY_URL_HERE';  // <-- update this after deploying to Railway

// =========================================================
// GRADES — state
// =========================================================
var gradesData = null;       // full grade data from the server
var currentUsername = '';    // stored only in memory, never in localStorage

// =========================================================
// GRADES — login / logout
// =========================================================
function gradesLogin() {
  var username = document.getElementById('sv-username').value.trim();
  var password = document.getElementById('sv-password').value;
  var errorEl  = document.getElementById('login-error');
  var btn      = document.getElementById('login-btn');

  errorEl.style.display = 'none';

  if (!username || !password) {
    errorEl.textContent = 'Please enter both your Student ID and password.';
    errorEl.style.display = 'block';
    return;
  }

  // Show loading state on button
  btn.disabled = true;
  btn.textContent = 'Signing in...';

  // POST credentials to our Node.js server — never stored, just forwarded
  fetch(API_BASE + '/api/grades', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: username, password: password })
  })
  .then(function(res) { return res.json(); })
  .then(function(data) {
    btn.disabled = false;
    btn.textContent = 'Sign in to StudentVUE';

    if (data.error) {
      var message = data.error;
      if (data.details) message += ' ' + data.details;
      if (data.debug) message += ' Debug: ' + data.debug;
      errorEl.textContent = message;
      errorEl.style.display = 'block';
      return;
    }

    // Login successful — store data in memory only
    gradesData = data;
    currentUsername = username;

    // Clear the password field immediately for security
    document.getElementById('sv-password').value = '';

    showGradesDashboard();
  })
  .catch(function(err) {
    btn.disabled = false;
    btn.textContent = 'Sign in to StudentVUE';
    errorEl.textContent = 'Could not connect to the server. Make sure the server is running.';
    errorEl.style.display = 'block';
  });
}

function gradesLogout() {
  // Wipe all grade data from memory
  gradesData = null;
  currentUsername = '';

  // Reset the UI back to the login screen
  document.getElementById('grades-dashboard').style.display = 'none';
  document.getElementById('grades-login').style.display = 'block';
  document.getElementById('sv-username').value = '';
  document.getElementById('sv-password').value = '';
  document.getElementById('login-error').style.display = 'none';
  document.getElementById('assignments-panel').style.display = 'none';
}

// =========================================================
// GRADES — render dashboard
// =========================================================
function showGradesDashboard() {
  document.getElementById('grades-login').style.display = 'none';
  document.getElementById('grades-dashboard').style.display = 'block';
  document.getElementById('assignments-panel').style.display = 'none';

  // Welcome message with student name
  var name = (gradesData.studentName || 'Student').split(' ')[0];
  document.getElementById('grades-welcome').textContent = 'Welcome back, ' + name;

  renderGpaRow();
  renderClassCards();
}

function renderGpaRow() {
  var courses = gradesData.courses || [];
  var gpaRow  = document.getElementById('gpa-row');

  // Calculate a simple unweighted GPA from letter grades
  var gradePoints = { 'A+':4.0,'A':4.0,'A-':3.7,'B+':3.3,'B':3.0,'B-':2.7,'C+':2.3,'C':2.0,'C-':1.7,'D+':1.3,'D':1.0,'D-':0.7,'F':0.0 };
  var total = 0, count = 0;
  courses.forEach(function(c) {
    var letter = (c.grade || '').trim();
    if (gradePoints[letter] !== undefined) { total += gradePoints[letter]; count++; }
  });
  var gpa = count > 0 ? (total / count).toFixed(2) : 'N/A';

  // Count passing / at risk
  var passing  = courses.filter(function(c) { return parseFloat(c.score) >= 70; }).length;
  var atRisk   = courses.filter(function(c) { var s = parseFloat(c.score); return !isNaN(s) && s < 70; }).length;

  gpaRow.innerHTML =
    '<div class="gpa-card"><div class="gpa-value">' + gpa + '</div><div class="gpa-label">Est. GPA</div></div>' +
    '<div class="gpa-card"><div class="gpa-value" style="color:#1a9e75">' + passing + '</div><div class="gpa-label">Passing</div></div>' +
    '<div class="gpa-card"><div class="gpa-value" style="color:' + (atRisk > 0 ? '#a32d2d' : '#1a9e75') + '">' + atRisk + '</div><div class="gpa-label">At Risk (&lt;70%)</div></div>';
}

function renderClassCards() {
  var courses = gradesData.courses || [];
  var grid    = document.getElementById('classes-grid');

  if (!courses.length) {
    grid.innerHTML = '<div style="color:#aaa;font-size:13px;padding:20px 0;">No grade data found for this term.</div>';
    return;
  }

  grid.innerHTML = courses.map(function(c, idx) {
    var score   = parseFloat(c.score);
    var pct     = isNaN(score) ? 0 : Math.min(score, 100);
    var letter  = (c.grade || 'N/A').trim();
    var badgeCls = gradeBadgeClass(letter);
    var barColor = pct >= 90 ? '#1a9e75' : pct >= 80 ? '#5dcaa5' : pct >= 70 ? '#ef9f27' : '#e24b4a';

    return (
      '<div class="class-card" onclick="showAssignments(' + idx + ')">' +
        '<div class="class-card-top">' +
          '<div class="class-name">' + escapeHtml(c.name || 'Unknown Class') + '</div>' +
          '<div class="class-grade-badge ' + badgeCls + '">' + escapeHtml(letter) + '</div>' +
        '</div>' +
        '<div class="class-teacher">' + escapeHtml(c.teacher || '') + '</div>' +
        '<div class="class-bar-wrap">' +
          '<div class="class-bar-fill" style="width:' + pct + '%;background:' + barColor + '"></div>' +
        '</div>' +
        '<div class="class-hint">' + (isNaN(score) ? 'No score yet' : score.toFixed(1) + '%') + ' — click for assignments</div>' +
      '</div>'
    );
  }).join('');
}

function gradeBadgeClass(letter) {
  if (!letter || letter === 'N/A') return 'grade-na';
  var l = letter.charAt(0).toUpperCase();
  if (l === 'A') return 'grade-a';
  if (l === 'B') return 'grade-b';
  if (l === 'C') return 'grade-c';
  if (l === 'D') return 'grade-d';
  if (l === 'F') return 'grade-f';
  return 'grade-na';
}

// =========================================================
// GRADES — assignment detail view
// =========================================================
function showAssignments(courseIdx) {
  var course      = (gradesData.courses || [])[courseIdx];
  if (!course) return;
  var panel       = document.getElementById('assignments-panel');
  var assignments = course.assignments || [];

  document.getElementById('assignments-class-name').textContent = course.name || 'Class';
  document.getElementById('assignments-class-grade').textContent =
    (course.grade || '') + (course.score ? '  (' + parseFloat(course.score).toFixed(1) + '%)' : '');

  if (!assignments.length) {
    document.getElementById('assignments-list').innerHTML =
      '<div style="color:#aaa;font-size:13px;padding:20px 0;">No assignments recorded for this class.</div>';
  } else {
    document.getElementById('assignments-list').innerHTML = assignments.map(function(a) {
      var scoreText, scoreCls;
      if (a.score === 'Not Graded' || a.score === '' || a.score === null || a.score === undefined) {
        scoreText = 'Not graded';
        scoreCls  = 'not-graded';
      } else if (a.score === 'Missing') {
        scoreText = 'Missing';
        scoreCls  = 'missing';
      } else {
        scoreText = escapeHtml(String(a.score));
        if (a.maxScore) scoreText += ' / ' + escapeHtml(String(a.maxScore));
        scoreCls = '';
      }

      return (
        '<div class="assignment-row">' +
          '<span class="assignment-name">' + escapeHtml(a.name || 'Assignment') + '</span>' +
          (a.category ? '<span class="assignment-category">' + escapeHtml(a.category) + '</span>' : '') +
          '<span class="assignment-score ' + scoreCls + '">' + scoreText + '</span>' +
          '<span class="assignment-date">' + escapeHtml(a.date || '') + '</span>' +
        '</div>'
      );
    }).join('');
  }

  // Scroll to and show the panel
  panel.style.display = 'block';
  setTimeout(function() { panel.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 50);
}

function closeAssignments() {
  document.getElementById('assignments-panel').style.display = 'none';
}
