const {installProductionFixtureLifetime}=require('../../test-support/productionFixtureLifetime');

describe('Production bootstrap fixture lifetime',()=>{
  let lifetime;
  beforeEach(()=>{jest.useFakeTimers();window.Main={};window.Components={};});
  afterEach(()=>{lifetime?.dispose();lifetime=null;jest.useRealTimers();});
  test('retirement cancels owned work and restores listener/observer APIs',()=>{
    const Observer=window.MutationObserver,add=window.addEventListener,callback=jest.fn();
    lifetime=installProductionFixtureLifetime(window);
    const observer=new window.MutationObserver(callback);observer.observe(document.body,{childList:true});
    window.addEventListener('fixture-test',callback);
    window.setTimeout(callback,100);window.setInterval(callback,100);window.requestAnimationFrame(callback);
    expect(lifetime.snapshot().observers).toBe(1);
    expect(lifetime.snapshot().timers).toBeGreaterThanOrEqual(2);
    const report=lifetime.dispose();
    expect(report.resourcesAfter).toEqual({observers:0,timers:0,frames:0,listeners:[]});
    expect(window.MutationObserver).toBe(Observer);expect(window.addEventListener).toBe(add);
    jest.advanceTimersByTime(1000);window.dispatchEvent(new window.Event('fixture-test'));
    expect(callback).not.toHaveBeenCalled();
  });
  test('completed work is released and a retired fixture cannot retire its successor',()=>{
    lifetime=installProductionFixtureLifetime(window);
    const callback=jest.fn();window.setTimeout(callback,10);jest.advanceTimersByTime(10);
    expect(callback).toHaveBeenCalledTimes(1);expect(lifetime.snapshot().timers).toBe(0);
    const previous=lifetime,report=previous.dispose();
    lifetime=installProductionFixtureLifetime(window);
    expect(previous.dispose()).toBe(report);
    expect(window.__GRAPHITIX_TEST_FIXTURE_LIFETIME__).toBe(lifetime);
  });
  test('scheduled callbacks retain the native receiver and timer arguments',()=>{
    const scheduled=[],frames=[],receiver={nativeCallbackOwner:true};
    const schedule=jest.spyOn(window,'setTimeout').mockImplementation((callback,delay,...args)=>{
      scheduled.push({callback,args});return scheduled.length;
    });
    const frameSchedule=jest.spyOn(window,'requestAnimationFrame').mockImplementation(callback=>{
      frames.push(callback);return frames.length;
    });
    lifetime=installProductionFixtureLifetime(window);
    const callback=jest.fn();window.setTimeout(callback,10,'first','second');
    scheduled[0].callback.apply(receiver,scheduled[0].args);
    expect(callback).toHaveBeenCalledWith('first','second');
    expect(callback.mock.contexts[0]).toBe(receiver);
    const frameCallback=jest.fn();window.requestAnimationFrame(frameCallback);
    frames[0].call(receiver,71);
    expect(frameCallback).toHaveBeenCalledWith(71);
    expect(frameCallback.mock.contexts[0]).toBe(receiver);
    expect(lifetime.snapshot().frames).toBe(0);
    lifetime.dispose();schedule.mockRestore();frameSchedule.mockRestore();
  });
  test('retirement evidence survives namespace deletion',()=>{
    window.Main={session:{workspaceState:{tabs:[{id:'owner-a',type:'box'}]},disposeWorkspaceTabResources:()=>false}};
    lifetime=installProductionFixtureLifetime(window);
    const report=lifetime.dispose();
    delete window.Main;delete window.Components;
    expect(window.__GRAPHITIX_TEST_FIXTURE_TEARDOWN__).toBe(report);
    expect(report.disposalFailures).toEqual([{tabId:'owner-a',type:'box',reason:'tab-disposer-reported-not-disposed'}]);
    // This test deliberately creates a failed retirement; the assertion above
    // consumes its evidence before the global fixture guard runs.
    delete window.__GRAPHITIX_TEST_FIXTURE_TEARDOWN__;
  });
});
