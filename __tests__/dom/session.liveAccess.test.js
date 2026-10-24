const {initializeWorkspaceHarness}=require('../setup/workspaceHarness');
const {loadComponentTestBootstrap}=require('../../test-support/componentTestBootstrap');

describe.each(['box','scatter'])('%s live session access',type=>{
  let hooks;
  beforeEach(()=>{
    jest.resetModules();initializeWorkspaceHarness();loadComponentTestBootstrap(type);
    hooks=window.Components[type].__testHooks;
  });
  test('reading an existing owner preserves its live records without inspecting DOM connectedness',()=>{
    const owner=hooks.getSession(`${type}-read-owner`,{create:true});
    const root=document.createElement('div');document.body.appendChild(root);
    const connected=jest.fn(()=>true);Object.defineProperty(root,'isConnected',{get:connected});
    owner.root=root;owner.refs.root=root;
    const refs=owner.refs,state=owner.state,draw=owner.timers.drawRuntime,cache=owner.cache.renderRuntime;
    draw.token=173;
    for(let index=0;index<20;index+=1) expect(hooks.getSession(owner.tabId,{create:false})).toBe(owner);
    expect(connected).not.toHaveBeenCalled();
    expect(owner.refs).toBe(refs);
    expect(owner.state).toBe(state);
    expect(owner.timers.drawRuntime).toBe(draw);
    expect(owner.cache.renderRuntime).toBe(cache);
    expect(draw.token).toBe(173);
  });
  test('created owners have component-local records and independent mutable storage',()=>{
    const a=hooks.getSession(`${type}-A`,{create:true}),b=hooks.getSession(`${type}-B`,{create:true});
    for(const key of ['state','refs','cache','timers','managers']){
      expect(a[key]).toEqual(expect.any(Object));
      expect(a[key]).not.toBe(b[key]);
    }
    expect(a.cache.renderRuntime).not.toBe(b.cache.renderRuntime);
    expect(a.timers.drawRuntime).not.toBe(b.timers.drawRuntime);
    a.timers.drawRuntime.token=53;
    expect(hooks.getSession(b.tabId,{create:false}).timers.drawRuntime.token).not.toBe(53);
    expect(a.managers).not.toHaveProperty('fileHandle');
  });
});
