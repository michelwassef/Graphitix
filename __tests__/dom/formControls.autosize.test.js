'use strict';

describe('Shared formControls auto-sizing', () => {
  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = '<main id="formControlsFixture"></main>';
    global.Shared = window.Shared = {};
    require('../../js/shared/formControls.js');
  });

  test('autoSizeSelect applies width respecting minimum constraints', () => {
    const { formControls } = window.Shared;
    const measure = formControls.ensureSelectMeasure(document);
    Object.defineProperty(measure, 'offsetWidth', {
      configurable: true,
      get() {
        const length = (this.textContent || '').length;
        return length * 9;
      }
    });

    const select = document.createElement('select');
    select.dataset.minSelectWidth = '150';
    const optionA = document.createElement('option');
    optionA.textContent = 'A';
    select.appendChild(optionA);
    const optionB = document.createElement('option');
    optionB.textContent = 'B';
    select.appendChild(optionB);
    document.body.appendChild(select);

    formControls.autoSizeSelect(select);
    expect(select.style.width).toBe('150px');
    expect(select.style.minWidth).toBe('150px');

    select.removeAttribute('data-min-select-width');
    const optionLong = document.createElement('option');
    optionLong.textContent = 'Longest label here';
    select.appendChild(optionLong);
    formControls.autoSizeSelect(select);
    const measuredWidth = parseInt(select.style.width, 10);
    expect(Number.isNaN(measuredWidth)).toBe(false);
    expect(measuredWidth).toBeGreaterThanOrEqual(optionLong.textContent.length * 9 + 1);
  });
});
