(function(global){
  'use strict';

  const Shared = global.Shared = global.Shared || {};

  Shared.getWorkspaceToolbarApi = function getWorkspaceToolbarApi(){
    const toolbarApi = Shared.workspaceToolbar || {};
    if(typeof toolbarApi.createSubPanel === 'function'){
      return toolbarApi;
    }
    if(typeof require === 'function'){
      try{
        require('./workspaceToolbar.js');
      }catch(err){}
    }
    return Shared.workspaceToolbar || {};
  };
})(typeof window !== 'undefined' ? window : globalThis);
