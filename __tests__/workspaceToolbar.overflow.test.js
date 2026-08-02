let toolbarKeyCounter = 0;
const mountedContainers = new Set();

function mountToolbarContainer(key) {
  const container = document.createElement('div');
  container.className = 'workspace-page__topbar';
  container.dataset.toolbar = key;
  document.body.appendChild(container);
  mountedContainers.add(container);
  return container;
}

function nextToolbarKey(prefix) {
  toolbarKeyCounter += 1;
  return `${prefix}-${toolbarKeyCounter}`;
}

function flushToolbar() {
  return new Promise(resolve => setTimeout(resolve, 10));
}

describe('workspace toolbar overflow integration', () => {
  afterEach(() => {
    mountedContainers.forEach(container => {
      const toolbar = container.querySelector('.workspace-toolbar');
      if (toolbar) {
        window.Shared.toolbarOverflow.detach(toolbar);
      }
      container.remove();
    });
    mountedContainers.clear();
  });

  test('renders one owner-preserving overflow rail for every section', async () => {
    const key = nextToolbarKey('overflow-integration');
    const container = mountToolbarContainer(key);

    window.Shared.workspaceToolbar.register(key, {
      ariaLabel: 'Overflow integration actions',
      sections: [
        {
          type: 'buttons',
          caption: 'File',
          buttons: [
            {
              id: `${key}-open`,
              label: 'Open',
              icon: 'open',
              menuItems: [{ id: `${key}-open-file`, label: 'Open file' }]
            },
            { id: `${key}-save`, label: 'Save', icon: 'save' }
          ]
        },
        {
          type: 'buttons',
          caption: 'Data',
          buttons: [
            { id: `${key}-transpose`, label: 'Transpose', icon: 'copy' },
            { id: `${key}-normalize`, label: 'Normalize', icon: 'copy' }
          ]
        },
        {
          type: 'dock',
          caption: 'Format',
          hostId: `${key}-format-host`,
          scopeId: key
        }
      ]
    });

    window.Shared.workspaceToolbar.renderForElement(container);
    await flushToolbar();

    const toolbar = container.querySelector('.workspace-toolbar');
    const sections = Array.from(toolbar.querySelectorAll('.workspace-toolbar__section[data-toolbar-section-id]'));
    expect(sections).toHaveLength(3);
    sections.forEach(section => {
      expect(section.querySelectorAll(':scope > [data-toolbar-overflow-shell="1"]')).toHaveLength(1);
      expect(section.querySelectorAll('[data-toolbar-overflow-viewport="1"]')).toHaveLength(1);
      expect(section.querySelectorAll('[data-toolbar-overflow-track="1"]')).toHaveLength(1);
    });

    const open = document.getElementById(`${key}-open`);
    expect(open.closest('.workspace-toolbar__section')).toBe(sections[0]);
    expect(open.closest('[data-toolbar-overflow-track="1"]')).not.toBeNull();
  });

  test('restores sections by stable section id and resets that rail', async () => {
    const key = nextToolbarKey('overflow-restore');
    const container = mountToolbarContainer(key);

    window.Shared.workspaceToolbar.register(key, {
      sections: [
        { type: 'buttons', caption: 'File', buttons: [{ id: `${key}-save`, label: 'Save', icon: 'save' }] },
        { type: 'buttons', caption: 'Data', buttons: [{ id: `${key}-data`, label: 'Data action', icon: 'copy' }] }
      ]
    });
    window.Shared.workspaceToolbar.renderForElement(container);
    await flushToolbar();

    const toolbar = container.querySelector('.workspace-toolbar');
    const tabs = Array.from(toolbar.querySelectorAll('.workspace-toolbar__tab[data-toolbar-section-target]'));
    const generalId = tabs.find(tab => tab.textContent.trim() === 'General').dataset.toolbarSectionTarget;
    const dataId = tabs.find(tab => tab.textContent.trim() === 'Data').dataset.toolbarSectionTarget;

    expect(window.Shared.workspaceToolbar.activateSectionById(toolbar, dataId, {
      manual: true,
      resetOverflow: true
    })).toBe(true);
    expect(toolbar.dataset.toolbarActiveSection).toBe(dataId);

    const dataViewport = toolbar.querySelector(`[data-toolbar-section-id="${dataId}"] [data-toolbar-overflow-viewport="1"]`);
    dataViewport.scrollLeft = 90;

    expect(window.Shared.workspaceToolbar.activateSectionById(toolbar, generalId, {
      manual: true,
      resetOverflow: true
    })).toBe(true);
    expect(toolbar.dataset.toolbarActiveSection).toBe(generalId);
    expect(toolbar.querySelector(`[data-toolbar-section-id="${generalId}"]`).hasAttribute('hidden')).toBe(false);
    expect(toolbar.querySelector(`[data-toolbar-section-id="${dataId}"]`).hasAttribute('hidden')).toBe(true);

    expect(window.Shared.workspaceToolbar.activateSectionById(toolbar, dataId, {
      manual: true,
      resetOverflow: true
    })).toBe(true);
    expect(dataViewport.scrollLeft).toBe(0);
  });

  test('floats existing menus instead of cloning controls into overflow state', async () => {
    const key = nextToolbarKey('overflow-menu');
    const container = mountToolbarContainer(key);

    window.Shared.workspaceToolbar.register(key, {
      sections: [{
        type: 'buttons',
        caption: 'File',
        buttons: [{
          id: `${key}-open`,
          label: 'Open',
          icon: 'open',
          menuItems: [{ id: `${key}-open-file`, label: 'Open file' }]
        }]
      }]
    });
    window.Shared.workspaceToolbar.renderForElement(container);
    await flushToolbar();

    const toolbar = container.querySelector('.workspace-toolbar');
    const trigger = document.getElementById(`${key}-open`);
    const wrapper = trigger.closest('.workspace-toolbar__menu');
    const menu = wrapper.querySelector('.workspace-toolbar__menu-list');
    trigger.getBoundingClientRect = () => ({ left: 8, right: 88, top: 20, bottom: 60, width: 80, height: 40 });
    menu.getBoundingClientRect = () => ({ left: 0, right: 180, top: 0, bottom: 120, width: 180, height: 120 });

    trigger.click();
    expect(wrapper.classList.contains('workspace-toolbar__menu--open')).toBe(true);
    expect(menu.dataset.toolbarFloatingOverlay).toBe('1');
    expect(menu.style.position).toBe('fixed');
    expect(menu.closest('.workspace-toolbar__menu')).toBe(wrapper);
    expect(document.querySelectorAll(`[id="${key}-open-file"]`)).toHaveLength(1);

    trigger.click();
    expect(wrapper.classList.contains('workspace-toolbar__menu--open')).toBe(false);
    expect(menu.dataset.toolbarFloatingOverlay).toBeUndefined();
  });

  test('renders Data transforms with the shared toolbar panel and title contract', async () => {
    const key = nextToolbarKey('transform-panel');
    const container = mountToolbarContainer(key);

    window.Shared.workspaceToolbar.register(key, {
      sections: [{
        type: 'buttons',
        caption: 'Data transformation',
        transformSection: true,
        transformKey: key,
        buttons: [{
          id: `${key}-normalize`,
          label: 'Normalize rows',
          classes: ['workspace-toolbar__button--text-only'],
          dataset: { transformOption: 'normalizeRows' }
        }]
      }]
    });
    window.Shared.workspaceToolbar.renderForElement(container);
    await flushToolbar();

    const section = container.querySelector('[data-transform-section="1"]');
    const panel = section.querySelector(':scope [data-toolbar-overflow-track="1"] > .workspace-toolbar__panel--transform');
    const title = panel?.querySelector(':scope > .workspace-toolbar__panel-title');
    const buttons = panel?.querySelector(':scope > .workspace-toolbar__buttons');

    expect(panel).not.toBeNull();
    expect(title?.textContent).toBe('Data transformation');
    expect(buttons?.querySelector(`#${key}-normalize`)).not.toBeNull();
    expect(section.querySelector(':scope .workspace-toolbar__caption')).toBeNull();
  });
});
