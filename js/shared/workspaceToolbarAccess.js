(function(global){
  'use strict';

  const Shared = global.Shared = global.Shared || {};

  function requireWorkspaceToolbarModule(modulePath){
    if(typeof require !== 'function' || !modulePath){
      return;
    }
    try{
      require(modulePath);
    }catch(err){}
  }

  Shared.getWorkspaceToolbarApi = function getWorkspaceToolbarApi(){
    const toolbarApi = Shared.workspaceToolbar || {};
    if(typeof toolbarApi.createSubPanel === 'function'){
      return toolbarApi;
    }
    requireWorkspaceToolbarModule('./workspaceToolbar.js');
    return Shared.workspaceToolbar || {};
  };
})(typeof window !== 'undefined' ? window : globalThis);
