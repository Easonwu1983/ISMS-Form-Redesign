(function () {
  window.createServiceRegistryModule = function createServiceRegistryModule() {
    function getBootstrapState() {
      if (typeof window === 'undefined') {
        return {
          services: Object.create(null),
          steps: [],
          record: function () {}
        };
      }
      const existing = window.__ISMS_BOOTSTRAP__;
      if (existing && typeof existing === 'object') return existing;
      const created = {
        services: Object.create(null),
        steps: [],
        record: function record(step, detail) {
          const safeStep = String(step || '').trim();
          if (!safeStep) return;
          const entry = {
            step: safeStep,
            detail: detail == null ? '' : String(detail),
            at: new Date().toISOString()
          };
          this.steps.push(entry);
          while (this.steps.length > 50) this.steps.shift();
          console.info('[ISMS:bootstrap]', safeStep, entry.detail || '');
        }
      };
      window.__ISMS_BOOTSTRAP__ = created;
      return created;
    }

    const bootstrap = getBootstrapState();
    const serviceEntries = Object.create(null);

    function record(step, detail) {
      bootstrap.record(step, detail);
    }

    function register(name, resolver, options) {
      const safeName = String(name || '').trim();
      if (!safeName || typeof resolver !== 'function') return;
      const entry = serviceEntries[safeName] || {};
      entry.name = safeName;
      entry.resolver = resolver;
      serviceEntries[safeName] = entry;
      bootstrap.services[safeName] = resolver;
      const aliases = options && Array.isArray(options.aliases) ? options.aliases : [];
      aliases.forEach(function (alias) {
        const safeAlias = String(alias || '').trim();
        if (!safeAlias) return;
        bootstrap.services[safeAlias] = resolver;
      });
    }

    function resolve(name, options) {
      const safeName = String(name || '').trim();
      if (!safeName) throw new Error('service name is required');
      const entry = serviceEntries[safeName] || { name: safeName, value: null, resolver: null };
      serviceEntries[safeName] = entry;
      if (entry.value) return entry.value;
      const factory = options && options.factory;
      if (typeof factory !== 'function') {
        throw new Error('service factory missing for ' + safeName);
      }
      const value = factory();
      entry.value = value;
      const resolver = options && typeof options.resolver === 'function'
        ? options.resolver
        : function () { return entry.value; };
      entry.resolver = resolver;
      register(safeName, resolver, options);
      const globalSlot = options && String(options.globalSlot || '').trim();
      if (globalSlot && typeof window !== 'undefined') {
        window[globalSlot] = value;
      }
      const globalGetter = options && String(options.globalGetter || '').trim();
      if (globalGetter && typeof window !== 'undefined') {
        window[globalGetter] = resolver;
      }
      const readyStep = options && String(options.readyStep || '').trim();
      if (readyStep) record(readyStep, options && options.readyDetail ? options.readyDetail : 'created');
      return value;
    }

    function invalidate(names) {
      const list = Array.isArray(names) ? names : [names];
      list.forEach(function (name) {
        const safeName = String(name || '').trim();
        if (!safeName) return;
        const entry = serviceEntries[safeName];
        if (entry) entry.value = null;
      });
    }

    return {
      getBootstrapState: getBootstrapState,
      record: record,
      register: register,
      resolve: resolve,
      invalidate: invalidate
    };
  };
})();
