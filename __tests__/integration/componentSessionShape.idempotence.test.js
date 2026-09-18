const { loadProductionBootstrap } = require('../../test-support/productionLoader');

const COMPONENT_TYPES = ['hist', 'roc', 'pca', 'venn', 'pie'];

describe('component session shaping is idempotent', () => {
  jest.setTimeout(240000);

  async function flush() {
    await Promise.resolve();
    await new Promise(resolve => setTimeout(resolve, 0));
  }

  async function selectComponent(Main, type) {
    const pending = Main.tabs.handleGraphSelection(type, { reason: 'session-shape-test' });
    if (pending && typeof pending.then === 'function') {
      await pending;
    }
    const prompt = document.getElementById('duplicatePrompt');
    if (prompt && !prompt.hasAttribute('hidden')) {
      document.getElementById('duplicateEmpty')?.click();
    }
    await flush();
  }

  beforeEach(() => {
    jest.resetModules();
    loadProductionBootstrap({
      vendorMode: 'fake',
      preloadComponents: COMPONENT_TYPES
    });
  });

  test('all affected components preserve identity and still normalize replacement', async () => {
    const Main = window.Main;
    for (const type of COMPONENT_TYPES) {
      await selectComponent(Main, type);

      const tab = Main.tabs.getActiveTab();
      const component = window.Components[type];
      const session = component.__testHooks.getSession(tab.id);
      expect(session).toBeTruthy();

      const firstState = session.state;
      const firstResults = session.results;
      const firstNotes = session.notes;
      const firstAdvisor = session.advisor;
      const firstDrawRuntime = session.timers?.drawRuntime;
      const firstRenderRuntime = session.cache?.renderRuntime;
      const firstAnalysisRuntime = session.cache?.analysisRuntime;
      const repeated = component.__testHooks.getSession(tab.id);

      expect(repeated).toBe(session);
      expect(repeated.state).toBe(firstState);
      expect(repeated.results).toBe(firstResults);
      expect(repeated.notes).toBe(firstNotes);
      if (type === 'roc' || type === 'pie') {
        expect(repeated.advisor).toBe(firstAdvisor);
      }
      if (type === 'roc' || type === 'pca') {
        expect(repeated.timers.drawRuntime).toBe(firstDrawRuntime);
      }
      if (type === 'pca') {
        expect(repeated.cache.renderRuntime).toBe(firstRenderRuntime);
        expect(repeated.cache.analysisRuntime).toBe(firstAnalysisRuntime);
      }

      const replacement = { ...session.state };
      session.state = replacement;
      const normalized = component.__testHooks.getSession(tab.id);
      expect(normalized.state).not.toBe(replacement);
      const normalizedState = normalized.state;
      expect(component.__testHooks.getSession(tab.id).state).toBe(normalizedState);
    }
  });
});
