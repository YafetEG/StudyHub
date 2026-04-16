// =========================================================
// StudyHub backend server
// =========================================================
// This server acts as a middleman between the frontend and
// the StudentVUE API. It receives credentials from the
// frontend, forwards them to StudentVUE, and returns grade
// data. Credentials are NEVER logged or stored anywhere.
// =========================================================

const express = require('express');
const cors = require('cors');
const path = require('path');
const studentVueModule = require('studentvue');
const studentVueApi = studentVueModule.default || studentVueModule;

const app = express();
const PORT = process.env.PORT || 3000;

// MCPS StudentVUE domain, hardcoded so users only need their ID + password.
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

function classifyStudentVueError(message) {
  const msg = String(message || '').toLowerCase();

  if (
    msg.includes('invalid') ||
    msg.includes('login') ||
    msg.includes('password') ||
    msg.includes('username') ||
    msg.includes('credentials') ||
    msg.includes('authentication')
  ) {
    return {
      status: 401,
      error: 'Incorrect Student ID or password. Please try again.',
      details: 'StudentVUE rejected the login credentials.'
    };
  }

  if (
    msg.includes('timeout') ||
    msg.includes('network') ||
    msg.includes('socket') ||
    msg.includes('fetch') ||
    msg.includes('connect') ||
    msg.includes('dns') ||
    msg.includes('econn') ||
    msg.includes('unreachable')
  ) {
    return {
      status: 502,
      error: 'Could not reach StudentVUE right now.',
      details: 'The StudyHub server could not connect to the StudentVUE service.'
    };
  }

  return {
    status: 500,
    error: 'Could not fetch grades. StudentVUE may be down or unreachable.',
    details: 'StudentVUE returned an unexpected error.'
  };
}

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../Frontend')));

app.post('/api/grades', async function(req, res) {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }

  try {
    const client = await studentVueApi.login(DISTRICT_URL, {
      username: String(username).trim(),
      password: String(password)
    });

    const gradebook = await client.gradebook();

    let studentName = 'Student';
    try {
      const info = await client.studentInfo();
      studentName = info.student.name || 'Student';
    } catch (e) {
      studentName = 'Student';
    }

    const courses = (gradebook.courses || []).map(function(course) {
      const mark = (course.Marks && course.Marks.Mark) ? course.Marks.Mark : {};
      const rawAssignments = [];

      if (mark.Assignments && mark.Assignments.Assignment) {
        const list = Array.isArray(mark.Assignments.Assignment)
          ? mark.Assignments.Assignment
          : [mark.Assignments.Assignment];

        list.forEach(function(a) {
          rawAssignments.push({
            name: a.Measure || 'Assignment',
            category: a.Type || '',
            score: a.Score || 'Not Graded',
            maxScore: a.ScoreType || '',
            date: a.Date || '',
            notes: a.Notes || ''
          });
        });
      }

      return {
        name: course.Title || 'Unknown Class',
        teacher: course.Staff || '',
        grade: mark.CalculatedScoreString || 'N/A',
        score: mark.CalculatedScoreRaw || null,
        assignments: rawAssignments
      };
    });

    return res.json({ studentName, courses });
  } catch (err) {
    const safeMessage = sanitizeErrorMessage(err);
    const classified = classifyStudentVueError(safeMessage);

    console.error('[/api/grades] StudentVUE request failed:', {
      districtUrl: DISTRICT_URL,
      message: safeMessage,
      code: err && err.code ? err.code : null,
      name: err && err.name ? err.name : null
    });

    return res.status(classified.status).json({
      error: classified.error,
      details: classified.details,
      debug: safeMessage
    });
  }
});

app.get('*', function(req, res) {
  res.sendFile(path.join(__dirname, '../Frontend/index.html'));
});

app.listen(PORT, function() {
  console.log('StudyHub server running on http://localhost:' + PORT);
});
