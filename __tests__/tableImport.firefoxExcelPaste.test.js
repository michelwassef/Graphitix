describe('tableImport Firefox Excel clipboard handling', () => {
  beforeEach(() => {
    jest.resetModules();
    require('../js/shared/tableImport.js');
  });

  test('parses Excel HTML clipboard content as TSV', async () => {
    const html = `
      <html><body>
        <table>
          <tr><td>1</td></tr>
          <tr><td>2</td></tr>
          <tr><td>3</td></tr>
        </table>
      </body></html>
    `;
    const event = {
      clipboardData: {
        items: [
          {
            kind: 'string',
            type: 'text/html',
            getAsString: callback => callback(html)
          }
        ],
        getData: () => ''
      }
    };

    await expect(window.Shared.tableImport.getClipboardTextFromEvent(event)).resolves.toBe('1\n2\n3');
    await expect(window.Shared.tableImport.getClipboardPayloadFromEvent(event)).resolves.toEqual({
      text: '1\n2\n3',
      delimiter: '\t',
      source: 'html-table'
    });
  });

  test('preserves spreadsheet structure when HTML and ambiguous plain text both exist', async () => {
    const html = '<html><body><table><tr><td>1,2</td></tr><tr><td>3,4</td></tr></table></body></html>';
    const event = {
      clipboardData: {
        items: [
          {
            kind: 'string',
            type: 'text/html',
            getAsString: callback => callback(html)
          },
          {
            kind: 'string',
            type: 'text/plain',
            getAsString: callback => callback('1,2\n3,4')
          }
        ],
        getData: () => ''
      }
    };

    await expect(window.Shared.tableImport.getClipboardPayloadFromEvent(event)).resolves.toEqual({
      text: '1,2\n3,4',
      delimiter: '\t',
      source: 'html-table'
    });
  });

  test('keeps plain CSV delimiter detection unchanged', async () => {
    const event = {
      clipboardData: {
        items: [
          {
            kind: 'string',
            type: 'text/plain',
            getAsString: callback => callback('1,2\n3,4')
          }
        ],
        getData: () => ''
      }
    };

    await expect(window.Shared.tableImport.getClipboardPayloadFromEvent(event)).resolves.toEqual({
      text: '1,2\n3,4',
      delimiter: null,
      source: 'plain-text'
    });
  });

  test('starts every Excel clipboard format read before the paste event expires', async () => {
    let eventActive = true;
    const html = '<table><tr><td>1,2</td></tr><tr><td>3,4</td></tr></table>';
    const event = {
      clipboardData: {
        items: [
          {
            kind: 'string',
            type: 'text/plain',
            getAsString: callback => Promise.resolve().then(() => {
              eventActive = false;
              callback('1,2\n3,4');
            })
          },
          {
            kind: 'string',
            type: 'text/html',
            getAsString: callback => callback(eventActive ? html : '')
          }
        ],
        getData: () => ''
      }
    };

    await expect(window.Shared.tableImport.getClipboardPayloadFromEvent(event)).resolves.toEqual({
      text: '1,2\n3,4',
      delimiter: '\t',
      source: 'html-table'
    });
  });
});
