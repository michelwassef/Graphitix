function describeExpected(expected) {
  if (expected instanceof RegExp) {
    return expected.toString();
  }
  return JSON.stringify(String(expected));
}

function matches(source, expected, kind) {
  if (kind === 'contains') {
    if (typeof expected !== 'string') {
      throw new TypeError('Source contract substring must be a string');
    }
    return source.includes(expected);
  }

  if (typeof expected === 'string') {
    return source.includes(expected);
  }
  if (expected instanceof RegExp) {
    const flags = expected.flags.replace(/[gy]/g, '');
    return new RegExp(expected.source, flags).test(source);
  }
  throw new TypeError('Source contract pattern must be a string or regular expression');
}

function expectSource(source, label = 'source') {
  if (typeof source !== 'string') {
    throw new TypeError(`Source contract received ${typeof source}, expected a string`);
  }

  const check = (expected, kind, negate) => {
    const pass = matches(source, expected, kind);
    if (negate ? pass : !pass) {
      const expectation = `${negate ? 'not ' : ''}${kind} ${describeExpected(expected)}`;
      const error = new Error(
        `Source contract failed for ${label}: expected ${expectation} (source length: ${source.length})`
      );
      if (Error.captureStackTrace) {
        Error.captureStackTrace(error, expectSource);
      }
      throw error;
    }
  };

  return {
    toContain(expected) {
      check(expected, 'contains', false);
    },
    toMatch(expected) {
      check(expected, 'matches', false);
    },
    not: {
      toContain(expected) {
        check(expected, 'contains', true);
      },
      toMatch(expected) {
        check(expected, 'matches', true);
      }
    }
  };
}

module.exports = { expectSource };
