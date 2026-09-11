'use strict';

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
  console.debug = () => {};
  console.log = () => {};
  console.warn = () => {};
  document.body.innerHTML = '';
});
