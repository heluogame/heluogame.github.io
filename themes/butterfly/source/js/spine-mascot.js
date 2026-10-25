(() => {
  'use strict';
  if (window.BlogSpineMascot) return;
  const configElement = document.getElementById('spine-mascot-config');
  if (!configElement) return;
  let config;
  try { config = JSON.parse(configElement.textContent); } catch (_) { return; }
  if (window.BlogSpineMascotSchedule) config = window.BlogSpineMascotSchedule.normalize(config);
  if (config.enable !== true) return;
  const settings = config;
  const storageKey = 'blog-spine-mascot-v1';
  let preferences = {};
  try { preferences = JSON.parse(localStorage.getItem(storageKey)) || {}; } catch (_) {}
  delete preferences.zoom;
  // The site setting determines initial visibility on each full page load.
  delete preferences.closed;
  const selectModel = () => {
    const schedule = window.BlogSpineMascotSchedule;
    if (schedule) {
      const date = new Date();
      const base = schedule.select(settings, date);
      return schedule.select(settings, date, preferences.variants?.[base.familyKey]?.selected);
    }
    const id = settings.id || 'default';
    const category = settings.category === 'scene' ? 'scene' : 'character';
    return { key: id, familyKey: id, choices: [{ id, label: settings.name || id, category }], config: { ...settings, id, category } };
  };
  const initialModel = selectModel();
  let currentModel = initialModel;
  config = initialModel.config;
  const dayLabel = () => ['', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日'][currentModel.weekday] || '看板娘';

  const number = (value, fallback, min, max) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
  };
  const framing = window.BlogSpineMascotFraming;
  const policy = framing.policy;
  const width = policy.fallbackWidth, height = policy.fallbackHeight;
  let viewWidth = width, viewHeight = height;
  let idleFrame = null;
  let sceneFrame = null;
  let fixedSceneFrame = null;
  let scenePlacements = [];
  let sceneFitFrame = null;
  let sceneEdgeMask = null;
  const minZoom = policy.minZoom, maxZoom = policy.maxZoom;
  const modelSkins = () => (Array.isArray(config.skins) ? config.skins : [{ name: config.skin, label: config.skin }])
    .filter((item, index, items) => item && typeof item.name === 'string' && items.findIndex(other => other && other.name === item.name) === index);
  const modelSteps = () => config.category === 'scene' && Array.isArray(config.scene_steps)
    ? config.scene_steps.filter(step => step && typeof step.animation === 'string' && typeof step.idle === 'string' && step.animation && step.idle) : [];
  const defaultSceneIndex = () => Math.max(0, modelSteps().findIndex(step => step.idle === config.idle));
  const modelActions = () => {
    const steps = modelSteps();
    return steps.length ? steps.map((step, index) => ({ id: index < 2 ? ['touch', 'kiss'][index] : `scene:${step.id || index + 1}`, label: step.label || `场景 ${index + 1}`,
      animation: step.animation, idle: step.idle, step: index, icon: 'fa-film' })) : [
      { id: 'touch', label: config.interaction_label || '触摸', animation: config.interaction, icon: 'fa-hand-pointer' },
      { id: 'kiss', label: config.attack_label || '互动', animation: config.attack, icon: config.attack_icon || 'fa-heart' }
    ];
  };
  const interactionTitle = () => modelSteps().length
    ? '点击播放当前场景演出，结束后恢复循环；拖动移动，滚轮缩放' + (modelSteps().length > 1 ? '，右键选择场景' : '，右键设置')
    : '点击互动，拖动移动；滚轮缩放，右键设置';
  let skins = modelSkins();
  let actions = modelActions();
  const right = number(config.right, 72, 8, 600);
  const bottom = number(config.bottom, 18, 8, 600);
  let playbackSpeed = number(config.speed, .5, .1, 3);
  const frameInterval = 1000 / number(config.fps, 30, 10, 60);
  const mobile = window.matchMedia(`(max-width: ${number(config.mobile_breakpoint, 768, 320, 1200)}px)`);
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let closed = settings.default_visible === false;
  let paused = preferences.paused === true || reducedMotion.matches;
  let position = preferences.position;
  let zoom = 1;
  const modelPreferences = () => {
    const aliases = Array.isArray(config.preference_aliases) ? config.preference_aliases : [];
    const saved = preferences.models || {};
    for (const id of [config.id, ...aliases]) if (saved[id]) return saved[id];
    return config.id === (settings.id || 'default') ? preferences : {};
  };
  let selectedSkin = skins.some(item => item.name === modelPreferences().skin) ? modelPreferences().skin : config.skin;
  let selectedAction = actions.some(item => item.id === modelPreferences().action && item.animation) ? modelPreferences().action : 'touch';
  let sceneIndex = Math.trunc(number(modelPreferences().scene, defaultSceneIndex(), 0, Math.max(0, modelSteps().length - 1)));
  let sceneBusy = false;
  const activeIdle = () => modelSteps()[sceneIndex]?.idle || config.idle;
  const activeIdleTrack = () => modelSteps()[sceneIndex]?.idle_base ? 1 : 0;
  const activeBaseIdle = () => modelSteps()[sceneIndex]?.idle_base || activeIdle();
  if (modelSteps().length) selectedAction = actions[sceneIndex].id;
  let player = null;
  let compositeController = null;
  let runtimePromise = null;
  let generation = 0;
  let raf = 0;
  let loadTimer = 0;
  let ready = false;
  let failed = false;
  let lastFrame = 0;
  let lastHitFrame = 0;
  let hitCanvas = null, hitContext = null, hitUnavailable = false;
  let hitRetryTimer = 0, hitWarned = false;
  let placedWidth = 0, placedHeight = 0;
  const emptyHitPath = 'path("M0 0Z")';
  let drag = null;
  let suppressClick = false;
  let rotationTimer = 0;
  let voicePlayer = null;
  let voiceGeneration = 0;
  const voicePositions = new Map();

  const root = document.createElement('div');
  root.className = 'spine-mascot';
  root.id = 'blog-spine-mascot';
  root.dataset.model = initialModel.key;
  root.dataset.family = initialModel.familyKey;
  root.dataset.category = config.category;
  root.dataset.weekday = String(initialModel.weekday || '');
  root.hidden = true;
  root.style.setProperty('--mascot-width', `${width}px`);
  root.style.setProperty('--mascot-height', `${height}px`);
  const stage = document.createElement('div');
  stage.className = 'spine-mascot__stage';
  const host = document.createElement('div');
  host.className = 'spine-mascot__host';
  host.setAttribute('aria-hidden', 'true');
  function setSceneEdgeMask(mask) {
    sceneEdgeMask = mask || null;
    const image = framing.maskImage(sceneEdgeMask);
    root.dataset.edgeMask = String(image !== 'none');
    host.style.setProperty('--mascot-edge-mask', image);
  }
  setSceneEdgeMask(null);
  const touch = document.createElement('button');
  touch.type = 'button';
  touch.className = 'spine-mascot__touch';
  touch.setAttribute('aria-label', `${config.name || 'Spine'} 吉祥物，点击互动，可拖动`);
  touch.title = interactionTitle();
  touch.setAttribute('aria-haspopup', 'menu');
  touch.setAttribute('aria-controls', 'spine-mascot-menu');
  touch.setAttribute('aria-expanded', 'false');
  touch.disabled = true;
  touch.style.clipPath = emptyHitPath;
  stage.append(host, touch);
  const menu = document.createElement('div');
  menu.id = 'spine-mascot-menu';
  menu.className = 'spine-mascot-menu';
  menu.hidden = true;
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-label', '吉祥物设置');
  const heading = document.createElement('div');
  heading.className = 'spine-mascot-menu__heading';
  const name = document.createElement('span');
  name.textContent = dayLabel();
  const zoomLabel = document.createElement('span');
  heading.append(name, zoomLabel);
  menu.appendChild(heading);
  const button = (label, icon, parent = menu) => {
    const element = document.createElement('button');
    element.type = 'button';
    element.title = label;
    element.setAttribute('aria-label', label);
    const mark = document.createElement('i');
    mark.className = `fa-solid ${icon}`;
    mark.setAttribute('aria-hidden', 'true');
    element.appendChild(mark);
    if (parent) {
      element.setAttribute('role', 'menuitem');
      element.tabIndex = -1;
      const text = document.createElement('span');
      text.textContent = label;
      element.appendChild(text);
      parent.appendChild(element);
    }
    return element;
  };
  const makeGroup = (label, iconName, className) => {
    const group = document.createElement('div');
    group.className = 'spine-mascot-menu__action-group';
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', label);
    const title = document.createElement('div');
    title.className = 'spine-mascot-menu__action-title';
    const icon = document.createElement('i');
    icon.className = `fa-solid ${iconName}`;
    icon.setAttribute('aria-hidden', 'true');
    const text = document.createElement('span');
    text.textContent = label;
    title.append(icon, text);
    const versions = document.createElement('div');
    versions.className = className;
    group.append(title, versions);
    menu.appendChild(group);
    return versions;
  };
  const categoryGroup = makeGroup('分类', 'fa-images', 'spine-mascot-menu__options');
  const variantGroup = makeGroup('角色', 'fa-user', 'spine-mascot-menu__options');
  let categoryButtons = [], variantButtons = [];
  function makeModelButtons() {
    categoryGroup.replaceChildren();
    variantGroup.replaceChildren();
    const choices = currentModel.choices;
    const categories = [
      { id: 'character', label: '立绘', icon: 'fa-user' },
      { id: 'scene', label: '场景', icon: 'fa-image' }
    ].filter(category => choices.some(model => model.category === category.id));
    categoryGroup.style.setProperty('--mascot-option-count', String(categories.length));
    categoryButtons = categories.map(category => {
      const element = button(`分类 ${category.label}`, category.icon, categoryGroup);
      element.children[1].textContent = category.label;
      element.setAttribute('role', 'menuitemradio');
      element.dataset.category = category.id;
      element.disabled = true;
      element.addEventListener('click', () => {
        const remembered = preferences.variants?.[currentModel.familyKey]?.[category.id];
        const matching = currentModel.choices.filter(model => model.category === category.id);
        chooseModel((matching.find(model => model.id === remembered) || matching[0]).id);
      });
      return element;
    });
    const variants = choices.filter(model => model.category === config.category);
    const menuOrder = (settings.models?.[currentModel.familyKey] || settings).menu_order;
    if (Array.isArray(menuOrder)) {
      const rank = id => {
        const index = menuOrder.indexOf(id);
        return index < 0 ? menuOrder.length : index;
      };
      variants.sort((a, b) => rank(a.id) - rank(b.id));
    }
    const variantLabel = config.category === 'scene' ? '演出' : '角色';
    const variantIcon = config.category === 'scene' ? 'fa-image' : 'fa-user';
    variantGroup.parentElement.setAttribute('aria-label', variantLabel);
    const variantTitle = variantGroup.parentElement.firstElementChild;
    variantTitle.children[0].className = `fa-solid ${variantIcon}`;
    variantTitle.children[1].textContent = variantLabel;
    variantGroup.parentElement.hidden = variants.length === 0;
    variantGroup.style.setProperty('--mascot-option-count', String(Math.max(1, Math.min(2, variants.length))));
    variantButtons = variants.map(model => {
      const element = button(`${variantLabel} ${model.label}`, variantIcon, variantGroup);
      element.children[1].textContent = model.label;
      element.setAttribute('role', 'menuitemradio');
      element.dataset.model = model.id;
      element.disabled = true;
      element.addEventListener('click', () => chooseModel(model.id));
      return element;
    });
  }
  makeModelButtons();
  const actionGroup = makeGroup('动作', 'fa-hand-pointer', 'spine-mascot-menu__actions');
  function makeActionButtons() {
    actionGroup.replaceChildren();
    return actions.map(action => {
      const element = button(action.label, action.icon, actionGroup);
      element.setAttribute('role', 'menuitemradio');
      element.dataset.action = action.id;
      element.disabled = true;
      element.addEventListener('click', () => {
        const action = actions.find(item => item.id === element.dataset.action);
        if (!ready || !action || !action.animation || !player.skeleton.data.findAnimation(action.animation)) return;
        if (modelSteps().length) {
          const step = modelSteps()[action.step];
          if (sceneBusy || !player.skeleton.data.findAnimation(action.idle) ||
              (step?.idle_base && !player.skeleton.data.findAnimation(step.idle_base))) return;
          stopVoice();
          sceneIndex = action.step;
          selectedAction = action.id;
          startIdle(player);
          run();
        } else if (!playAction(action.animation, selectedSkin)) return;
        save();
        hideMenu(true);
      });
      return element;
    });
  }
  let actionButtons = makeActionButtons();
  const skinGroup = makeGroup('皮肤', 'fa-layer-group', 'spine-mascot-menu__versions');
  function makeSkinButtons() {
    skinGroup.replaceChildren();
    return skins.map(skin => {
      const element = button(`皮肤 ${skin.label || skin.name}`, 'fa-layer-group', skinGroup);
      element.children[1].textContent = skin.label || skin.name;
      element.setAttribute('role', 'menuitemradio');
      element.dataset.skin = skin.name;
      element.disabled = true;
      element.addEventListener('click', () => {
        if (!ready || !player.skeleton.data.findSkin(skin.name)) return;
        selectedSkin = skin.name;
        applySkin(player);
        save();
        hideMenu(true);
        run();
      });
      return element;
    });
  }
  let skinButtons = makeSkinButtons();
  const pauseButton = button('暂停吉祥物动画', 'fa-pause');
  const resetButton = button('复位吉祥物', 'fa-rotate-left');
  const zoomResetButton = button('恢复原始大小', 'fa-expand');
  const closeButton = button('收起吉祥物', 'fa-xmark');
  const launcher = button('显示吉祥物', 'fa-heart', null);
  launcher.className = 'spine-mascot-launcher';
  launcher.setAttribute('aria-controls', root.id);
  launcher.setAttribute('aria-expanded', 'false');
  launcher.hidden = true;
  root.appendChild(stage);
  document.body.append(root, menu);
  function mountLauncher() {
    const toolbar = document.getElementById('rightside-config-show');
    launcher.classList.toggle('spine-mascot-launcher--floating', !toolbar);
    (toolbar || document.body).appendChild(launcher);
  }
  mountLauncher();
  // Butterfly replaces toolbar contents during PJAX navigation.
  document.addEventListener('pjax:complete', mountLauncher);

  function save() {
    preferences = { ...preferences, paused, position, skin: selectedSkin, action: selectedAction,
      models: { ...preferences.models, [config.id]: { skin: selectedSkin, action: selectedAction, scene: sceneIndex } } };
    try { localStorage.setItem(storageKey, JSON.stringify(preferences)); } catch (_) {}
  }

  function chooseModel(id) {
    const model = currentModel.choices.find(model => model.id === id);
    if (!ready || !model) return;
    if (id === config.id) { hideMenu(true); return; }
    preferences.variants = { ...preferences.variants, [currentModel.familyKey]: {
      ...preferences.variants?.[currentModel.familyKey], selected: id, [model.category]: id
    } };
    save();
    reconcile();
  }

  function refreshModel() {
    const next = selectModel();
    root.dataset.weekday = String(next.weekday || '');
    currentModel = next;
    if (next.key === config.id) { updateHeading(); return false; }
    save();
    dispose();
    zoom = 1;
    config = next.config;
    playbackSpeed = number(config.speed, .5, .1, 3);
    skins = modelSkins();
    actions = modelActions();
    selectedSkin = skins.some(item => item.name === modelPreferences().skin) ? modelPreferences().skin : config.skin;
    selectedAction = actions.some(item => item.id === modelPreferences().action && item.animation) ? modelPreferences().action : 'touch';
    sceneIndex = Math.trunc(number(modelPreferences().scene, defaultSceneIndex(), 0, Math.max(0, modelSteps().length - 1)));
    sceneBusy = false;
    root.dataset.scenePhase = '';
    if (modelSteps().length) selectedAction = actions[sceneIndex].id;
    actionButtons = makeActionButtons();
    skinButtons = makeSkinButtons();
    makeModelButtons();
    failed = false;
    root.dataset.state = '';
    root.dataset.model = next.key;
    root.dataset.family = next.familyKey;
    root.dataset.category = config.category;
    viewWidth = width;
    viewHeight = height;
    idleFrame = null;
    sceneFrame = null;
    fixedSceneFrame = null;
    scenePlacements = [];
    sceneFitFrame = null;
    name.textContent = dayLabel();
    touch.setAttribute('aria-label', `${config.name || 'Spine'} 吉祥物，点击互动，可拖动`);
    touch.title = interactionTitle();
    return true;
  }

  function watchRotation() {
    if (rotationTimer || !settings.weekly || settings.weekly.enable !== true) return;
    rotationTimer = window.setInterval(() => { if (refreshModel()) reconcile(); }, 60000);
  }

  function allowed() { return config.hide_mobile === false || !mobile.matches; }
  function updateLauncher() {
    launcher.hidden = !allowed();
    const expanded = !root.hidden;
    launcher.setAttribute('aria-expanded', String(expanded));
    launcher.title = failed ? '吉祥物加载失败，点击重试' : expanded ? '收起吉祥物' : '显示吉祥物';
    launcher.setAttribute('aria-label', launcher.title);
  }

  function geometry() {
    return framing.layout(viewWidth, viewHeight, idleFrame, document.documentElement.clientWidth, window.innerHeight, zoom, fixedSceneFrame || sceneFrame, sceneFitFrame);
  }

  function rememberPosition(left, top, box) {
    position = {
      x: (Math.max(box.minX, Math.min(box.maxX, left)) - box.minX) / (box.maxX - box.minX || 1),
      y: (Math.max(box.minY, Math.min(box.maxY, top)) - box.minY) / (box.maxY - box.minY || 1)
    };
  }

  function place() {
    const box = geometry();
    if (box.width !== placedWidth || box.height !== placedHeight) {
      clearHitArea();
      placedWidth = box.width;
      placedHeight = box.height;
    }
    root.style.setProperty('--mascot-width', `${box.width}px`);
    root.style.setProperty('--mascot-height', `${box.height}px`);
    // Keep the GPU drawing buffer within a conservative 4096-pixel limit.
    // Some portraits have large transparent action bounds: a 3x, high-DPI
    // buffer can exceed WebGL limits and shift the picture away from its hit area.
    const renderZoom = Math.min(box.zoom, 4096 / (Math.max(viewWidth, viewHeight) * (window.devicePixelRatio || 1)));
    root.style.setProperty('--mascot-render-width', `${viewWidth * renderZoom}px`);
    root.style.setProperty('--mascot-render-height', `${viewHeight * renderZoom}px`);
    root.style.setProperty('--mascot-render-scale', String(box.zoom / renderZoom));
    root.dataset.zoom = String(box.zoom);
    root.dataset.frame = JSON.stringify(box.visible);
    root.dataset.placementFrame = JSON.stringify(box.placement);
    root.dataset.placementSource = fixedSceneFrame ? 'steps' : sceneFrame ? 'alpha' : 'bounds';
    zoomLabel.textContent = `${Math.round(box.zoom * 100)}%`;
    const valid = position && Number.isFinite(position.x) && Number.isFinite(position.y);
    root.style.left = `${Math.max(box.minX, Math.min(box.maxX, valid ? box.minX + position.x * (box.maxX - box.minX) : box.maxX + policy.margin - right))}px`;
    root.style.top = `${Math.max(box.minY, Math.min(box.maxY, valid ? box.minY + position.y * (box.maxY - box.minY) : box.maxY + policy.margin - bottom))}px`;
  }

  function setZoom(value) {
    const before = root.getBoundingClientRect();
    const previous = geometry().placement;
    zoom = number(value, 1, minZoom, maxZoom);
    const box = geometry();
    // Keep the visible feet fixed; transparent interaction space may extend offscreen.
    rememberPosition(before.left + previous.x + previous.width / 2 - box.placement.x - box.placement.width / 2,
      before.top + previous.y + previous.height - box.placement.y - box.placement.height, box);
    place();
    save();
    run();
  }

  function hideMenu(restoreFocus = false) {
    menu.hidden = true;
    touch.setAttribute('aria-expanded', 'false');
    if (restoreFocus && !root.hidden) touch.focus({ preventScroll: true });
  }

  function showMenu(x, y) {
    if (!ready || root.hidden) return;
    menu.hidden = false;
    touch.setAttribute('aria-expanded', 'true');
    const rect = menu.getBoundingClientRect();
    const maxX = document.documentElement.clientWidth - rect.width - 8;
    const left = x > maxX ? root.getBoundingClientRect().left - rect.width - 8 : x;
    menu.style.left = `${Math.max(8, Math.min(left, maxX))}px`;
    menu.style.top = `${Math.max(8, Math.min(y, window.innerHeight - rect.height - 8))}px`;
    const first = menu.querySelector('button:not(:disabled)');
    if (first) first.focus({ preventScroll: true });
  }

  function applySkin(instance) {
    if (!instance.skeleton.data.findSkin(selectedSkin)) selectedSkin = config.skin;
    instance.config.skin = selectedSkin;
    instance.skeleton.setSkinByName(selectedSkin);
    instance.skeleton.setSlotsToSetupPose();
    instance.animationState.apply(instance.skeleton);
    instance.skeleton.updateWorldTransform();
    root.dataset.skin = selectedSkin;
    updateHeading();
    updateMenu(instance);
  }

  function hideModelSlots(instance) {
    const skeleton = instance.skeleton;
    const names = new Set(Array.isArray(config.hidden_slots) ? config.hidden_slots : []);
    root.dataset.hiddenSlots = '';
    if (!names.size) return;
    const hidden = skeleton.slots.filter(slot => names.has(slot.data.name));
    const modelSkins = new Set([...skeleton.data.skins, skeleton.data.defaultSkin, skeleton.skin].filter(Boolean));
    for (const slot of hidden) {
      // Attachment timelines resolve by slot index/name on every frame. Removing
      // every skin entry also keeps setup-pose and skin resets from restoring it.
      for (const skin of modelSkins) {
        const attachments = [];
        skin.getAttachmentsForSlot(slot.data.index, attachments);
        for (const attachment of attachments) skin.removeAttachment(slot.data.index, attachment.name);
      }
      slot.data.attachmentName = null;
      slot.setAttachment(null);
    }
    root.dataset.hiddenSlots = hidden.map(slot => slot.data.name).join(',');
  }

  function updateHeading() {
    const skin = skins.find(item => item.name === selectedSkin);
    name.textContent = `${dayLabel()} / ${skin ? skin.label || skin.name : selectedSkin}`;
  }

  function updateMenu(instance) {
    root.dataset.action = selectedAction;
    root.dataset.sceneStep = modelSteps()[sceneIndex]?.id || '';
    root.dataset.sceneBusy = String(sceneBusy);
    categoryButtons.forEach(element => {
      element.disabled = !ready;
      element.setAttribute('aria-checked', String(element.dataset.category === config.category));
    });
    variantButtons.forEach(element => {
      element.disabled = !ready;
      element.setAttribute('aria-checked', String(element.dataset.model === config.id));
    });
    actionGroup.parentElement.hidden = !actions.some(action => action.animation);
    actionGroup.style.setProperty('--mascot-option-count', String(Math.min(2, Math.max(1, actions.filter(action => action.animation).length))));
    skinGroup.style.setProperty('--mascot-option-count', String(Math.max(1, skins.length)));
    skinGroup.parentElement.hidden = skins.length <= 1;
    actionButtons.forEach((element, index) => {
      const action = actions[index];
      const step = modelSteps()[action.step];
      element.hidden = !action.animation;
      element.title = action.label;
      element.setAttribute('aria-label', action.label);
      element.children[1].textContent = action.label;
      element.firstElementChild.className = `fa-solid ${action.icon}`;
      element.dataset.action = action.id;
      element.disabled = !action.animation || !instance.skeleton.data.findAnimation(action.animation) ||
        (step?.idle_base && !instance.skeleton.data.findAnimation(step.idle_base)) || (modelSteps().length > 0 && sceneBusy);
      element.setAttribute('aria-checked', String(action.id === selectedAction));
    });
    skinButtons.forEach(element => {
      element.disabled = !instance.skeleton.data.findSkin(element.dataset.skin);
      element.setAttribute('aria-checked', String(element.dataset.skin === selectedSkin));
    });
  }

  function stopVoice() {
    voiceGeneration++;
    if (voicePlayer) {
      voicePlayer.pause();
      try { voicePlayer.currentTime = 0; } catch (_) {}
    }
    root.dataset.voiceState = 'idle';
  }

  function playVoice(animationName) {
    stopVoice();
    const source = config.voices && config.voices[animationName];
    const clips = (Array.isArray(source) ? source : [source]).filter(url => typeof url === 'string' && url.trim());
    if (!clips.length) return;
    const key = `${config.id}:${modelSteps().length ? 'scenes' : animationName}`;
    const index = (voicePositions.get(key) || 0) % clips.length;
    const token = voiceGeneration;
    const failedVoice = error => {
      if (token !== voiceGeneration) return;
      root.dataset.voiceState = 'error';
      console.warn('[Spine mascot] Voice playback failed', error);
    };
    try {
      if (!voicePlayer) { voicePlayer = new Audio(); voicePlayer.preload = 'none'; }
      voicePlayer.src = clips[index];
      voicePlayer.volume = number(config.voice_volume, .7, 0, 1);
      root.dataset.voice = clips[index];
      root.dataset.voiceIndex = String(index + 1);
      root.dataset.voiceState = 'loading';
      voicePlayer.onended = () => { if (token === voiceGeneration) root.dataset.voiceState = 'ended'; };
      voicePlayer.onerror = () => failedVoice(voicePlayer.error || new Error('Unable to load voice'));
      // Keep play() in the user's click event so browsers can permit sound.
      const playing = voicePlayer.play();
      voicePositions.set(key, (index + 1) % clips.length);
      if (playing && typeof playing.then === 'function') {
        playing.then(() => { if (token === voiceGeneration) root.dataset.voiceState = 'playing'; }).catch(failedVoice);
      }
    } catch (error) { failedVoice(error); }
  }

  function playAction(animationName, skinName) {
    const steps = modelSteps();
    if (steps.length && sceneBusy) return false;
    const animation = ready && animationName && player.skeleton.data.findAnimation(animationName);
    if (!animation || !player.skeleton.data.findSkin(skinName)) return false;
    const action = steps.length ? actions[sceneIndex] : actions.find(item => item.animation === animationName);
    const step = steps[sceneIndex];
    if (steps.length && (!action || !player.skeleton.data.findAnimation(action.idle) ||
        (step?.idle_base && !player.skeleton.data.findAnimation(step.idle_base)))) return false;
    const overlay = step?.interaction_track === 1;
    if (overlay && !step.idle_base) startIdle(player);
    if (action) selectedAction = action.id;
    if (steps.length) { sceneIndex = action.step; sceneBusy = true; }
    selectedSkin = skinName;
    applySkin(player);
    paused = false;
    root.dataset.scenePhase = steps.length ? 'interaction' : '';
    const entry = player.animationState.setAnimation(overlay ? 1 : 0, animationName, false);
    // Scale only this interaction; the queued idle keeps its default timeScale.
    if (entry && config.interaction_speed != null) {
      entry.timeScale = number(config.interaction_speed, playbackSpeed, .1, 3) / playbackSpeed;
    }
    const range = setEntryRange(entry, step?.interaction_range);
    if (overlay) {
      entry.mixDuration = entry.mixTime = 0;
      const instance = player, token = generation;
      entry.listener = { complete(current) {
        if (token !== generation || player !== instance || instance.animationState.getCurrent(1) !== current) return;
        startIdle(instance, true);
        applySkin(instance);
        run();
      } };
    } else {
      const idle = player.animationState.addAnimation(0, activeIdle(), true, range ? range.end - range.start : animation.duration);
      prepareIdleEntry(player, idle, step);
    }
    playVoice(animationName);
    run();
    if (steps.length) save();
    return true;
  }

  function setEntryRange(entry, requested) {
    const range = entry && framing.animationRange(entry.animation, requested);
    if (range) {
      entry.animationStart = range.start;
      entry.animationEnd = range.end;
      // Track time remains relative to the range; skip events before its start.
      entry.setAnimationLast(range.start);
    }
    return range;
  }

  function prepareIdleEntry(instance, entry, step) {
    const range = setEntryRange(entry, step?.idle_range);
    if (!range) return;
    const mix = number(step.idle_mix, 0, 0, (range.end - range.start) / 2);
    if (!mix) return;
    entry.mixDuration = mix;
    // The queue repeats this range. Clamp the outgoing entry at its endpoint
    // while mixing, so it cannot wrap to the first frame before fading out.
    entry.loop = false;
    const token = generation;
    const track = entry.trackIndex;
    const queueRepeat = current => {
      const state = instance.animationState;
      if (token !== generation || modelSteps()[sceneIndex] !== step ||
          state.getCurrent(track) !== current || current.next) return;
      // Overlap only the loop seam. Keep one successor, so a click can discard
      // the idle queue and play the rest of the same source animation once.
      const next = state.addAnimation(track, step.idle, true, range.end - range.start - mix);
      prepareIdleEntry(instance, next, step);
    };
    // Spine clears listeners when recycling entries; the idle marker cannot
    // leak into a later interaction that reuses the same TrackEntry.
    entry.listener = { start: queueRepeat, mascotIdle: true };
    if (instance.animationState.getCurrent(track) === entry) queueRepeat(entry);
  }

  function startIdle(instance, preserveBase = false) {
    compositeController?.stop();
    const step = modelSteps()[sceneIndex];
    const nextFrame = scenePlacements[sceneIndex];
    if (nextFrame && nextFrame !== fixedSceneFrame) {
      const rect = root.getBoundingClientRect(), previous = geometry().placement;
      fixedSceneFrame = nextFrame;
      const box = geometry();
      // The animation camera stays fixed; anchor each scene's own visible feet.
      rememberPosition(rect.left + previous.x + previous.width / 2 - box.placement.x - box.placement.width / 2,
        rect.top + previous.y + previous.height - box.placement.y - box.placement.height, box);
      place();
    }
    let entry = instance.animationState.getCurrent(0);
    const keepBase = step?.idle_base && preserveBase && entry?.loop && entry.animation.name === step.idle_base;
    if (!keepBase && modelSteps().some(step => step.interaction_track === 1)) {
      instance.animationState.clearTrack(1);
      instance.skeleton.setToSetupPose();
    }
    sceneBusy = false;
    root.dataset.scenePhase = modelSteps().length ? 'idle' : '';
    // Selecting a scene starts only its idle and initializes the camera viewport.
    if (!keepBase) entry = instance.setAnimation(activeBaseIdle(), true);
    if (step?.idle_base) entry = instance.animationState.setAnimation(1, activeIdle(), true);
    prepareIdleEntry(instance, entry, step);
    root.dataset.animation = activeIdle();
    updateMenu(instance);
  }

  function pauseLabel() {
    const label = paused ? '播放吉祥物动画' : '暂停吉祥物动画';
    pauseButton.title = label;
    pauseButton.setAttribute('aria-label', label);
    pauseButton.children[1].textContent = label;
    pauseButton.firstElementChild.className = `fa-solid ${paused ? 'fa-play' : 'fa-pause'}`;
  }

  // Own the render loop so hidden/paused widgets do not keep a WebGL loop alive.
  function stop() {
    window.cancelAnimationFrame(raf);
    clearTimeout(hitRetryTimer);
    hitRetryTimer = 0;
    hitUnavailable = false;
    raf = 0;
    if (player) player.pause();
    if (document.hidden) { clearTimeout(loadTimer); loadTimer = 0; }
  }

  function tick(now) {
    raf = 0;
    if (!player || root.hidden || document.hidden || failed) return;
    if (!ready && !loadTimer) {
      const token = generation;
      loadTimer = setTimeout(() => fail(new Error('Spine assets timed out'), token), 20000);
    }
    if (now - lastFrame >= frameInterval) {
      lastFrame = now;
      player.drawFrame(false);
      if (ready && (!lastHitFrame || now - lastHitFrame >= 64)) {
        lastHitFrame = now;
        updateHitArea();
      }
    }
    if (player && (!ready || !paused) && !failed) raf = window.requestAnimationFrame(tick);
  }

  function run() {
    stop();
    if (!player || root.hidden || document.hidden || failed) return;
    lastFrame = 0;
    lastHitFrame = 0;
    player.time.update();
    if (!paused) player.play();
    raf = window.requestAnimationFrame(tick);
    pauseLabel();
  }

  function dispose() {
    hideMenu();
    stopVoice();
    generation++;
    stop();
    clearTimeout(loadTimer);
    loadTimer = 0;
    compositeController?.stop();
    compositeController = null;
    if (player) player.dispose();
    player = null;
    ready = false;
    touch.disabled = true;
    [...categoryButtons, ...variantButtons, ...actionButtons, ...skinButtons].forEach(element => { element.disabled = true; });
    root.dataset.state = 'idle';
    host.replaceChildren();
    clearHitArea();
    hitCanvas = hitContext = null;
    hitUnavailable = false;
    hitWarned = false;
    sceneFrame = null;
    fixedSceneFrame = null;
    scenePlacements = [];
    sceneFitFrame = null;
    sceneBusy = false;
    setSceneEdgeMask(null);
    root.dataset.sceneBusy = 'false';
  }

  function clearHitArea(state = '') {
    touch.style.clipPath = emptyHitPath;
    root.dataset.hitTest = state;
    lastHitFrame = 0;
  }

  function updateHitArea() {
    if (hitUnavailable || !window.BlogSpineMascotFraming || !player.canvas.width || !player.canvas.height) return;
    try {
      if (!hitCanvas) {
        hitCanvas = document.createElement('canvas');
        hitContext = hitCanvas.getContext('2d', { willReadFrequently: true });
      }
      if (!hitContext) throw new Error('2D hit-test context unavailable');
      const rect = root.getBoundingClientRect();
      const scale = Math.min(.5, 512 / Math.max(rect.width, rect.height));
      const columns = Math.max(1, Math.round(rect.width * scale));
      const rows = Math.max(1, Math.round(rect.height * scale));
      hitCanvas.width = columns;
      hitCanvas.height = rows;
      hitContext.drawImage(player.canvas, 0, 0, columns, rows);
      const pixels = hitContext.getImageData(0, 0, columns, rows).data;
      touch.style.clipPath = window.BlogSpineMascotFraming.hitPath(pixels, columns, rows, rect.width, rect.height, sceneEdgeMask);
      root.dataset.hitTest = 'alpha';
      hitWarned = false;
      const entry = player.animationState.getCurrent(activeIdleTrack());
      if (config.category === 'scene' && !fixedSceneFrame && idleFrame && entry?.animation.name === activeIdle() &&
        !(entry.mixingFrom && entry.mixTime < entry.mixDuration)) {
        const next = framing.pixelFrame(pixels, columns, rows, viewWidth, viewHeight, sceneFrame);
        if (next && (!sceneFrame || ['x', 'y', 'width', 'height'].some(key => next[key] !== sceneFrame[key]))) {
          sceneFrame = next;
          if (position) rememberPosition(rect.left, rect.top, geometry());
          place();
        }
      }
    } catch (error) {
      hitUnavailable = true;
      clearHitArea('unavailable');
      hitCanvas = hitContext = null;
      if (!hitWarned) console.warn('[Spine mascot] Pixel hit area unavailable', error);
      hitWarned = true;
      const token = generation;
      // Retry even when the animation is paused; never fall back to a blocking rectangle.
      hitRetryTimer = setTimeout(() => {
        hitRetryTimer = 0;
        if (token !== generation) return;
        hitUnavailable = false;
        run();
      }, 1000);
    }
  }

  function fail(error, token) {
    if (token !== generation) return;
    failed = true;
    dispose();
    root.hidden = true;
    root.dataset.state = 'error';
    updateLauncher();
    console.warn('[Spine mascot]', error);
  }

  function loadRuntime() {
    if (window.spine && window.spine.SpinePlayer) return Promise.resolve(window.spine);
    if (runtimePromise) return runtimePromise;
    runtimePromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      const timer = setTimeout(() => finish(new Error('Spine runtime timed out')), 20000);
      function finish(error) {
        clearTimeout(timer);
        script.onload = script.onerror = null;
        if (error) { script.remove(); runtimePromise = null; reject(error); }
        else resolve(window.spine);
      }
      script.src = config.runtime;
      script.async = true;
      script.onload = () => finish(window.spine && window.spine.SpinePlayer ? null : new Error('Spine runtime unavailable'));
      script.onerror = () => finish(new Error('Spine runtime failed to load'));
      document.head.appendChild(script);
    });
    return runtimePromise;
  }

  async function load() {
    const token = ++generation;
    const started = Date.now();
    root.dataset.state = 'loading';
    failed = false;
    loadTimer = setTimeout(() => fail(new Error('Spine assets timed out'), token), 20000);
    try {
      const spine = await loadRuntime();
      if (token !== generation || closed || !allowed()) return;
      const assets = window.BlogSpineMascotAssets ? await window.BlogSpineMascotAssets.prepare(config, spine) : null;
      if (token !== generation || closed || !allowed()) return;
      root.dataset.cache = assets ? assets.source : 'http';
      const onError = (_instance, message) => queueMicrotask(() => fail(new Error(String(message)), token));
      player = new spine.SpinePlayer(host, {
        [/\.json(?:\?|$)/i.test(config.skeleton) ? 'jsonUrl' : 'binaryUrl']: config.skeleton,
        atlasUrl: config.atlas,
        rawDataURIs: assets ? assets.rawDataURIs : undefined,
        animation: activeBaseIdle(),
        skin: config.skin,
        showControls: false,
        showLoading: false,
        alpha: true,
        backgroundColor: '00000000',
        premultipliedAlpha: config.premultiplied_alpha !== false,
        defaultMix: .15,
        viewport: { padLeft: `${policy.padding * 100}%`, padRight: `${policy.padding * 100}%`, padTop: `${policy.padding * 100}%`, padBottom: `${policy.padding * 100}%`, transitionTime: 0, animations: {} },
        success(instance) {
          if (token !== generation) return;
          clearTimeout(loadTimer);
          loadTimer = 0;
          hideModelSlots(instance);
          if (Array.isArray(config.composites) && config.composites.length) {
            if (!window.BlogSpineMascotComposites) throw new Error('Mascot composite helper unavailable');
            compositeController = window.BlogSpineMascotComposites.install(instance, spine, config.composites, skins);
          }
          if (!actions.some(action => action.id === selectedAction && action.animation && instance.skeleton.data.findAnimation(action.animation))) {
            selectedAction = actions.find(action => action.animation && instance.skeleton.data.findAnimation(action.animation))?.id || 'touch';
          }
          const measured = framing.measure(instance, spine, skins, config);
          setSceneEdgeMask(measured?.edgeMask);
          if (measured) {
            const { bounds, idle } = measured;
            const padding = measured.padding ?? policy.padding;
            Object.assign(instance.config.viewport, bounds);
            for (const side of ['padLeft', 'padRight', 'padTop', 'padBottom']) instance.config.viewport[side] = `${padding * 100}%`;
            const dimensions = framing.fit(bounds, width, height, idle.height, policy.idleHeight, padding);
            if (dimensions) {
              viewWidth = dimensions.width;
              viewHeight = dimensions.height;
              idleFrame = framing.project(idle, bounds, viewWidth, viewHeight, padding);
              fixedSceneFrame = measured.placement ? framing.project(measured.placement, bounds, viewWidth, viewHeight, padding) : null;
              scenePlacements = Array.isArray(measured.placements) ? measured.placements.map(frame => frame
                ? framing.project(frame, bounds, viewWidth, viewHeight, padding) : fixedSceneFrame) : [];
              sceneFitFrame = scenePlacements.length ? fixedSceneFrame : null;
              fixedSceneFrame = scenePlacements[sceneIndex] || fixedSceneFrame;
              root.dataset.idleHeight = String(Number(idleFrame.height.toFixed(3)));
              place();
            }
          }
          instance.skeleton.setToSetupPose();
          startIdle(instance);
          applySkin(instance);
          instance.speed = playbackSpeed;
          root.dataset.speed = String(playbackSpeed);
          if (paused) instance.pause(); else instance.play();
          ready = true;
          updateMenu(instance);
          touch.disabled = false;
          root.dataset.state = 'ready';
          root.dataset.loadMs = String(Date.now() - started);
          root.dataset.playerGeneration = String(token);
          instance.animationState.addListener({ start(entry) {
            if (token !== generation) return;
            lastHitFrame = 0;
            root.dataset.animation = entry.animation.name;
            // A range-based scene can use one animation for both phases.
            if (entry.trackIndex === activeIdleTrack() && (entry.loop || entry.listener?.mascotIdle === true) && entry.animation.name === activeIdle()) {
              sceneBusy = false;
              root.dataset.scenePhase = modelSteps().length ? 'idle' : '';
            }
            updateMenu(instance);
          } });
        },
        error: onError
      });
      // This context belongs to this player. Convert straight-alpha textures
      // during the asynchronous upload when a model needs PMA blend modes
      // (notably Multiply); changing only the draw flag causes bright edges.
      if (config.premultiply_textures === true) {
        const gl = player.context.gl;
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      }
      player.stopRendering();
      player.canvas.addEventListener('webglcontextlost', () => fail(new Error('WebGL context lost'), token), { once: true });
      run();
    } catch (error) { fail(error, token); }
  }

  function reconcile() {
    refreshModel();
    hideMenu();
    const visible = allowed() && !closed && !failed;
    root.hidden = !visible;
    updateLauncher();
    if (!visible) {
      stopVoice();
      compositeController?.stop();
      // A closed desktop widget can reuse decoded textures; mobile/page exit still disposes them.
      if (closed && allowed() && !failed && ready && player) stop();
      else if (player || root.dataset.state === 'loading') dispose();
      return;
    }
    place();
    if (document.hidden) { stopVoice(); stop(); return; }
    if (ready && player) root.dataset.state = 'ready';
    if (!player && root.dataset.state !== 'loading') load();
    else run();
  }

  function interact() {
    const steps = modelSteps();
    if (steps.length && sceneBusy) return;
    const action = steps.length ? actions[sceneIndex] : actions.find(item => item.id === selectedAction);
    if (!ready || paused || !action || !action.animation || !player.skeleton.data.findAnimation(action.animation)) return;
    const entry = player.animationState.getCurrent(activeIdleTrack());
    if (entry && (entry.animation.name !== activeIdle() || (steps.length && !entry.loop && entry.listener?.mascotIdle !== true))) return;
    playAction(action.animation, selectedSkin);
  }

  touch.addEventListener('pointerdown', event => {
    if (event.button !== 0 || drag) return;
    hideMenu();
    const rect = root.getBoundingClientRect();
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, left: rect.left, top: rect.top, moved: false };
    touch.setPointerCapture(event.pointerId);
  });
  touch.addEventListener('pointermove', event => {
    if (!drag || drag.id !== event.pointerId) return;
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 5) return;
    drag.moved = true;
    root.classList.add('is-dragging');
    rememberPosition(drag.left + dx, drag.top + dy, geometry());
    place();
  });
  function endDrag(event) {
    if (!drag || drag.id !== event.pointerId) return;
    suppressClick = drag.moved;
    if (drag.moved) save();
    drag = null;
    root.classList.remove('is-dragging');
    if (touch.hasPointerCapture(event.pointerId)) touch.releasePointerCapture(event.pointerId);
  }
  touch.addEventListener('pointerup', endDrag);
  touch.addEventListener('pointercancel', endDrag);
  touch.addEventListener('click', () => { if (suppressClick) suppressClick = false; else interact(); });
  touch.addEventListener('wheel', event => {
    if (!ready || drag || event.deltaY === 0) return;
    event.preventDefault();
    event.stopPropagation();
    hideMenu();
    const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? height : 1);
    setZoom(geometry().zoom * Math.exp(-Math.max(-120, Math.min(120, delta)) * .0015));
  }, { passive: false });
  touch.addEventListener('contextmenu', event => {
    event.preventDefault();
    event.stopPropagation();
    showMenu(event.clientX, event.clientY);
  });
  touch.addEventListener('keydown', event => {
    if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return;
    event.preventDefault();
    const rect = root.getBoundingClientRect();
    showMenu(rect.left + rect.width / 2, rect.top + rect.height / 2);
  });
  menu.addEventListener('contextmenu', event => { event.preventDefault(); event.stopPropagation(); });
  menu.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); hideMenu(true); return; }
    if (event.key === 'Tab') { hideMenu(true); return; }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const items = Array.from(menu.querySelectorAll('button:not(:disabled)'));
    const index = items.indexOf(document.activeElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    if (items[next]) items[next].focus();
  });
  document.addEventListener('pointerdown', event => { if (!menu.hidden && !menu.contains(event.target)) hideMenu(); });
  document.addEventListener('scroll', event => { if (!menu.contains(event.target)) hideMenu(); }, true);
  document.addEventListener('pjax:send', () => { hideMenu(); stopVoice(); });
  pauseButton.addEventListener('click', () => { paused = !paused; if (paused) stopVoice(); save(); pauseLabel(); hideMenu(true); run(); });
  resetButton.addEventListener('click', () => { position = null; save(); place(); hideMenu(true); });
  zoomResetButton.addEventListener('click', () => { setZoom(1); hideMenu(true); });
  function hideMascot() {
    closed = true;
    save();
    reconcile();
    launcher.focus();
  }
  function showMascot() {
    closed = false;
    failed = false;
    root.dataset.state = '';
    if (ready && player) {
      sceneBusy = false;
      startIdle(player);
      applySkin(player);
    }
    save();
    reconcile();
    touch.focus({ preventScroll: true });
  }
  closeButton.addEventListener('click', hideMascot);
  launcher.addEventListener('click', () => { if (closed || failed) showMascot(); else hideMascot(); });
  window.addEventListener('resize', () => { hideMenu(); if (!root.hidden) { place(); run(); } });
  document.addEventListener('visibilitychange', reconcile);
  mobile.addEventListener('change', reconcile);
  reducedMotion.addEventListener('change', () => { if (reducedMotion.matches) { paused = true; stopVoice(); pauseLabel(); run(); } });
  window.addEventListener('pagehide', () => {
    window.clearInterval(rotationTimer); rotationTimer = 0;
    dispose(); root.dataset.state = '';
  });
  window.addEventListener('pageshow', event => { if (event.persisted) { watchRotation(); reconcile(); } });
  window.BlogSpineMascot = { show: showMascot, hide: hideMascot };
  pauseLabel();
  // This element lives outside Butterfly's PJAX replacement containers.
  const start = () => {
    watchRotation();
    if (window.requestIdleCallback) window.requestIdleCallback(reconcile, { timeout: 300 }); else setTimeout(reconcile, 0);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true }); else start();
})();
