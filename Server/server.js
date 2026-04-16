// =========================================================
// StudyHub backend server
// ========================================================

const express = require('express');
const cors = require('cors');
const path = require('path');
const studentVueModule = require('studentvue');
const studentVueApi = studentVueModule.default || studentVueModule;
const xmlFactoryModule = require('studentvue/lib/utils/XMLFactory/XMLFactory');
const XMLFactory = xmlFactoryModule.default || xmlFactoryModule;

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

function classifyStudentVueError(message) {
  const msg = String(message || '').toLowerCase();

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

function toArray(value) {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined) return [];
  return [value];
}

function first(value) {
  return Array.isArray(value) ? value[0] : value;
}

function decodeValue(value) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  try {
    return decodeURI(text);
  } catch (e) {
    return text;
  }
}

function readRawAttr(node, key, fallback) {
  const value = first(node && node[key]);
  if (value === null || value === undefined || value === '') return fallback;
  return decodeValue(value);
}

function readRawNumber(node, key) {
  const value = Number(readRawAttr(node, key, ''));
  return Number.isFinite(value) ? value : null;
}

function normalizeLibraryGradebook(gradebook) {
  return {
    courses: toArray(gradebook && gradebook.courses).map(function(course) {
      const mark = toArray(course && course.marks)[0] || null;
      return {
        name: course && course.title ? course.title : 'Unknown Class',
        teacher: course && course.staff && course.staff.name ? course.staff.name : '',
        grade: mark && mark.calculatedScore && mark.calculatedScore.string ? mark.calculatedScore.string : 'N/A',
        score: mark && mark.calculatedScore ? mark.calculatedScore.raw : null,
        assignments: toArray(mark && mark.assignments).map(function(assignment) {
          return {
            name: assignment && assignment.name ? assignment.name : 'Assignment',
            category: assignment && assignment.type ? assignment.type : '',
            score: assignment && assignment.score && assignment.score.value ? assignment.score.value : 'Not Graded',
            maxScore: assignment && assignment.score && assignment.score.type ? assignment.score.type : '',
            date: assignment && assignment.date && assignment.date.start ? assignment.date.start : '',
            notes: assignment && assignment.notes ? assignment.notes : ''
          };
        })
      };
    }),
    reportingPeriod: gradebook && gradebook.reportingPeriod ? gradebook.reportingPeriod : null
  };
}

async function fetchRawGradebook(client, quarter) {
  const xmlObject = await client.processRequest({
    methodName: 'Gradebook',
    paramStr: {
      childIntId: 0,
      ...(quarter !== null && quarter !== undefined ? { ReportPeriod: quarter } : {})
    }
  }, function(xml) {
    return new XMLFactory(xml)
      .encodeAttribute('MeasureDescription', 'HasDropBox')
      .encodeAttribute('Measure', 'Type')
      .toString();
  });

  const gradebookNode = first(xmlObject && xmlObject.Gradebook) || {};
  const currentPeriodNode = first(gradebookNode.ReportingPeriod) || null;
  const reportingPeriodsNode = first(gradebookNode.ReportingPeriods) || {};
  const courseNodes = toArray((first(gradebookNode.Courses) || {}).Course);

  return {
    courses: courseNodes.map(function(course) {
      const mark = toArray((first(course && course.Marks) || {}).Mark)[0] || null;
      return {
        name: readRawAttr(course, '@_Title', 'Unknown Class'),
        teacher: readRawAttr(course, '@_Staff', ''),
        grade: readRawAttr(mark, '@_CalculatedScoreString', 'N/A'),
        score: readRawNumber(mark, '@_CalculatedScoreRaw'),
        assignments: toArray((first(mark && mark.Assignments) || {}).Assignment).map(function(assignment) {
          return {
            name: readRawAttr(assignment, '@_Measure', 'Assignment'),
            category: readRawAttr(assignment, '@_Type', ''),
            score: readRawAttr(assignment, '@_Score', 'Not Graded'),
            maxScore: readRawAttr(assignment, '@_ScoreType', ''),
            date: readRawAttr(assignment, '@_Date', ''),
            notes: readRawAttr(assignment, '@_Notes', '')
          };
        })
      };
    }),
    reportingPeriod: {
      current: currentPeriodNode ? {
        name: readRawAttr(currentPeriodNode, '@_GradePeriod', ''),
        index: quarter !== null && quarter !== undefined ? quarter : readRawNumber(currentPeriodNode, '@_Index'),
        date: {
          start: readRawAttr(currentPeriodNode, '@_StartDate', ''),
          end: readRawAttr(currentPeriodNode, '@_EndDate', '')
        }
      } : null,
      available: toArray(reportingPeriodsNode.ReportPeriod).map(function(period) {
        return {
          name: readRawAttr(period, '@_GradePeriod', ''),
          index: readRawNumber(period, '@_Index'),
          date: {
            start: readRawAttr(period, '@_StartDate', ''),
            end: readRawAttr(period, '@_EndDate', '')
          }
        };
      })
    }
  };
}

async function fetchGradebookSafely(client, quarter) {
  try {
    return normalizeLibraryGradebook(
      await client.gradebook(quarter !== null && quarter !== undefined ? quarter : undefined)
    );
  } catch (err) {
    const message = String((err && err.message) || err || '');
    if (!message.includes('Cannot read properties of undefined') && !message.includes("reading '0'")) {
      throw err;
    }

    console.warn('[gradebook fallback] StudentVUE parser crashed, retrying with raw parsing.');
    return fetchRawGradebook(client, quarter);
  }
}

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../Frontend')));

app.post('/api/grades', async function(req, res) {
  const { username, password } = req.body;
  const quarter = parseInt(req.query.quarter, 10) || null;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }

  try {
    const client = await studentVueApi.login(DISTRICT_URL, {
      username: String(username).trim(),
      password: String(password)
    });

    const gradebook = await fetchGradebookSafely(client, quarter);

    let studentName = 'Student';
    try {
      const info = await client.studentInfo();
      studentName = info && info.student && info.student.name ? info.student.name : 'Student';
    } catch (e) {}

    const courses = toArray(gradebook && gradebook.courses);
    const note = courses.length && courses.every(function(course) {
      return !course || !course.grade || course.grade === 'N/A';
    })
      ? 'No grades have been entered yet for the current quarter.'
      : null;

    return res.json({
      studentName: studentName,
      courses: courses,
      note: note
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

app.get('*', function(req, res) {
  res.sendFile(path.join(__dirname, '../Frontend/index.html'));
});

app.listen(PORT, function() {
  console.log(`StudyHub server running on http://localhost:${PORT}`);
});