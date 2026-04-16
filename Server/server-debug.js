// =========================================================
// StudyHub backend server - CLEAN & ROBUST VERSION
// =========================================================

const express = require('express');
const cors = require('cors');
const path = require('path');
const studentVueModule = require('studentvue');
const studentVueApi = studentVueModule.default || studentVueModule;

const app = express();
const PORT = process.env.PORT || 3000;

const DISTRICT_URL = 'https://md-mcps-psv.edupoint.com';

function sanitizeErrorMessage(err) {
  const raw = String((err && err.message) || err || '').trim();
  if (!raw) return 'Unknown error';
  return raw
    .replace(/password[^,\n]*/gi, 'password=[redacted]')
    .replace(/username[^,\n]*/gi, 'username=[redacted]')
    .replace(/\s+/g, ' ')
    .slice(0, 300);
}

// Middleware - MUST be before routes
app.use(cors());
app.use(express.json());                    // This fixes the "req.body is undefined" error
app.use(express.static(path.join(__dirname, '../Frontend')));

// POST /api/grades - Handles new quarters gracefully
app.post('/api/grades', async function(req, res) {
  const { username, password } = req.body || {};
  const quarter = parseInt(req.query.quarter, 10) || null;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }

  try {
    console.log(`[LOGIN ATTEMPT] ${username} (quarter: ${quarter || 'current'})`);

    const client = await studentVueApi.login(DISTRICT_URL, {
      username: String(username).trim(),
      password: String(password)
    });

    // Try to get gradebook
    let gradebook;
    try {
      const options = quarter ? { markingPeriod: quarter } : {};
      gradebook = await client.gradebook(options);
    } catch (gbErr) {
      const msg = String(gbErr.message || gbErr);
      if (msg.includes('Cannot read properties of undefined') || msg.includes("reading '0'")) {
        // New/empty quarter case - treat as success with no data
        console.warn('Empty quarter detected - returning N/A grades');
        return res.json({
          studentName: 'Student',
          courses: [],
          note: 'No grades have been entered yet for this quarter.'
        });
      }
      throw gbErr; // other errors
    }

    let studentName = 'Student';
    try {
      const info = await client.studentInfo();
      studentName = info?.student?.name || 'Student';
    } catch (e) {}

    // Safe course parsing
    const courses = (gradebook?.courses || []).map(course => {
      if (!course) return { name: 'Unknown Class', teacher: '', grade: 'N/A', score: null, assignments: [] };

      const marks = course.Marks || {};
      const mark = marks.Mark || (Array.isArray(marks) ? marks[0] : {}) || {};

      const rawAssignments = [];

      try {
        if (mark.Assignments?.Assignment) {
          let list = mark.Assignments.Assignment;
          if (!Array.isArray(list)) list = list ? [list] : [];
          list.forEach(a => {
            if (a) {
              rawAssignments.push({
                name: a.Measure || 'Assignment',
                category: a.Type || '',
                score: a.Score || 'Not Graded',
                maxScore: a.ScoreType || '',
                date: a.Date || '',
                notes: a.Notes || ''
              });
            }
          });
        }
      } catch (e) {}

      return {
        name: course.Title || 'Unknown Class',
        teacher: course.Staff || '',
        grade: mark.CalculatedScoreString || 'N/A',
        score: mark.CalculatedScoreRaw || null,
        assignments: rawAssignments
      };
    });

    const note = courses.every(c => c.grade === 'N/A') 
      ? 'No grades have been entered yet for this quarter.' 
      : null;

    return res.json({ studentName, courses, note });

  } catch (err) {
    const safeMessage = sanitizeErrorMessage(err);
    console.error('[/api/grades] FAILED:', safeMessage);

    return res.status(500).json({
      error: 'Could not fetch grades. StudentVUE may be down or unreachable.',
      details: 'Please try again in a few minutes.',
      debug: safeMessage
    });
  }
});

// Serve frontend
app.get('*', function(req, res) {
  res.sendFile(path.join(__dirname, '../Frontend/index.html'));
});

app.listen(PORT, function() {
  console.log(`StudyHub server running on http://localhost:${PORT}`);
});