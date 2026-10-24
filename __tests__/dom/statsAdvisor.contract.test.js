describe('statistics advisor projection and Apply contract', () => {
  let host, advisor, active, read, commit, refresh;
  beforeEach(() => {
    jest.resetModules();
    window.Shared = {};
    require('../../js/shared/statsAdvisor.js');
    document.body.innerHTML='<div id="advisor-host"></div>';
    host=document.getElementById('advisor-host');
    advisor={open:true,answers:{model:'linear'}};
    active=true;
    read=jest.fn(()=>({available:true}));
    commit=jest.fn();
    refresh=jest.fn();
  });
  function mount(tabId='a',disabled=false){
    const state=advisor;
    const view=window.Shared.statsAdvisor.begin({host,component:'test',tabId,advisor:state,getAdvisor:()=>advisor,isActive:()=>active});
    host.innerHTML='';
    const root=document.createElement('div');
    root.className='stats-advisor';
    root.innerHTML='<button class="stats-advisor__toggle">Hide advisor</button><div class="stats-advisor__summary"></div><div class="stats-advisor__questions"><input type="radio" name="model" value="linear"><input type="radio" name="model" value="curved"></div><div class="stats-advisor__actions"><button>Apply recommendation</button></div>';
    host.appendChild(root);
    root.querySelector('.stats-advisor__actions button').disabled=disabled;
    view.finish(root);
    return {view,root};
  }
  function apply(view){
    return view.apply({readContext:read,decide:(answers,context)=>({ready:context.available,settings:{...answers}}),commit,refresh});
  }
  test('does not apply on render and validates the current context when Apply runs',()=>{
    const {view}=mount();
    expect(commit).not.toHaveBeenCalled();
    read.mockReturnValue({available:false});
    expect(apply(view)).toBe(false);
    expect(refresh).toHaveBeenCalledWith({available:false});
    expect(commit).not.toHaveBeenCalled();
    advisor.answers.model='curved';
    read.mockReturnValue({available:true});
    expect(apply(view)).toBe(true);
    expect(commit).toHaveBeenCalledWith({ready:true,settings:{model:'curved'}},{available:true});
  });
  test.each(['inactive','hydrated','retired'])('rejects %s callbacks before reading data',mode=>{
    const {view}=mount();
    if(mode==='inactive'){ active=false; }
    if(mode==='hydrated'){ advisor={...advisor,answers:{...advisor.answers}}; }
    if(mode==='retired'){ mount(); }
    expect(apply(view)).toBe(false);
    expect(read).not.toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();
  });
  test('retains question focus through parent clearing, with owner-scoped radio names',()=>{
    const first=mount();
    first.root.querySelector('input[value=curved]').focus();
    window.Shared.statsAdvisor.captureFocus(host);
    host.innerHTML='';
    const second=mount();
    expect(document.activeElement).toBe(second.root.querySelector('input[value=curved]'));
    expect(document.activeElement.name).toBe('model-a');
    expect(second.root.querySelector('.stats-advisor__toggle').getAttribute('aria-controls')).toBe('test-advisor-a-body');
    expect(second.root.querySelector('.stats-advisor__summary').getAttribute('role')).toBe('status');
    expect(second.root.querySelector('.stats-advisor__scope-note').textContent).toMatch(/sample size.*power/i);
    const third=mount('b');
    expect(third.root.contains(document.activeElement)).toBe(false);
    expect(third.root.querySelector('input').name).toBe('model-b');
  });
  test.each([{ready:false},{ready:true,canApply:false},null])('keeps incomplete or unsupported plans blocked (%j)',plan=>{
    expect(window.Shared.statsAdvisor.canApply(plan)).toBe(false);
  });
  test('moves focus to the disclosure when a source change disables Apply',()=>{
    const first=mount();
    first.root.querySelector('.stats-advisor__actions button').focus();
    const next=mount('a',true);
    expect(document.activeElement).toBe(next.root.querySelector('.stats-advisor__toggle'));
  });
});
