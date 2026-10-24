'use strict';

const {installProductionTestEventTracker}=require('./productionTestLifecycle');
const {inspectIntegrationTeardown}=require('./integrationTeardown');
const LIFETIME_KEY='__GRAPHITIX_TEST_FIXTURE_LIFETIME__';

function installProductionFixtureLifetime(target=window){
  if(target[LIFETIME_KEY]) throw new Error('A production fixture is already running on this window.');
  const events=installProductionTestEventTracker({window:target,document:target.document});
  const contexts=[target];
  if(globalThis!==target && globalThis.document===target.document) contexts.push(globalThis);
  const observers=new Set(),timers=new Map(),frames=new Map(),replacements=[];
  const replace=(context,key,wrapper)=>{
    replacements.push({context,key,original:context[key],wrapper});context[key]=wrapper;
  };
  for(const context of contexts){
    for(const key of ['MutationObserver','ResizeObserver']){
      const Native=context[key];
      if(typeof Native!=='function') continue;
      replace(context,key,class OwnedObserver extends Native{
        constructor(...args){super(...args);observers.add(this);}
        observe(...args){observers.add(this);return super.observe(...args);}
        disconnect(){super.disconnect();observers.delete(this);}
      });
    }
    for(const [scheduleKey,cancelKey,repeated] of [['setTimeout','clearTimeout',false],['setInterval','clearInterval',true]]){
      const schedule=context[scheduleKey],cancel=context[cancelKey];
      if(typeof schedule!=='function' || typeof cancel!=='function') continue;
      replace(context,scheduleKey,function(callback,delay,...args){
        let handle;
        handle=schedule.call(context,function(...values){
          if(!repeated) timers.delete(handle);
          return callback.apply(this,values);
        },delay,...args);
        timers.set(handle,()=>cancel.call(context,handle));return handle;
      });
      replace(context,cancelKey,function(handle){timers.delete(handle);return cancel.call(context,handle);});
    }
    const schedule=context.requestAnimationFrame,cancel=context.cancelAnimationFrame;
    if(typeof schedule==='function' && typeof cancel==='function'){
      replace(context,'requestAnimationFrame',function(callback){
        let handle;
        handle=schedule.call(context,function(time){frames.delete(handle);return callback.call(this,time);});
        frames.set(handle,()=>cancel.call(context,handle));return handle;
      });
      replace(context,'cancelAnimationFrame',function(handle){frames.delete(handle);return cancel.call(context,handle);});
    }
  }
  let disposedReport=null;
  const lifetime={
    snapshot:()=>({observers:observers.size,timers:timers.size,frames:frames.size,listeners:events.snapshot()}),
    dispose(){
      if(disposedReport) return disposedReport;
      // Inspect/dispose owners while their namespaces are still available.
      const report=inspectIntegrationTeardown(target,events);
      observers.forEach(observer=>observer.disconnect());
      frames.forEach(cancel=>cancel());timers.forEach(cancel=>cancel());
      frames.clear();timers.clear();events.restore();
      replacements.reverse().forEach(({context,key,original,wrapper})=>{if(context[key]===wrapper) context[key]=original;});
      delete target[LIFETIME_KEY];
      disposedReport={...report,resourcesAfter:lifetime.snapshot()};
      target.__GRAPHITIX_TEST_FIXTURE_TEARDOWN__=disposedReport;
      return disposedReport;
    }
  };
  target[LIFETIME_KEY]=lifetime;return lifetime;
}

module.exports={installProductionFixtureLifetime};
