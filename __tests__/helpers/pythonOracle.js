const { spawnSync } = require('child_process');
const path = require('path');
let oracleAvailabilityNoticeEmitted = false;

function parseOracleOutput(stdout, stderr, commandLabel) {
  const trimmed = (stdout || '').trim();
  if (!trimmed) {
    throw new Error(`Python oracle produced no output for ${commandLabel}. stderr: ${stderr || '(none)'}`);
  }
  let payload;
  try {
    payload = JSON.parse(trimmed);
  } catch (err) {
    throw new Error(`Python oracle returned invalid JSON for ${commandLabel}: ${err.message}\nstdout=${trimmed}\nstderr=${stderr || '(none)'}`);
  }
  if (!payload || payload.ok !== true || !Array.isArray(payload.results)) {
    throw new Error(`Python oracle returned malformed payload for ${commandLabel}: ${trimmed}`);
  }
  return payload.results;
}

function runPythonCommand(command, args, scriptPath, input) {
  return spawnSync(command, [...args, scriptPath], {
    encoding: 'utf8',
    input,
    cwd: path.resolve(__dirname, '..', '..')
  });
}

function buildPythonAttempts() {
  const attempts = [];
  if (process.env.PYTHON_BIN) {
    attempts.push({ command: process.env.PYTHON_BIN, args: [], label: `PYTHON_BIN=${process.env.PYTHON_BIN}` });
  }
  attempts.push({ command: 'python', args: [], label: 'python' });
  attempts.push({ command: 'py', args: ['-3'], label: 'py -3' });
  return attempts;
}

function tryPythonOracle(payload) {
  const scriptPath = path.resolve(__dirname, '..', '..', 'scripts', 'stats_oracle.py');
  const attempts = buildPythonAttempts();
  const failures = [];
  for (const attempt of attempts) {
    const result = runPythonCommand(attempt.command, attempt.args, scriptPath, payload);
    if (result.error) {
      failures.push(`${attempt.label}: ${result.error.message}`);
      continue;
    }
    if (result.status !== 0) {
      failures.push(`${attempt.label}: exit ${result.status}; stderr=${(result.stderr || '').trim() || '(none)'}`);
      continue;
    }
    return {
      ok: true,
      results: parseOracleOutput(result.stdout, result.stderr, attempt.label)
    };
  }
  return {
    ok: false,
    detail: failures.length ? failures.join('\n') : 'No attempts were made.'
  };
}

function detectPythonOracleAvailability() {
  const probePayload = JSON.stringify({ cases: [] });
  const probe = tryPythonOracle(probePayload);
  if (probe.ok) {
    return { available: true, reason: '' };
  }
  const reason = probe.detail || 'Unknown Python oracle error.';
  const message = [
    '[stats-oracle] Python oracle unavailable.',
    reason,
    'Set PYTHON_BIN to a valid interpreter to enable oracle-backed differential tests.',
    'Set TEST_REQUIRE_PYTHON_ORACLE=1 to fail immediately when oracle coverage is missing.',
    'Set TEST_ALLOW_ORACLE_SKIP=1 to allow skips in CI.'
  ].join('\n');
  if (!oracleAvailabilityNoticeEmitted) {
    oracleAvailabilityNoticeEmitted = true;
    try {
      process.stderr.write(`${message}\n`);
    } catch (_err) {
      // Ignore stderr write failures in constrained runtimes.
    }
  }
  const requireOracle = process.env.TEST_REQUIRE_PYTHON_ORACLE === '1'
    || (process.env.CI === 'true' && process.env.TEST_ALLOW_ORACLE_SKIP !== '1');
  if (requireOracle) {
    throw new Error(message);
  }
  return { available: false, reason };
}

function runPythonOracle(cases, options = {}) {
  if (!Array.isArray(cases)) {
    throw new TypeError('runPythonOracle(cases): cases must be an array');
  }
  const requestPayload = JSON.stringify({ cases });
  const response = tryPythonOracle(requestPayload);
  if (response.ok) {
    return response.results;
  }
  const detail = response.detail || 'No attempts were made.';
  throw new Error(`Unable to execute Python oracle.\n${detail}`);
}

function indexOracleResults(results) {
  const map = new Map();
  (results || []).forEach(entry => {
    if (entry && typeof entry === 'object') {
      map.set(entry.id, entry);
    }
  });
  return map;
}

module.exports = {
  runPythonOracle,
  indexOracleResults,
  detectPythonOracleAvailability
};
