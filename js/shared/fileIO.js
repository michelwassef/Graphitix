(function(global){
  'use strict';

  const Shared = global.Shared = global.Shared || {};
  const fileIO = Shared.fileIO = Shared.fileIO || {};
  const payloadBlobMap = new WeakMap();

  const DEFAULT_FILE_TYPES = [{description: 'Graph Files', accept: {'application/json': ['.graph']}}];

  function debug(label, details){
    console.debug(`Debug: fileIO.${label}`, details);
  }

  function ensureName(name, fallback){
    return name || fallback || 'graph.graph';
  }

  function resolveTypes(types){
    if(Array.isArray(types) && types.length){
      return types;
    }
    return DEFAULT_FILE_TYPES;
  }

  function registerPayloadBlob(blob, payload){
    if(!blob) return;
    payloadBlobMap.set(blob, { value: payload, hasValue: true });
  }

  function consumePayloadBlob(blob){
    if(!blob) return null;
    const entry = payloadBlobMap.get(blob);
    if(entry){
      payloadBlobMap.delete(blob);
      return entry;
    }
    return null;
  }

  fileIO.registerPayloadBlob = registerPayloadBlob;

  function ensureSetter(setter, value){
    if(typeof setter === 'function'){
      try{
        setter(value);
      }catch(err){
        console.error('fileIO.ensureSetter error', err);
      }
    }
  }

  function serializePayload(payload){
    try{
      return typeof payload === 'string' ? payload : JSON.stringify(payload);
    }catch(err){
      console.error('fileIO.serializePayload error', err);
      throw err;
    }
  }

  function resolvePayload(getPayload, provided){
    if(provided !== undefined){
      return Promise.resolve(provided);
    }
    if(typeof getPayload === 'function'){
      try{
        const value = getPayload();
        const isPromise = value && typeof value.then === 'function';
        debug('resolvePayload.invoke', { isPromise });
        return isPromise ? value : Promise.resolve(value);
      }catch(err){
        console.error('fileIO.resolvePayload error', err);
        return Promise.reject(err);
      }
    }
    return Promise.resolve(getPayload);
  }

  function downloadURL(url, name){
    const doc = global.document;
    if(!doc || !doc.body){
      console.warn('fileIO.downloadURL missing document body');
      return;
    }
    const a = doc.createElement('a');
    a.href = url;
    a.download = name;
    doc.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function writeToHandle(handle, payload, context){
    if(!handle || typeof handle.createWritable !== 'function'){
      console.warn('fileIO.writeToHandle invalid handle', { context });
      return;
    }
    const serialized = serializePayload(payload);
    debug('writeToHandle.start', { context, hasPayload: !!payload, length: serialized.length });
    const writable = await handle.createWritable();
    await writable.write(serialized);
    await writable.close();
    debug('writeToHandle.complete', { context, handleName: handle.name });
  }

  fileIO.downloadJSON = function downloadJSON(payload, name){
    const fileName = ensureName(name, 'graph.json');
    debug('downloadJSON.start', { fileName });
    try{
      const serialized = serializePayload(payload);
      const BlobCtor = global.Blob || Blob;
      const URLCtor = global.URL || URL;
      const blob = new BlobCtor([serialized], { type: 'application/json' });
      const url = URLCtor.createObjectURL(blob);
      downloadURL(url, fileName);
      global.setTimeout?.(()=>{
        URLCtor.revokeObjectURL(url);
        debug('downloadJSON.revoke', { fileName });
      }, 5000);
    }catch(err){
      console.error('fileIO.downloadJSON error', err);
    }
  };

  fileIO.verifyPermission = async function verifyPermission(handle, write){
    if(!handle || (typeof handle.queryPermission !== 'function' && typeof handle.requestPermission !== 'function')){
      debug('verifyPermission.skip', { write, hasHandle: !!handle });
      return false;
    }
    const opts = write ? { mode: 'readwrite' } : {};
    try{
      if(typeof handle.queryPermission === 'function'){
        const query = await handle.queryPermission(opts);
        debug('verifyPermission.query', { write, query });
        if(query === 'granted') return true;
      }
      if(typeof handle.requestPermission === 'function'){
        const request = await handle.requestPermission(opts);
        debug('verifyPermission.request', { write, request });
        return request === 'granted';
      }
    }catch(err){
      console.error('fileIO.verifyPermission error', err);
    }
    return false;
  };

  fileIO.saveGraphFile = async function saveGraphFile(options){
    const {
      context = 'graph',
      fileHandle,
      getPayload,
      payload,
      setFileHandle,
      setFileName,
      fileName,
      downloadFileName,
      fileTypes
    } = options || {};
    const targetName = ensureName(downloadFileName || fileName, `${context}.graph`);
    const data = await resolvePayload(getPayload, payload);
    debug('saveGraphFile.start', { context, hasHandle: !!fileHandle, targetName });
    if(fileHandle && typeof fileHandle.createWritable === 'function'){
      const permitted = await fileIO.verifyPermission(fileHandle, true);
      debug('saveGraphFile.permission', { context, permitted });
      if(permitted){
        await writeToHandle(fileHandle, data, context);
        ensureSetter(setFileHandle, fileHandle);
        if(fileHandle.name) ensureSetter(setFileName, fileHandle.name);
        return { status: 'saved', via: 'existingHandle', fileHandle, fileName: fileHandle.name, payload: data };
      }
    }
    if(global.showSaveFilePicker){
      debug('saveGraphFile.deferToSaveAs', { context });
      return fileIO.saveGraphFileAs({
        context,
        getPayload,
        payload: data,
        setFileHandle,
        setFileName,
        fileName: targetName,
        downloadFileName: targetName,
        fileTypes,
        skipPayloadBuild: true
      });
    }
    debug('saveGraphFile.downloadFallback', { context });
    fileIO.downloadJSON(data, targetName);
    return { status: 'downloaded', via: 'download', fileName: targetName, payload: data };
  };

  fileIO.saveGraphFileAs = async function saveGraphFileAs(options){
    const {
      context = 'graph',
      getPayload,
      payload,
      setFileHandle,
      setFileName,
      fileName,
      downloadFileName,
      fileTypes,
      skipPayloadBuild
    } = options || {};
    const targetName = ensureName(downloadFileName || fileName, `${context}.graph`);
    const data = skipPayloadBuild ? payload : await resolvePayload(getPayload, payload);
    debug('saveGraphFileAs.start', { context, targetName, hasPicker: !!global.showSaveFilePicker });
    if(global.showSaveFilePicker){
      try{
        const handle = await global.showSaveFilePicker({
          types: resolveTypes(fileTypes),
          suggestedName: targetName
        });
        await writeToHandle(handle, data, context);
        ensureSetter(setFileHandle, handle);
        if(handle?.name) ensureSetter(setFileName, handle.name);
        return { status: 'saved', via: 'picker', fileHandle: handle, fileName: handle.name, payload: data };
      }catch(err){
        console.error('fileIO.saveGraphFileAs error', { context, err });
        return { status: 'error', via: 'picker', error: err };
      }
    }
    debug('saveGraphFileAs.downloadFallback', { context });
    fileIO.downloadJSON(data, targetName);
    return { status: 'downloaded', via: 'download', fileName: targetName, payload: data };
  };

  fileIO.openGraphFile = async function openGraphFile(options){
    const {
      context = 'graph',
      setFileHandle,
      setFileName,
      loadFromFile,
      triggerInput,
      fileTypes
    } = options || {};
    debug('openGraphFile.start', { context, hasPicker: !!global.showOpenFilePicker });
    if(global.showOpenFilePicker){
      try{
        const handles = await global.showOpenFilePicker({
          types: resolveTypes(fileTypes),
          multiple: false
        });
        const handle = handles && handles[0];
        if(!handle){
          debug('openGraphFile.cancelled', { context });
          return { status: 'cancelled', via: 'picker' };
        }
        const file = await handle.getFile();
        ensureSetter(setFileHandle, handle);
        if(file?.name) ensureSetter(setFileName, file.name);
        if(typeof loadFromFile === 'function'){
          await loadFromFile(file);
        }
        return { status: 'opened', via: 'picker', fileHandle: handle, file };
      }catch(err){
        console.error('fileIO.openGraphFile error', { context, err });
        return { status: 'error', via: 'picker', error: err };
      }
    }
    if(typeof triggerInput === 'function'){
      debug('openGraphFile.triggerInput', { context });
      try{
        triggerInput();
        return { status: 'pending', via: 'input' };
      }catch(err){
        console.error('fileIO.openGraphFile trigger error', { context, err });
        return { status: 'error', via: 'input', error: err };
      }
    }
    console.warn('fileIO.openGraphFile no picker or trigger', { context });
    return { status: 'error', via: 'none', error: new Error('No file picker or trigger available') };
  };

  (function installPayloadAwareReader(){
    const Reader = global.FileReader;
    if(!Reader || Reader.prototype?.__vennPayloadPatch){
      return;
    }
    const originalReadAsText = Reader.prototype.readAsText;
    if(typeof originalReadAsText !== 'function'){
      return;
    }
    Reader.prototype.readAsText = function patchedReadAsText(blob, encoding){
      const entry = consumePayloadBlob(blob);
      if(entry){
        let serialized = '';
        try{
          serialized = typeof entry.value === 'string' ? entry.value : JSON.stringify(entry.value);
        }catch(err){
          console.error('fileIO.payloadReader serialization error', err);
        }
        this.result = serialized;
        debug('payloadReader.apply', { length: serialized.length });
        try{
          if(typeof this.onload === 'function'){
            this.onload({ target: this });
          }
        }catch(handlerErr){
          console.error('fileIO.payloadReader onload error', handlerErr);
        }
        return;
      }
      return originalReadAsText.call(this, blob, encoding);
    };
    Object.defineProperty(Reader.prototype, '__vennPayloadPatch', {
      value: true,
      configurable: false,
      enumerable: false,
      writable: false
    });
    debug('payloadReader.installed', { patched: true });
  })();

  // Expose helpers for legacy callers expecting globals
  global.downloadJSON = fileIO.downloadJSON;
  global.verifyPermission = fileIO.verifyPermission;
})(window);

