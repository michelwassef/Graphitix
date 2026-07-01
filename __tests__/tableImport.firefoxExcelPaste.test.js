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
  });

  test('prefers plain TSV over Excel HTML when both exist', async () => {
    const html = '<html><body><table><tr><td>wrong</td></tr></table></body></html>';
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
            getAsString: callback => callback('1\n2\n3')
          }
        ],
        getData: () => ''
      }
    };

    await expect(window.Shared.tableImport.getClipboardTextFromEvent(event)).resolves.toBe('1\n2\n3');
  });
});
