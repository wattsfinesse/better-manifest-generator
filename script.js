(() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const uid = () => (crypto?.randomUUID?.() || 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  }));

  const deepClone = value => JSON.parse(JSON.stringify(value));
  const isUuid = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || '').trim());
  const isSemver = value => /^\d+\.\d+\.\d+$/.test(String(value || '').trim());
  const normalizeSemverText = value => {
    const text = String(value || '').trim();
    if (!text) return '0.0.0';
    if (isSemver(text)) return text;
    const parts = text.split('.').map(part => part.trim()).filter(Boolean);
    if (parts.length === 3 && parts.every(part => /^\d+$/.test(part))) return parts.join('.');
    return '0.0.0';
  };
  const semverToArray = value => normalizeSemverText(value).split('.').map(Number);

  const escapeHtml = value => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

  const downloadText = (text, filename) => {
    const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const SCRIPT_MODULES = [
    { value: '@minecraft/server', label: '@minecraft/server' },
    { value: '@minecraft/server-ui', label: '@minecraft/server-ui' },
    { value: '@minecraft/common', label: '@minecraft/common' },
    { value: '@minecraft/server-gametest', label: '@minecraft/server-gametest' },
    { value: '@minecraft/diagnostics', label: '@minecraft/diagnostics' },
    { value: '@minecraft/server-admin', label: '@minecraft/server-admin' },
    { value: '@minecraft/server-net', label: '@minecraft/server-net' },
  ];

  const MODULE_TYPES = {
    behavior: ['data', 'script'],
    resource: ['resources'],
    both: ['data', 'script', 'resources'],
    world: ['world_template', 'script'],
    skin: ['skin_pack'],
  };

  const CAPABILITY_SUPPORT = {
    behavior: ['chemistry', 'editorExtension', 'script_eval'],
    resource: ['raytraced', 'pbr'],
    both: ['chemistry', 'editorExtension', 'script_eval', 'raytraced', 'pbr'],
    world: ['chemistry', 'editorExtension', 'script_eval'],
    skin: [],
  };

  const DEFAULTS = {
    headerUuid: uid(),
    packName: 'My Pack',
    packDescription: 'Generated with watts',
    packVersion: '1.0.0',
    minEngineVersion: '1.20.0',
    baseGameVersion: '1.20.0',
    authors: 'Author1, Author2',
    license: 'MIT',
    url: '',
    productType: '',
    packScope: '',
    allowRandomSeed: true,
    lockTemplateOptions: false,
  };

  const state = {
    manifestVersion: 'v2',
    packRole: 'behavior',
    versionFormat: 'array',
    engineFormat: 'array',
    form: { ...DEFAULTS },
    modules: [],
    dependencies: [],
    subpacks: [],
    settings: [],
    capabilities: {
      chemistry: false,
      editorExtension: false,
      script_eval: false,
      raytraced: false,
      pbr: false,
    },
    outputs: [],
    activeOutputIndex: 0,
  };

  const dom = {
    versionButtons: $('#versionButtons'),
    packButtons: $('#packButtons'),
    modePills: $('#modePills'),
    modeStatus: $('#modeStatus'),
    packNote: $('#packNote'),
    packVersionHint: $('#packVersionHint'),
    engineVersionHint: $('#engineVersionHint'),
    worldOptions: $('#worldOptions'),
    modules: $('#modules'),
    dependencies: $('#dependencies'),
    subpacks: $('#subpacks'),
    settings: $('#settings'),
    capabilities: $('#capabilities'),
    outputGrid: $('#outputGrid'),
    validationStatus: $('#validationStatus'),
  };

  const staticFields = {
    packName: $('#packName'),
    packDescription: $('#packDescription'),
    headerUuid: $('#headerUuid'),
    packScope: $('#packScope'),
    packVersion: $('#packVersion'),
    minEngineVersion: $('#minEngineVersion'),
    baseGameVersion: $('#baseGameVersion'),
    allowRandomSeed: $('#allowRandomSeed'),
    lockTemplateOptions: $('#lockTemplateOptions'),
    authors: $('#authors'),
    license: $('#license'),
    url: $('#url'),
    productType: $('#productType'),
  };

  let renderQueued = false;
  let pending = { static: true, lists: true, preview: true };

  const scheduleRender = (flags = {}) => {
    pending.static = pending.static || !!flags.static;
    pending.lists = pending.lists || !!flags.lists;
    pending.preview = pending.preview || !!flags.preview;
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => {
      renderQueued = false;
      const flagsNow = pending;
      pending = { static: false, lists: false, preview: false };
      if (flagsNow.static) renderStatic();
      if (flagsNow.lists) renderLists();
      if (flagsNow.preview) renderOutputs();
    });
  };

  const currentVersionMode = () => (state.manifestVersion === 'v3' ? 'string' : state.versionFormat);
  const currentEngineMode = () => (state.manifestVersion === 'v3' ? 'string' : state.engineFormat);
  const moduleOptionsForRole = role => MODULE_TYPES[role] || MODULE_TYPES.behavior;
  const capabilitySupportForRole = role => CAPABILITY_SUPPORT[role] || [];
  const defaultModuleTypeForRole = role => moduleOptionsForRole(role)[0] || 'data';

  const parseCsv = text => String(text || '')
    .split(',')
    .map(entry => entry.trim())
    .filter(Boolean);

  const versionToText = value => Array.isArray(value) ? value.join('.') : (value ? String(value) : '');
  const exportVersion = (value, mode) => {
    const text = normalizeSemverText(value);
    return mode === 'string' ? text : semverToArray(text);
  };

  function uidFromSeed(seed, suffix) {
    const hex = [...String(seed) + ':' + suffix].reduce((acc, ch) => {
      acc = ((acc << 5) - acc + ch.charCodeAt(0)) >>> 0;
      return acc;
    }, 0);
    const base = `${seed}:${suffix}:${hex}:${uid()}`.replace(/[^a-f0-9]/gi, '').padEnd(32, '0').slice(0, 32);
    return `${base.slice(0, 8)}-${base.slice(8, 12)}-${base.slice(12, 16)}-${base.slice(16, 20)}-${base.slice(20, 32)}`;
  }

  const setForm = patch => {
    Object.assign(state.form, patch);
    scheduleRender({ preview: true });
  };

  const syncStaticInputs = () => {
    staticFields.packName.value = state.form.packName;
    staticFields.packDescription.value = state.form.packDescription;
    staticFields.headerUuid.value = state.form.headerUuid;
    staticFields.packScope.value = state.form.packScope;
    staticFields.packVersion.value = state.form.packVersion;
    staticFields.minEngineVersion.value = state.form.minEngineVersion;
    staticFields.baseGameVersion.value = state.form.baseGameVersion;
    staticFields.allowRandomSeed.checked = !!state.form.allowRandomSeed;
    staticFields.lockTemplateOptions.checked = !!state.form.lockTemplateOptions;
    staticFields.authors.value = state.form.authors;
    staticFields.license.value = state.form.license;
    staticFields.url.value = state.form.url;
    staticFields.productType.value = state.form.productType;
  };

  const syncStaticControls = () => {
    dom.versionButtons.innerHTML = [
      ['v2', 'V2 (Stable)'],
      ['v3', 'V3 (Preview)'],
    ].map(([id, label]) => `<button class="pill ${state.manifestVersion === id ? 'active' : ''}" data-version="${id}">${label}</button>`).join('');

    dom.packButtons.innerHTML = [
      ['behavior', 'Behavior Pack'],
      ['resource', 'Resource Pack'],
      ['both', 'Add-Ons (Both)'],
      ['world', 'World Template'],
      ['skin', 'Skin Pack'],
    ].map(([id, label]) => `<button class="pill ${state.packRole === id ? 'active' : ''}" data-pack="${id}">${label}</button>`).join('');

    dom.modePills.innerHTML = '';
    [
      ['Manifest', state.manifestVersion.toUpperCase()],
      ['Pack', state.packRole],
      ['Versions', currentVersionMode()],
      ['Engine', currentEngineMode()],
    ].forEach(([label, value]) => {
      const chip = document.createElement('span');
      chip.className = 'chip blue';
      chip.textContent = `${label}: ${value}`;
      dom.modePills.appendChild(chip);
    });

    dom.modeStatus.textContent =
      state.packRole === 'both'
        ? 'Add-ons mode generates separate behavior and resource manifests.'
        : state.packRole === 'world'
          ? 'World template mode enables template-only header fields.'
          : state.packRole === 'skin'
            ? 'Skin pack mode uses a Skin Pack manifest structure.'
            : 'Standard pack mode.';

    dom.packNote.textContent = state.manifestVersion === 'v3'
      ? 'V3 uses string versions only and enables custom settings output.'
      : 'V2 can emit either SemVer arrays or strings depending on the format controls.';

    dom.packVersionHint.textContent = currentVersionMode() === 'string'
      ? 'Output as a SemVer string like 1.0.0.'
      : 'Output as a SemVer array like [1, 0, 0].';

    dom.engineVersionHint.textContent = currentEngineMode() === 'string'
      ? 'V3 requires string engine versions.'
      : 'Output as a SemVer array like [1, 20, 0].';

    dom.worldOptions.classList.toggle('hidden', state.packRole !== 'world');

    $('#togglePackVersionFmt').disabled = state.manifestVersion === 'v3';
    $('#toggleEngineFmt').disabled = state.manifestVersion === 'v3';
    $('#packScope').disabled = !(state.packRole === 'resource' || state.packRole === 'both');

    dom.capabilities.innerHTML = [
      ['chemistry', 'Chemistry', 'Enable chemistry features.'],
      ['editorExtension', 'Editor Extension', 'Mark the pack as an editor extension.'],
      ['script_eval', 'Script Eval', 'Requires a script module.'],
      ['raytraced', 'Raytraced', 'Resource pack ray tracing support.'],
      ['pbr', 'PBR', 'Vibrant visual / PBR support.'],
    ].map(([key, title, description]) => `
      <label class="check">
        <input type="checkbox" data-cap="${key}" ${state.capabilities[key] ? 'checked' : ''}>
        <span><strong>${title}</strong><br><span class="small-note">${description}</span></span>
      </label>
    `).join('');
  };

  const normalizeModulesForRole = () => {
    const allowed = new Set(moduleOptionsForRole(state.packRole));
    const seenTypes = new Set();
    state.modules = state.modules
      .map(module => ({
        id: module.id || uid(),
        type: allowed.has(module.type) ? module.type : defaultModuleTypeForRole(state.packRole),
        uuid: isUuid(module.uuid) ? module.uuid : uid(),
        version: normalizeSemverText(module.version),
        description: String(module.description || ''),
        entry: String(module.entry || ''),
      }))
      .filter(module => {
        if (!allowed.has(module.type) || seenTypes.has(module.type)) return false;
        seenTypes.add(module.type);
        return true;
      });

    const ensureModule = type => {
      if (!state.modules.some(module => module.type === type)) {
        state.modules.push({
          id: uid(),
          type,
          uuid: uid(),
          version: '1.0.0',
          description: '',
          entry: (type === 'script' || type === 'world_template') ? 'scripts/main.js' : '',
        });
      }
    };

    if (state.packRole === 'behavior') ensureModule('data');
    if (state.packRole === 'resource') ensureModule('resources');
    if (state.packRole === 'both') {
      ensureModule('data');
      ensureModule('resources');
    }
    if (state.packRole === 'world') ensureModule('world_template');
    if (state.packRole === 'skin') ensureModule('skin_pack');

    state.modules.forEach(module => {
      if (module.type === 'script' || module.type === 'world_template') {
        if (!module.entry) module.entry = 'scripts/main.js';
      } else {
        module.entry = '';
      }
    });
  };

  const normalizeDependencies = () => {
    state.dependencies = state.dependencies.map(dep => ({
      id: dep.id || uid(),
      kind: dep.kind === 'pack' ? 'pack' : 'native',
      module_name: SCRIPT_MODULES.some(script => script.value === dep.module_name) ? dep.module_name : '@minecraft/server',
      uuid: isUuid(dep.uuid) ? dep.uuid : uid(),
      version: normalizeSemverText(dep.version),
      description: String(dep.description || ''),
    }));
  };

  const normalizeSubpacks = () => {
    state.subpacks = state.subpacks.map(subpack => ({
      id: subpack.id || uid(),
      folder_name: String(subpack.folder_name || ''),
      name: String(subpack.name || ''),
      memory_performance_tier: Math.min(5, Math.max(1, Number(subpack.memory_performance_tier || 1) || 1)),
    }));
  };

  const normalizeSettings = () => {
    state.settings = state.settings.map(setting => {
      const type = ['slider', 'toggle', 'dropdown', 'label'].includes(setting.type) ? setting.type : 'slider';
      const options = Array.isArray(setting.options)
        ? setting.options
        : String(setting.options || '').split(',').map(part => part.trim()).filter(Boolean);

      return {
        id: setting.id || uid(),
        type,
        name: String(setting.name || ''),
        title: String(setting.title || ''),
        description: String(setting.description || ''),
        min: Number.isFinite(Number(setting.min)) ? Number(setting.min) : 0,
        max: Number.isFinite(Number(setting.max)) ? Number(setting.max) : 10,
        step: Number.isFinite(Number(setting.step)) ? Number(setting.step) : 1,
        default: Number.isFinite(Number(setting.default)) ? Number(setting.default) : 0,
        value: !!setting.value,
        options,
        defaultOption: String(setting.defaultOption || options[0] || ''),
      };
    });
  };

  const normalizeCapabilitiesForRole = () => {
    const allowed = new Set(capabilitySupportForRole(state.packRole));
    Object.keys(state.capabilities).forEach(key => {
      if (!allowed.has(key)) state.capabilities[key] = false;
    });
  };

  const ensurePresetState = () => {
    if (!state.form.headerUuid || !isUuid(state.form.headerUuid)) state.form.headerUuid = uid();
    if (!state.form.packVersion) state.form.packVersion = DEFAULTS.packVersion;
    if (!state.form.minEngineVersion) state.form.minEngineVersion = DEFAULTS.minEngineVersion;
    if (!state.form.baseGameVersion) state.form.baseGameVersion = DEFAULTS.baseGameVersion;
    normalizeModulesForRole();
    normalizeDependencies();
    normalizeSubpacks();
    normalizeSettings();
    normalizeCapabilitiesForRole();
  };

  const presetRole = role => {
    state.packRole = role;
    if (state.manifestVersion === 'v3') {
      state.versionFormat = 'string';
      state.engineFormat = 'string';
    }
    normalizeModulesForRole();
    normalizeDependencies();
    normalizeSubpacks();
    normalizeSettings();
    normalizeCapabilitiesForRole();
    scheduleRender({ static: true, lists: true, preview: true });
  };

  const setManifestVersion = version => {
    state.manifestVersion = version;
    if (version === 'v3') {
      state.versionFormat = 'string';
      state.engineFormat = 'string';
    }
    scheduleRender({ static: true, preview: true });
  };

  const buildBaseManifest = kind => {
    const headerUuid = state.form.headerUuid || uid();
    const resourceHeaderUuid = kind === 'resource' && state.packRole === 'both'
      ? uidFromSeed(headerUuid, 'resource')
      : headerUuid;

    const manifest = {
      format_version: state.packRole === 'skin' ? 1 : (state.manifestVersion === 'v3' ? 3 : 2),
      header: {
        name: state.form.packName.trim() || 'My Pack',
        uuid: resourceHeaderUuid,
        version: exportVersion(state.form.packVersion, currentVersionMode()),
        min_engine_version: exportVersion(state.form.minEngineVersion, currentEngineMode()),
      },
      modules: [],
      metadata: {
        generated_with: {
          'watts-manifest-generator': ['1.0.0'],
        },
      },
    };

    const description = state.form.packDescription.trim();
    if (description) manifest.header.description = description;

    if ((kind === 'resource' || kind === 'both') && state.form.packScope.trim()) {
      manifest.header.pack_scope = state.form.packScope.trim();
    }

    if (kind === 'world') {
      manifest.header.base_game_version = exportVersion(state.form.baseGameVersion, state.manifestVersion === 'v3' ? 'string' : currentVersionMode());
      if (state.form.allowRandomSeed) manifest.header.allow_random_seed = true;
      if (state.form.lockTemplateOptions) manifest.header.lock_template_options = true;
    }

    const authors = parseCsv(state.form.authors);
    if (authors.length) manifest.metadata.authors = authors;

    const license = state.form.license.trim();
    if (license) manifest.metadata.license = license;

    const url = state.form.url.trim();
    if (url) manifest.metadata.url = url;

    const productType = state.form.productType.trim();
    if (productType) manifest.metadata.product_type = productType;

    return manifest;
  };

  const buildModules = kind => {
    const allowed = new Set(
      kind === 'behavior' ? ['data', 'script'] :
      kind === 'resource' ? ['resources'] :
      kind === 'world' ? ['world_template', 'script'] :
      kind === 'skin' ? ['skin_pack'] : []
    );

    return state.modules
      .filter(module => allowed.has(module.type))
      .map(module => {
        const out = {
          type: module.type,
          uuid: module.uuid,
          version: exportVersion(module.version, currentVersionMode()),
        };
        if (module.description.trim()) out.description = module.description.trim();
        if ((module.type === 'script' || module.type === 'world_template') && module.entry.trim()) out.entry = module.entry.trim();
        return out;
      });
  };

  const buildDependencies = kind => {
    const filtered = state.dependencies.filter(dep => {
      if (kind === 'behavior') return true;
      if (kind === 'resource') return dep.kind === 'pack';
      if (kind === 'world') return true;
      return false;
    });

    return filtered.map(dep => dep.kind === 'native'
      ? {
          module_name: dep.module_name,
          version: exportVersion(dep.version, currentVersionMode()),
        }
      : {
          uuid: dep.uuid,
          version: exportVersion(dep.version, currentVersionMode()),
        }
    );
  };


  const buildCapabilities = kind => {
    const supported = new Set(capabilitySupportForRole(state.packRole));
    return Object.entries(state.capabilities)
      .filter(([key, enabled]) => enabled && supported.has(key))
      .map(([key]) => key);
  };

  const buildSubpacks = kind => {
    if (!state.subpacks.length) return undefined;
    if (!(kind === 'resource' || kind === 'world' || kind === 'skin')) return undefined;

    return state.subpacks.map(subpack => ({
      folder_name: subpack.folder_name.trim(),
      name: subpack.name.trim(),
      memory_performance_tier: Number(subpack.memory_performance_tier || 1),
    }));
  };

  const buildSettings = () => {
    if (state.manifestVersion !== 'v3' || !state.settings.length) return undefined;

    return state.settings.map(setting => {
      const base = {
        type: setting.type,
        title: setting.title.trim(),
        description: setting.description.trim(),
      };

      if (setting.name.trim()) base.name = setting.name.trim();

      if (setting.type === 'slider') {
        base.min = Number(setting.min || 0);
        base.max = Number(setting.max || 10);
        base.step = Number(setting.step || 1);
        base.default = Number(setting.default || 0);
      } else if (setting.type === 'toggle') {
        base.default = !!setting.value;
      } else if (setting.type === 'dropdown') {
        base.options = setting.options.map(option => option.trim()).filter(Boolean);
        base.default = (setting.defaultOption || base.options[0] || '').trim();
      }

      return base;
    });
  };

  const pruneEmptyObjects = manifest => {
    if (!manifest.header.description) delete manifest.header.description;
    if (!manifest.header.pack_scope) delete manifest.header.pack_scope;
    if (!manifest.header.base_game_version) delete manifest.header.base_game_version;
    if (!manifest.header.allow_random_seed) delete manifest.header.allow_random_seed;
    if (!manifest.header.lock_template_options) delete manifest.header.lock_template_options;
    if (!manifest.modules.length) delete manifest.modules;
    if (!manifest.dependencies || !manifest.dependencies.length) delete manifest.dependencies;
    if (!manifest.subpacks || !manifest.subpacks.length) delete manifest.subpacks;
    if (!manifest.settings || !manifest.settings.length) delete manifest.settings;
    return manifest;
  };

  const buildManifest = kind => {
    const manifest = buildBaseManifest(kind);

    if (kind === 'skin') {
      manifest.header.version = exportVersion(state.form.packVersion, currentVersionMode());
      manifest.header.min_engine_version = exportVersion(state.form.minEngineVersion, currentEngineMode());
    }

    manifest.modules = buildModules(kind);
    const dependencies = buildDependencies(kind);
    if (dependencies.length) manifest.dependencies = dependencies;

    const capabilities = buildCapabilities(kind);
    if (capabilities.length) manifest.capabilities = capabilities;

    const subpacks = buildSubpacks(kind);
    if (subpacks) manifest.subpacks = subpacks;

    const settings = buildSettings();
    if (settings) manifest.settings = settings;

    pruneEmptyObjects(manifest);
    return manifest;
  };

  const manifestKinds = () => {
    if (state.packRole === 'both') return ['behavior', 'resource'];
    if (state.packRole === 'world') return ['world'];
    if (state.packRole === 'skin') return ['skin'];
    return [state.packRole];
  };

  const validateManifest = (manifest, kind) => {
    const issues = [];

    if (!manifest.header?.name) issues.push('Pack name is required.');
    if (!isUuid(manifest.header?.uuid)) issues.push('Header UUID must be a valid UUID.');
    if (!isSemver(state.form.packVersion)) issues.push('Pack version must be valid SemVer.');
    if (!isSemver(state.form.minEngineVersion)) issues.push('Min engine version must be valid SemVer.');

    if (state.manifestVersion === 'v3') {
      if (typeof manifest.header.version !== 'string' || !isSemver(manifest.header.version)) issues.push('V3 requires string pack versions.');
      if (typeof manifest.header.min_engine_version !== 'string' || !isSemver(manifest.header.min_engine_version)) issues.push('V3 requires string engine versions.');
    }

    const uuids = [manifest.header?.uuid];
    (manifest.modules || []).forEach(module => uuids.push(module.uuid));
    (manifest.dependencies || []).forEach(dep => {
      if (dep.uuid) uuids.push(dep.uuid);
    });
    const dupes = uuids.filter(Boolean).filter((value, index, arr) => arr.indexOf(value) !== index);
    if (dupes.length) issues.push('Duplicate UUIDs detected.');

    if (kind !== 'skin') {
      if (!manifest.modules || !manifest.modules.length) issues.push('At least one valid module is required.');
    }

    (manifest.modules || []).forEach((module, index) => {
      if (!isUuid(module.uuid)) issues.push(`Module ${index + 1} UUID is invalid.`);
      const validTypes = kind === 'behavior' ? ['data', 'script']
        : kind === 'resource' ? ['resources']
        : kind === 'world' ? ['world_template', 'script']
        : kind === 'skin' ? ['skin_pack'] : [];
      if (!validTypes.includes(module.type)) issues.push(`Module ${index + 1} uses an invalid type.`);
      if (!isSemver(versionToText(module.version))) issues.push(`Module ${index + 1} version is invalid.`);
      if ((module.type === 'script' || module.type === 'world_template') && !module.entry) issues.push(`Module ${index + 1} needs an entry path.`);
    });

    (manifest.dependencies || []).forEach((dep, index) => {
      if (dep.module_name && !SCRIPT_MODULES.some(script => script.value === dep.module_name)) {
        issues.push(`Dependency ${index + 1} uses an invalid native module name.`);
      }
      if (dep.uuid && !isUuid(dep.uuid)) issues.push(`Dependency ${index + 1} uses an invalid UUID.`);
      if (!dep.module_name && !dep.uuid) issues.push(`Dependency ${index + 1} is missing a native module name or pack UUID.`);
    });

    state.settings.forEach((setting, index) => {
      if (!setting.name.trim() && setting.type !== 'label') issues.push(`Setting ${index + 1} needs a name.`);
      if (setting.type === 'slider') {
        if (Number(setting.step) <= 0) issues.push(`Setting ${index + 1} slider step must be greater than 0.`);
        if (Number(setting.min) >= Number(setting.max)) issues.push(`Setting ${index + 1} slider min must be less than max.`);
      } else if (setting.type === 'dropdown') {
        if (!setting.options.length) issues.push(`Setting ${index + 1} dropdown needs at least one option.`);
        if (setting.defaultOption && !setting.options.includes(setting.defaultOption)) {
          issues.push(`Setting ${index + 1} default option must match one of the dropdown options.`);
        }
      }
    });

    const supportedCaps = new Set(capabilitySupportForRole(state.packRole));
    Object.entries(state.capabilities).forEach(([key, enabled]) => {
      if (enabled && !supportedCaps.has(key)) issues.push(`Capability "${key}" is not supported for this pack type.`);
    });

    const selectedCaps = buildCapabilities(kind);
    if (selectedCaps.length !== Object.values(state.capabilities).filter(Boolean).length) {
      issues.push('One or more selected capabilities are not supported for this pack type.');
    }

    if (state.packRole === 'world' && !manifest.header.base_game_version) {
      issues.push('World templates require base_game_version.');
    }

    if (state.packRole === 'skin') {
      if (manifest.format_version !== 1) issues.push('Skin pack manifests must use format_version 1.');
      const skinModule = (manifest.modules || [])[0];
      if (!skinModule || skinModule.type !== 'skin_pack') issues.push('Skin pack manifest must use a skin_pack module.');
    }

    return issues;
  };

  const renderModules = () => {
    dom.modules.innerHTML = state.modules.map((module, index) => `
      <div class="card" data-module="${module.id}">
        <div class="head">
          <strong>Module ${index + 1}</strong>
          <div class="mini-actions">
            <button class="icon-btn" data-action="uuid-module" type="button">UUID</button>
            <button class="icon-btn" data-action="remove-module" type="button">Remove</button>
          </div>
        </div>
        <div class="body">
          <div class="two">
            <div class="field">
              <label>Type</label>
              <select data-field="type">
                ${moduleOptionsForRole(state.packRole).map(type => `<option value="${type}" ${module.type === type ? 'selected' : ''}>${type}</option>`).join('')}
              </select>
            </div>
            <div class="field">
              <label>UUID</label>
              <input data-field="uuid" type="text" value="${escapeHtml(module.uuid)}" />
            </div>
          </div>

          <div class="two">
            <div class="field">
              <label>Version</label>
              <input data-field="version" type="text" value="${escapeHtml(module.version)}" />
            </div>
            <div class="field">
              <label>Description (optional)</label>
              <input data-field="description" type="text" value="${escapeHtml(module.description)}" placeholder="Optional module description" />
            </div>
          </div>

          <div class="two ${module.type === 'script' || module.type === 'world_template' ? '' : 'hidden'}">
            <div class="field">
              <label>Entry</label>
              <input data-field="entry" type="text" value="${escapeHtml(module.entry)}" placeholder="scripts/main.js" />
            </div>
          </div>
        </div>
      </div>
    `).join('');
  };

  const renderDependencies = () => {
    dom.dependencies.innerHTML = state.dependencies.map((dep, index) => `
      <div class="card" data-dep="${dep.id}">
        <div class="head">
          <strong>Dependency ${index + 1}</strong>
          <div class="mini-actions">
            <button class="icon-btn" data-action="uuid-dep" type="button">UUID</button>
            <button class="icon-btn" data-action="remove-dep" type="button">Remove</button>
          </div>
        </div>
        <div class="body">
          <div class="two">
            <div class="field">
              <label>Dependency kind</label>
              <select data-field="kind">
                <option value="native" ${dep.kind === 'native' ? 'selected' : ''}>native</option>
                <option value="pack" ${dep.kind === 'pack' ? 'selected' : ''}>pack</option>
              </select>
            </div>
            <div class="field">
              <label>Version</label>
              <input data-field="version" type="text" value="${escapeHtml(dep.version)}" />
            </div>
          </div>
          <div class="two">
            <div class="field ${dep.kind === 'native' ? '' : 'hidden'}" data-wrap="module_name">
              <label>Module name</label>
              <select data-field="module_name">
                ${SCRIPT_MODULES.map(script => `<option value="${script.value}" ${dep.module_name === script.value ? 'selected' : ''}>${script.label}</option>`).join('')}
              </select>
            </div>
            <div class="field ${dep.kind === 'pack' ? '' : 'hidden'}" data-wrap="uuid">
              <label>Pack UUID</label>
              <input data-field="uuid" type="text" value="${escapeHtml(dep.uuid)}" />
            </div>
          </div>
          <div class="field">
            <label>Description (optional)</label>
            <input data-field="description" type="text" value="${escapeHtml(dep.description)}" />
          </div>
        </div>
      </div>
    `).join('');
  };

  const renderSubpacks = () => {
    dom.subpacks.innerHTML = state.subpacks.map((subpack, index) => `
      <div class="card" data-subpack="${subpack.id}">
        <div class="head">
          <strong>Subpack ${index + 1}</strong>
          <div class="mini-actions">
            <button class="icon-btn" data-action="remove-subpack" type="button">Remove</button>
          </div>
        </div>
        <div class="body">
          <div class="three">
            <div class="field">
              <label>Folder name</label>
              <input data-field="folder_name" type="text" value="${escapeHtml(subpack.folder_name)}" />
            </div>
            <div class="field">
              <label>Name</label>
              <input data-field="name" type="text" value="${escapeHtml(subpack.name)}" />
            </div>
            <div class="field">
              <label>Memory tier</label>
              <input data-field="memory_performance_tier" type="number" min="1" max="5" step="1" value="${subpack.memory_performance_tier}" />
            </div>
          </div>
        </div>
      </div>
    `).join('');
  };

  const renderSettingOptions = setting => {
    if (setting.type !== 'dropdown') return '';
    return `
      <div class="card" style="margin-top:10px">
        <div class="head">
          <strong>Dropdown options</strong>
          <div class="mini-actions">
            <button class="btn" data-action="add-option" type="button">Add option</button>
          </div>
        </div>
        <div class="body">
          <div class="card-list" data-options-list>
            ${setting.options.map((option, optionIndex) => `
              <div class="split" data-option-index="${optionIndex}">
                <input data-field="option_text" type="text" value="${escapeHtml(option)}" placeholder="Option ${optionIndex + 1}" />
                <button class="btn danger" data-action="remove-option" type="button">Remove</button>
              </div>
            `).join('')}
          </div>
          <div class="two">
            <div class="field">
              <label>Default option</label>
              <input data-field="defaultOption" type="text" list="setting-${setting.id}-options" value="${escapeHtml(setting.defaultOption)}" placeholder="Select or type a default" />
              <datalist id="setting-${setting.id}-options">
                ${setting.options.map(option => `<option value="${escapeHtml(option)}"></option>`).join('')}
              </datalist>
            </div>
            <div class="field">
              <label>Option count</label>
              <div class="warnbox" style="margin:0;">${setting.options.length} option(s)</div>
            </div>
          </div>
        </div>
      </div>
    `;
  };

  const renderSettings = () => {
    dom.settings.innerHTML = state.settings.map((setting, index) => `
      <div class="card" data-setting="${setting.id}">
        <div class="head">
          <strong>Setting ${index + 1}</strong>
          <div class="mini-actions">
            <button class="icon-btn" data-action="remove-setting" type="button">Remove</button>
          </div>
        </div>
        <div class="body">
          <div class="three">
            <div class="field">
              <label>Type</label>
              <select data-field="type">
                ${['slider', 'toggle', 'dropdown', 'label'].map(type => `<option value="${type}" ${setting.type === type ? 'selected' : ''}>${type}</option>`).join('')}
              </select>
            </div>
            <div class="field">
              <label>Name</label>
              <input data-field="name" type="text" value="${escapeHtml(setting.name)}" />
            </div>
            <div class="field">
              <label>Title</label>
              <input data-field="title" type="text" value="${escapeHtml(setting.title)}" />
            </div>
          </div>

          <div class="field">
            <label>Description / label text</label>
            <input data-field="description" type="text" value="${escapeHtml(setting.description)}" />
          </div>

          <div class="three ${setting.type === 'slider' ? '' : 'hidden'}" data-wrap="slider">
            <div class="field"><label>Min</label><input data-field="min" type="number" value="${setting.min}"></div>
            <div class="field"><label>Max</label><input data-field="max" type="number" value="${setting.max}"></div>
            <div class="field"><label>Step</label><input data-field="step" type="number" value="${setting.step}"></div>
          </div>

          <div class="two ${setting.type === 'slider' ? '' : 'hidden'}" data-wrap="slider2">
            <div class="field"><label>Default</label><input data-field="default" type="number" value="${setting.default}"></div>
            <div class="field"><label>Value</label><input data-field="value" type="checkbox" ${setting.value ? 'checked' : ''}></div>
          </div>

          <div class="two ${setting.type === 'toggle' ? '' : 'hidden'}" data-wrap="toggle">
            <div class="field"><label>Default enabled</label><input data-field="value" type="checkbox" ${setting.value ? 'checked' : ''}></div>
            <div class="field"><label>Toggle hint</label><div class="warnbox" style="margin:0;">Use a checkbox to control the default toggle state.</div></div>
          </div>

          <div class="${setting.type === 'dropdown' ? '' : 'hidden'}" data-wrap="dropdown">
            ${renderSettingOptions(setting)}
          </div>

          <div class="${setting.type === 'label' ? '' : 'hidden'}" data-wrap="label">
            <div class="warnbox" style="margin:0;">Label settings are display-only entries and omit value fields in the exported JSON.</div>
          </div>
        </div>
      </div>
    `).join('');
  };

  const renderLists = () => {
    renderModules();
    renderDependencies();
    renderSubpacks();
    renderSettings();
  };

  const renderOutputs = () => {
    const cards = manifestKinds().map(kind => {
      const manifest = buildManifest(kind);
      const problems = validateManifest(manifest, kind);
      return {
        kind,
        text: JSON.stringify(manifest, null, 2),
        manifest,
        problems,
        filename: kind === 'behavior' ? 'behavior-manifest.json'
          : kind === 'resource' ? 'resource-manifest.json'
          : kind === 'world' ? 'world-template-manifest.json'
          : 'skin-pack-manifest.json',
      };
    });

    state.outputs = cards;

    dom.outputGrid.innerHTML = cards.map((card, index) => `
      <div class="output-card ${state.activeOutputIndex === index ? 'active' : ''}" data-output="${index}">
        <div class="bar">
          <div>
            <strong>${card.kind.charAt(0).toUpperCase() + card.kind.slice(1)} manifest</strong>
            <div class="small-note">${card.manifest.format_version === 3 ? 'V3 preview' : card.manifest.format_version === 1 ? 'Skin pack / format 1' : 'V2 / V1 compatible'}</div>
          </div>
          <div class="mini-actions">
            <button class="btn" data-action="copy" type="button">Copy</button>
            <button class="btn" data-action="download" type="button">Download</button>
          </div>
        </div>
        <pre>${escapeHtml(card.text)}</pre>
      </div>
    `).join('');

    const allProblems = cards.flatMap(card => card.problems.map(problem => `${card.kind}: ${problem}`));
    dom.validationStatus.textContent = allProblems.length
      ? `Warnings: ${allProblems.join(' | ')}`
      : 'Manifest looks ready to export.';
  };

  const exportSelectedOutput = action => {
    const card = state.outputs[state.activeOutputIndex] || state.outputs[0];
    if (!card) return;
    if (action === 'copy') {
      navigator.clipboard.writeText(card.text).then(() => {
        dom.validationStatus.textContent = 'Copied latest JSON to clipboard.';
      });
    } else if (action === 'download') {
      downloadText(card.text, card.filename);
    }
  };

  const buildModulesFromImported = modules => (modules || []).map(module => ({
    id: uid(),
    type: module.type || 'data',
    uuid: module.uuid || uid(),
    version: versionToText(module.version) || DEFAULTS.packVersion,
    description: module.description || '',
    entry: module.entry || '',
  }));

  const applyImportedManifest = obj => {
    state.form.packName = obj.header?.name || DEFAULTS.packName;
    state.form.packDescription = obj.header?.description || '';
    state.form.headerUuid = obj.header?.uuid || uid();
    state.form.packVersion = versionToText(obj.header?.version) || DEFAULTS.packVersion;
    state.form.minEngineVersion = versionToText(obj.header?.min_engine_version) || DEFAULTS.minEngineVersion;
    state.form.baseGameVersion = versionToText(obj.header?.base_game_version) || DEFAULTS.baseGameVersion;
    state.form.packScope = obj.header?.pack_scope || '';
    state.form.allowRandomSeed = !!obj.header?.allow_random_seed;
    state.form.lockTemplateOptions = !!obj.header?.lock_template_options;

    state.form.authors = Array.isArray(obj.metadata?.authors) ? obj.metadata.authors.join(', ') : '';
    state.form.license = obj.metadata?.license || '';
    state.form.url = obj.metadata?.url || '';
    state.form.productType = obj.metadata?.product_type || '';

    state.manifestVersion = String(obj.format_version) === '3' ? 'v3' : 'v2';
    state.versionFormat = Array.isArray(obj.header?.version) ? 'array' : 'string';
    state.engineFormat = Array.isArray(obj.header?.min_engine_version) ? 'array' : 'string';

    state.modules = buildModulesFromImported(obj.modules);
    state.dependencies = (obj.dependencies || []).map(dep => ({
      id: uid(),
      kind: dep.module_name ? 'native' : 'pack',
      module_name: dep.module_name || '@minecraft/server',
      uuid: dep.uuid || uid(),
      version: versionToText(dep.version) || DEFAULTS.packVersion,
      description: '',
    }));

    state.subpacks = (obj.subpacks || []).map(subpack => ({
      id: uid(),
      folder_name: subpack.folder_name || '',
      name: subpack.name || '',
      memory_performance_tier: subpack.memory_performance_tier ?? 1,
    }));

    state.settings = (obj.settings || []).map(setting => ({
      id: uid(),
      type: ['slider', 'toggle', 'dropdown', 'label'].includes(setting.type) ? setting.type : 'slider',
      name: setting.name || '',
      title: setting.title || setting.name || '',
      description: setting.description || '',
      min: setting.min ?? 0,
      max: setting.max ?? 10,
      step: setting.step ?? 1,
      default: setting.default ?? 0,
      value: setting.default ?? false,
      options: Array.isArray(setting.options) ? setting.options : (setting.options ? String(setting.options).split(',').map(part => part.trim()).filter(Boolean) : []),
      defaultOption: setting.default || '',
    }));

    if (Array.isArray(obj.capabilities)) {
      Object.keys(state.capabilities).forEach(key => {
        state.capabilities[key] = obj.capabilities.includes(key);
      });
    }

    if (obj.header?.base_game_version) state.packRole = 'world';
    else if (state.modules.some(module => module.type === 'skin_pack')) state.packRole = 'skin';
    else if (state.modules.some(module => module.type === 'resources')) state.packRole = 'resource';
    else state.packRole = 'behavior';

    normalizeModulesForRole();
    normalizeDependencies();
    normalizeSubpacks();
    normalizeSettings();
    normalizeCapabilitiesForRole();
    scheduleRender({ static: true, lists: true, preview: true });
  };

  const parseImportedFile = file => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const obj = JSON.parse(String(reader.result || '{}'));
        if (!obj || typeof obj !== 'object') throw new Error('Invalid JSON object');
        applyImportedManifest(obj);
      } catch (error) {
        alert('Could not import JSON: ' + error.message);
      }
    };
    reader.readAsText(file);
  };

  const renderStatic = () => {
    syncStaticInputs();
    syncStaticControls();
  };

  const addModule = (data = {}) => {
    state.modules.push({
      id: uid(),
      type: data.type || defaultModuleTypeForRole(state.packRole),
      uuid: data.uuid || uid(),
      version: data.version || '1.0.0',
      description: data.description || '',
      entry: data.entry || (data.type === 'script' || data.type === 'world_template' ? 'scripts/main.js' : ''),
    });
    scheduleRender({ lists: true, preview: true });
  };

  const addDependency = (data = {}) => {
    state.dependencies.push({
      id: uid(),
      kind: data.kind === 'pack' ? 'pack' : 'native',
      module_name: data.module_name || '@minecraft/server',
      uuid: data.uuid || uid(),
      version: data.version || '1.0.0',
      description: data.description || '',
    });
    scheduleRender({ lists: true, preview: true });
  };

  const addSubpack = (data = {}) => {
    state.subpacks.push({
      id: uid(),
      folder_name: data.folder_name || '',
      name: data.name || '',
      memory_performance_tier: data.memory_performance_tier ?? 1,
    });
    scheduleRender({ lists: true, preview: true });
  };

  const addSetting = (data = {}) => {
    state.settings.push({
      id: uid(),
      type: ['slider', 'toggle', 'dropdown', 'label'].includes(data.type) ? data.type : 'slider',
      name: data.name || '',
      title: data.title || '',
      description: data.description || '',
      min: data.min ?? 0,
      max: data.max ?? 10,
      step: data.step ?? 1,
      default: data.default ?? 0,
      value: data.value ?? false,
      options: Array.isArray(data.options) ? data.options : [],
      defaultOption: data.defaultOption || '',
    });
    scheduleRender({ lists: true, preview: true });
  };

  dom.versionButtons.addEventListener('click', event => {
    const btn = event.target.closest('[data-version]');
    if (!btn) return;
    setManifestVersion(btn.dataset.version);
  });

  dom.packButtons.addEventListener('click', event => {
    const btn = event.target.closest('[data-pack]');
    if (!btn) return;
    presetRole(btn.dataset.pack);
  });

  $('#regenHeaderUuid').addEventListener('click', () => {
    state.form.headerUuid = uid();
    scheduleRender({ static: true, preview: true });
  });

  $('#togglePackVersionFmt').addEventListener('click', () => {
    if (state.manifestVersion === 'v3') return;
    state.versionFormat = state.versionFormat === 'array' ? 'string' : 'array';
    scheduleRender({ static: true, preview: true });
  });

  $('#toggleEngineFmt').addEventListener('click', () => {
    if (state.manifestVersion === 'v3') return;
    state.engineFormat = state.engineFormat === 'array' ? 'string' : 'array';
    scheduleRender({ static: true, preview: true });
  });

  $('#addModuleBtn').addEventListener('click', () => addModule());
  $('#addDependencyBtn').addEventListener('click', () => addDependency());
  $('#addSubpackBtn').addEventListener('click', () => addSubpack());
  $('#addSettingBtn').addEventListener('click', () => {
    if (state.manifestVersion !== 'v3') setManifestVersion('v3');
    addSetting({ type: 'slider' });
  });

  $('#generateBtn').addEventListener('click', () => scheduleRender({ static: true, lists: true, preview: true }));
  $('#copyAllBtn').addEventListener('click', () => exportSelectedOutput('copy'));
  $('#downloadAllBtn').addEventListener('click', () => exportSelectedOutput('download'));

  dom.outputGrid.addEventListener('click', event => {
    const card = event.target.closest('[data-output]');
    if (!card) return;
    const index = Number(card.dataset.output);
    if (!Number.isNaN(index)) state.activeOutputIndex = index;
    const action = event.target.dataset.action;
    if (action === 'copy') exportSelectedOutput('copy');
    if (action === 'download') exportSelectedOutput('download');
    scheduleRender({ preview: true });
  });

  $('#importFile').addEventListener('change', event => {
    const file = event.target.files && event.target.files[0];
    if (file) parseImportedFile(file);
    event.target.value = '';
  });

  Object.entries(staticFields).forEach(([key, element]) => {
    const update = () => {
      if (element.type === 'checkbox') {
        state.form[key] = element.checked;
      } else {
        state.form[key] = element.value;
      }
      scheduleRender({ preview: true });
    };
    element.addEventListener('input', update);
    element.addEventListener('change', update);
  });

  dom.capabilities.addEventListener('change', event => {
    const cap = event.target.dataset.cap;
    if (!cap) return;
    state.capabilities[cap] = event.target.checked;
    scheduleRender({ preview: true });
  });

  dom.modules.addEventListener('click', event => {
    const card = event.target.closest('[data-module]');
    if (!card) return;
    const module = state.modules.find(item => item.id === card.dataset.module);
    if (!module) return;

    if (event.target.dataset.action === 'remove-module') {
      state.modules = state.modules.filter(item => item.id !== module.id);
      normalizeModulesForRole();
      scheduleRender({ lists: true, preview: true });
      return;
    }

    if (event.target.dataset.action === 'uuid-module') {
      module.uuid = uid();
      scheduleRender({ lists: true, preview: true });
    }
  });

  dom.modules.addEventListener('change', event => {
    const card = event.target.closest('[data-module]');
    if (!card) return;
    const module = state.modules.find(item => item.id === card.dataset.module);
    if (!module) return;
    const field = event.target.dataset.field;
    if (!field) return;

    if (field === 'type') {
      module.type = event.target.value;
      normalizeModulesForRole();
      scheduleRender({ lists: true, preview: true });
      return;
    }

    if (field === 'version') module.version = event.target.value;
    else if (field === 'uuid') module.uuid = event.target.value;
    else if (field === 'description') module.description = event.target.value;
    else if (field === 'entry') module.entry = event.target.value;
    scheduleRender({ preview: true });
  });

  dom.modules.addEventListener('input', event => {
    const card = event.target.closest('[data-module]');
    if (!card) return;
    const module = state.modules.find(item => item.id === card.dataset.module);
    if (!module) return;
    const field = event.target.dataset.field;
    if (!field || field === 'type') return;
    module[field] = event.target.value;
    scheduleRender({ preview: true });
  });

  dom.dependencies.addEventListener('click', event => {
    const card = event.target.closest('[data-dep]');
    if (!card) return;
    const dep = state.dependencies.find(item => item.id === card.dataset.dep);
    if (!dep) return;

    if (event.target.dataset.action === 'remove-dep') {
      state.dependencies = state.dependencies.filter(item => item.id !== dep.id);
      scheduleRender({ lists: true, preview: true });
      return;
    }

    if (event.target.dataset.action === 'uuid-dep') {
      dep.uuid = uid();
      scheduleRender({ lists: true, preview: true });
    }
  });

  dom.dependencies.addEventListener('change', event => {
    const card = event.target.closest('[data-dep]');
    if (!card) return;
    const dep = state.dependencies.find(item => item.id === card.dataset.dep);
    if (!dep) return;
    const field = event.target.dataset.field;
    if (!field) return;
    if (field === 'kind') {
      dep.kind = event.target.value;
      scheduleRender({ lists: true, preview: true });
      return;
    }
    dep[field] = event.target.value;
    scheduleRender({ preview: true });
  });

  dom.dependencies.addEventListener('input', event => {
    const card = event.target.closest('[data-dep]');
    if (!card) return;
    const dep = state.dependencies.find(item => item.id === card.dataset.dep);
    if (!dep) return;
    const field = event.target.dataset.field;
    if (!field || field === 'kind') return;
    dep[field] = event.target.value;
    scheduleRender({ preview: true });
  });

  dom.subpacks.addEventListener('click', event => {
    const card = event.target.closest('[data-subpack]');
    if (!card) return;
    const subpack = state.subpacks.find(item => item.id === card.dataset.subpack);
    if (!subpack) return;

    if (event.target.dataset.action === 'remove-subpack') {
      state.subpacks = state.subpacks.filter(item => item.id !== subpack.id);
      scheduleRender({ lists: true, preview: true });
    }
  });

  dom.subpacks.addEventListener('input', event => {
    const card = event.target.closest('[data-subpack]');
    if (!card) return;
    const subpack = state.subpacks.find(item => item.id === card.dataset.subpack);
    if (!subpack) return;
    const field = event.target.dataset.field;
    if (!field) return;
    subpack[field] = field === 'memory_performance_tier' ? Math.max(1, Math.min(5, Number(event.target.value || 1))) : event.target.value;
    scheduleRender({ preview: true });
  });

  dom.settings.addEventListener('click', event => {
    const card = event.target.closest('[data-setting]');
    if (!card) return;
    const setting = state.settings.find(item => item.id === card.dataset.setting);
    if (!setting) return;

    if (event.target.dataset.action === 'remove-setting') {
      state.settings = state.settings.filter(item => item.id !== setting.id);
      scheduleRender({ lists: true, preview: true });
      return;
    }

    if (event.target.dataset.action === 'add-option') {
      setting.options.push(`Option ${setting.options.length + 1}`);
      if (!setting.defaultOption) setting.defaultOption = setting.options[0] || '';
      scheduleRender({ lists: true, preview: true });
      return;
    }

    if (event.target.dataset.action === 'remove-option') {
      const row = event.target.closest('[data-option-index]');
      if (!row) return;
      const index = Number(row.dataset.optionIndex);
      if (!Number.isNaN(index)) setting.options.splice(index, 1);
      if (!setting.options.length) setting.defaultOption = '';
      else if (!setting.options.includes(setting.defaultOption)) setting.defaultOption = setting.options[0];
      scheduleRender({ lists: true, preview: true });
    }
  });

  dom.settings.addEventListener('change', event => {
    const card = event.target.closest('[data-setting]');
    if (!card) return;
    const setting = state.settings.find(item => item.id === card.dataset.setting);
    if (!setting) return;
    const field = event.target.dataset.field;
    if (!field) return;

    if (field === 'type') {
      setting.type = event.target.value;
      if (setting.type !== 'dropdown') setting.defaultOption = '';
      scheduleRender({ lists: true, preview: true });
      return;
    }

    if (field === 'value') {
      setting.value = event.target.checked;
      scheduleRender({ preview: true });
      return;
    }

    if (field === 'option_text') {
      const row = event.target.closest('[data-option-index]');
      if (!row) return;
      const index = Number(row.dataset.optionIndex);
      if (!Number.isNaN(index)) setting.options[index] = event.target.value;
      if (!setting.options.includes(setting.defaultOption)) setting.defaultOption = setting.options[0] || '';
      scheduleRender({ lists: true, preview: true });
      return;
    }

    if (field === 'defaultOption') {
      setting.defaultOption = event.target.value;
      scheduleRender({ preview: true });
      return;
    }

    if (field === 'min' || field === 'max' || field === 'step' || field === 'default') {
      setting[field] = Number(event.target.value || 0);
      scheduleRender({ preview: true });
      return;
    }

    setting[field] = event.target.value;
    scheduleRender({ preview: true });
  });

  dom.settings.addEventListener('input', event => {
    const card = event.target.closest('[data-setting]');
    if (!card) return;
    const setting = state.settings.find(item => item.id === card.dataset.setting);
    if (!setting) return;
    const field = event.target.dataset.field;
    if (!field) return;

    if (field === 'option_text' || field === 'defaultOption' || field === 'name' || field === 'title' || field === 'description') {
      if (field === 'option_text') {
        const row = event.target.closest('[data-option-index]');
        if (!row) return;
        const index = Number(row.dataset.optionIndex);
        if (!Number.isNaN(index)) setting.options[index] = event.target.value;
        if (!setting.options.includes(setting.defaultOption)) setting.defaultOption = setting.options[0] || '';
      } else {
        setting[field] = event.target.value;
      }
      scheduleRender({ preview: true });
    }
  });


  function initialSeed() {
    state.modules = [
      { id: uid(), type: 'data', uuid: uid(), version: '1.0.0', description: '', entry: '' },
    ];
    state.dependencies = [];
    state.subpacks = [];
    state.settings = [];

    ensurePresetState();
    renderStatic();
    renderLists();
    renderOutputs();
  }

  syncStaticInputs();
  initialSeed();
})();
