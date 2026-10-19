"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const Core = require("../src/core.js");
const Storage = require("../src/storage.js");
const Integrations = require("../src/integrations.js");
test("default services use the existing local storage and disable future providers", () => {
  const services = Integrations.createIntegrationServices({
    storage: Storage
  });
  assert.equal(Integrations.CONTRACT_VERSION, 1);
  assert.equal(services.storage, Storage);
  assert.equal(services.accounts, null);
  assert.equal(services.projectSharing, null);
  assert.equal(Object.isFrozen(services), true);
  assert.equal(Object.isFrozen(Integrations), true);
  const model = Core.sampleModel("2026-10-17");
  assert.equal(services.storage.save(model).ok, true);
  const loaded = services.storage.load().model;
  const roundTrip = services.storage.importJSON(services.storage.exportJSON(loaded));
  assert.deepEqual(roundTrip, Core.validateModel(model));
});
test("composition validates providers without calling them or freezing their state", () => {
  const calls = [];
  const accounts = {
    state: "idle",
    async getSession() {
      calls.push("session");
      return null;
    },
    async signIn(input) {
      calls.push(input);
    },
    async signOut() {
      calls.push("sign-out");
    }
  };
  const projectSharing = {
    async getProjectProgress(id) {
      calls.push(id);
    },
    async publishProjectProgress(id, progress) {
      calls.push([id, progress]);
    }
  };
  const services = Integrations.createIntegrationServices({
    storage: Storage,
    accounts,
    projectSharing
  });
  assert.deepEqual(calls, []);
  assert.equal(services.accounts, accounts);
  assert.equal(services.projectSharing, projectSharing);
  assert.equal(Object.isFrozen(accounts), false);
  accounts.state = "provider-owned";
  assert.equal(services.accounts.state, "provider-owned");
});
test("missing methods and malformed adapters fail without invoking other providers", () => {
  for (const storage of [undefined, null, [], {}, {
    load: true
  }]) {
    assert.throws(() => Integrations.createIntegrationServices({
      storage
    }), TypeError);
  }
  assert.throws(() => Integrations.createIntegrationServices(null), TypeError);
  assert.throws(() => Integrations.createIntegrationServices([]), TypeError);
  assert.throws(() => Integrations.createIntegrationServices({
    storage: Storage,
    accounts: {
      getSession() {},
      signIn() {}
    }
  }), /signOut/);
  assert.throws(() => Integrations.createIntegrationServices({
    storage: Storage,
    projectSharing: {
      getProjectProgress() {},
      publishProjectProgress: "not a method"
    }
  }), /publishProjectProgress/);
  const disabled = Integrations.createIntegrationServices({
    storage: Storage,
    accounts: undefined,
    projectSharing: null
  });
  assert.equal(disabled.accounts, null);
  assert.equal(disabled.projectSharing, null);
});
test("browser module registration and adapter composition perform no network or provider calls", () => {
  let networkCalls = 0;
  const context = vm.createContext({
    fetch() {
      networkCalls++;
      throw new Error("Network must remain inactive");
    },
    XMLHttpRequest: function () {
      networkCalls++;
      throw new Error("Network must remain inactive");
    }
  });
  const source = fs.readFileSync(path.join(__dirname, "../src/integrations.js"), "utf8");
  vm.runInContext(source, context);
  vm.runInContext(`
    var providerCalls = 0;
    var inert = () => { providerCalls++; throw new Error('Unexpected provider call'); };
    var store = {load:inert, save:inert, exportJSON:inert, importJSON:inert};
    var account = {getSession:inert, signIn:inert, signOut:inert};
    var sharing = {getProjectProgress:inert, publishProjectProgress:inert};
    var services = ThreeThingsIntegrations.createIntegrationServices({storage:store,accounts:account,projectSharing:sharing});
  `, context);
  assert.equal(vm.runInContext("providerCalls", context), 0);
  assert.equal(vm.runInContext("ThreeThingsIntegrations.CONTRACT_VERSION", context), 1);
  assert.equal(networkCalls, 0);
});
test("each service container is independent and retains adapter method binding", () => {
  const adapter = {
    value: "local model",
    load() {
      return this.value;
    },
    save(model) {
      this.value = model;
      return {
        ok: true,
        persistent: false
      };
    },
    exportJSON(model) {
      return JSON.stringify(model);
    },
    importJSON(text) {
      return JSON.parse(text);
    }
  };
  const first = Integrations.createIntegrationServices({
    storage: adapter
  });
  const second = Integrations.createIntegrationServices({
    storage: Storage
  });
  assert.equal(first.storage.load(), "local model");
  assert.equal(first.storage.save("updated").ok, true);
  assert.equal(first.storage.load(), "updated");
  assert.notEqual(first.storage, second.storage);
  assert.equal(second.accounts, null);
});
