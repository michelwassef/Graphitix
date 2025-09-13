const { add } = require('../src/adder');

test('adds two numbers', () => {
  const result = add(2, 3);
  console.debug('Debug: result of add(2,3)', result); // Debug: verify addition result
  expect(result).toBe(5);
});
