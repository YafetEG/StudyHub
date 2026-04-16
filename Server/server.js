// =========================================================
// StudyHub — Node.js backend server
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

// MCPS StudentVUE domain
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

  // Catch parsing crashes and incomplete data from StudentVUE
  if (
    msg.includes('cannot read properties') ||
    msg.includes('undefined') ||
    msg.includes('null') ||
    msg.includes('reading') ||
    msg.includes('assignment')
  ) {
    return {
      status: 503,
      error: 'StudentVUE is currently unstable or returning incomplete data.',
      details: 'This is a temporary issue with the official StudentVUE service. Please try again in a few minutes.'
    };
  }

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

// =========================================================
// Middleware
// =========================================================
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../Frontend')));

// =========================================================
// POST /api/grades - ROBUST VERSION
// =========================================================
app.post('/api/grades', async function(req, res) {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }

  try {
    // Login to StudentVUE
    const client = await studentVueApi.login(DISTRICT_URL, {
      username: String(username).trim(),
      password: String(password)
    });

    // Fetch gradebook with error catching
    let gradebook;
    try {
      gradebook = await client.gradebook();
    } catch (fetchErr) {
      console.error('gradebook() call failed:', fetchErr.message);
      throw fetchErr;
    }

    // Fetch student name (optional - don't fail if this breaks)
    let studentName = 'Student';
    try {
      const info = await client.studentInfo();
      studentName = info?.student?.name || 'Student';
    } catch (e) {
      // Ignore - student name is not critical
    }

    // === VERY DEFENSIVE COURSE & ASSIGNMENT PARSING ===
    const courses = (gradebook?.courses || []).map(function(course) {
      // Safely get the current mark
      const marksObj = course?.Marks || {};
      const mark = marksObj.Mark || (Array.isArray(marksObj) ? marksObj[0] : {});

      const rawAssignments = [];

      // Safely extract assignments
      if (mark?.Assignments?.Assignment) {
        let assignmentList = mark.Assignments.Assignment;

        // Normalize to array (StudentVUE sometimes returns single object instead of array)
        if (!Array.isArray(assignmentList)) {
          assignmentList = assignmentList ? [assignmentList] : [];
        }

        assignmentList.forEach(function(a) {
          if (!a) return; // skip any null/undefined entries

          rawAssignments.push({
            name:     a.Measure     || 'Assignment',
            category: a.Type        || '',
            score:    a.Score       || 'Not Graded',
            maxScore: a.ScoreType   || '',
            date:     a.Date        || '',
            notes:    a.Notes       || ''
          });
        });
      }

      return {
        name:        course?.Title           || 'Unknown Class',
        teacher:     course?.Staff           || '',
        grade:       mark?.CalculatedScoreString || 'N/A',
        score:       mark?.CalculatedScoreRaw    || null,
        assignments: rawAssignments
      };
    });

    return res.json({ 
      studentName, 
      courses 
    });

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

// =========================================================
// Catch-all: serve the frontend
// =========================================================
app.get('*', function(req, res) {
  res.sendFile(path.join(__dirname, '../Frontend/index.html'));
});

// =========================================================
// Start server
// =========================================================
app.listen(PORT, function() {
  console.log(`StudyHub server running on http://localhost:${PORT}`);
});