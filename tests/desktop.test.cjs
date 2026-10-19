'use strict';

// Contract tests for the optional host. These do not install or run Electron.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {
  EventEmitter
} = require('node:events');
const desktopDirectory = path.join(__dirname, '..', 'desktop');
async function createHost(singleInstance = true) {
  const state = {
    windows: [],
    reads: [],
    paths: {},
    quit: 0
  };
  const app = new EventEmitter();
  Object.assign(app, {
    setName: name => {
      state.name = name;
    },
    setAppUserModelId: id => {
      state.appId = id;
    },
    getPath: () => path.join(__dirname, 'mock-app-data'),
    setPath: (name, value) => {
      state.paths[name] = value;
    },
    requestSingleInstanceLock: () => singleInstance,
    whenReady: () => Promise.resolve(),
    quit: () => {
      state.quit += 1;
    }
  });
  class MockWindow extends EventEmitter {
    constructor(options) {
      super();
      this.options = options;
      this.webContents = new EventEmitter();
      this.webContents.setWindowOpenHandler = handler => {
        this.openWindow = handler;
      };
      state.windows.push(this);
    }
    loadURL(url) {
      this.url = url;
      return Promise.resolve();
    }
    isMinimized() {
      return true;
    }
    restore() {
      this.restored = true;
    }
    focus() {
      this.focused = true;
    }
  }
  const electron = {
    app,
    BrowserWindow: MockWindow,
    Menu: {
      setApplicationMenu: value => {
        state.menu = value;
      }
    },
    protocol: {
      registerSchemesAsPrivileged: value => {
        state.schemes = JSON.parse(JSON.stringify(value));
      },
      handle: (scheme, handler) => {
        state.protocol = handler;
        state.scheme = scheme;
      }
    },
    session: {
      defaultSession: {
        setPermissionRequestHandler: handler => {
          state.permissionRequest = handler;
        },
        setPermissionCheckHandler: handler => {
          state.permissionCheck = handler;
        }
      }
    }
  };
  const mockFs = {
    mkdirSync: () => {},
    promises: {
      readFile: async filename => {
        state.reads.push(filename);
        return Buffer.from('<html>same frontend</html>');
      }
    }
  };
  vm.runInNewContext(fs.readFileSync(path.join(desktopDirectory, 'main.cjs'), 'utf8'), {
    require: name => name === 'electron' ? electron : name === 'node:fs' ? mockFs : require(name),
    __dirname: desktopDirectory,
    process: { argv: [], env: {} },
    Response,
    console
  });
  await new Promise(resolve => setImmediate(resolve));
  return {
    state,
    app
  };
}
test('the desktop host only serves its single bundled page', async () => {
  const {
    state
  } = await createHost();
  const response = await state.protocol({
    method: 'GET',
    url: 'three-things://app/index.html'
  });
  assert.equal(response.status, 200);
  assert.equal(await response.text(), '<html>same frontend</html>');
  assert.equal(state.reads[0], path.join(desktopDirectory, 'app', 'index.html'));
  for (const request of [{
    method: 'GET',
    url: 'three-things://app/../../private.txt'
  }, {
    method: 'GET',
    url: 'three-things://other/index.html'
  }, {
    method: 'POST',
    url: 'three-things://app/index.html'
  }]) assert.equal((await state.protocol(request)).status, 404);
  assert.equal(state.reads.length, 1);
});
test('the host isolates renderer privileges and denies external windows and navigation', async () => {
  const {
    state
  } = await createHost();
  const window = state.windows[0];
  const preferences = window.options.webPreferences;
  assert.equal(preferences.sandbox, true);
  assert.equal(preferences.contextIsolation, true);
  assert.equal(preferences.nodeIntegration, false);
  assert.equal(preferences.webSecurity, true);
  assert.equal(preferences.webviewTag, false);
  assert.equal(preferences.preload, undefined);
  assert.equal(window.openWindow().action, 'deny');
  assert.deepEqual(state.schemes[0].privileges, {
    standard: true,
    secure: true
  });
  let blocked = false;
  window.webContents.emit('will-navigate', {
    preventDefault: () => {
      blocked = true;
    }
  }, 'https://example.invalid');
  assert.equal(blocked, true);
  assert.equal(state.permissionCheck(), false);
  let permission;
  state.permissionRequest(null, 'camera', allowed => {
    permission = allowed;
  });
  assert.equal(permission, false);
});
test('the host keeps a stable profile and focuses the first instance', async () => {
  const {
    state,
    app
  } = await createHost();
  assert.equal(state.name, 'ThreeThings');
  assert.equal(state.paths.userData, state.paths.sessionData);
  assert.equal(path.basename(state.paths.userData), 'ThreeThings');
  app.emit('second-instance');
  assert.equal(state.windows[0].restored, true);
  assert.equal(state.windows[0].focused, true);
  const second = await createHost(false);
  assert.equal(second.state.windows.length, 0);
  assert.equal(second.state.quit, 1);
});
