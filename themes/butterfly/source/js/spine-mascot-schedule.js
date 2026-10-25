(() => {
  'use strict';
  const weekdays = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  const forcedDay = value => {
    const day = typeof value === 'number' || typeof value === 'string' ? Number(value) : 0;
    return Number.isInteger(day) && day >= 1 && day <= 7 ? day : 0;
  };

  const complete = model => model && model.id && model.skeleton && model.atlas && model.idle;
  const defaultsFor = settings => ({
    premultiplied_alpha: settings.premultiplied_alpha,
    framing: settings.framing,
    texture_base: settings.texture_base || '', texture_urls: null,
    interaction: '', attack: '',
    interaction_label: settings.interaction_label || '互动',
    speed: settings.speed ?? .5
  });
  function modelDefaults(model, defaults) {
    model = model || {};
    const skin = model.skin || 'default';
    const result = { ...defaults, ...model,
      skin,
      skins: Array.isArray(model.skins) ? model.skins : [{ name: skin, label: skin === 'default' ? '默认' : skin }],
      interaction: model.interaction || '', attack: model.attack || '',
      interaction_label: model.interaction_label || defaults.interaction_label,
      speed: model.speed ?? defaults.speed
    };
    delete result.width;
    delete result.height;
    return result;
  }

  function modelChoices(candidates, menuOrder) {
    const choices = candidates.map(model => ({ id: model.id,
      label: (typeof model.name === 'string' ? model.name.split('·')[0].trim() : '') || model.label || model.id,
      category: model.category === 'scene' ? 'scene' : 'character'
    }));
    const groupKey = choice => `${choice.category}\0${choice.label}`;
    const counts = new Map(), seen = new Map();
    for (const choice of choices) counts.set(groupKey(choice), (counts.get(groupKey(choice)) || 0) + 1);
    const order = Array.isArray(menuOrder) ? menuOrder : [];
    const rank = id => { const index = order.indexOf(id); return index < 0 ? order.length : index; };
    // Number in menu order, keeping selection and fallback order unchanged.
    for (const choice of [...choices].sort((a, b) => rank(a.id) - rank(b.id))) {
      const key = groupKey(choice), number = (seen.get(key) || 0) + 1;
      seen.set(key, number);
      if (counts.get(key) > 1) choice.label += ` ${number}`;
    }
    return choices;
  }

  function normalize(settings) {
    const weekly = settings.weekly || {};
    const days = weekly.days || {};
    if (settings.id && !Object.values(days).some(day => day && typeof day === 'object')) return settings;
    const resolve = (day, visited = new Set()) => {
      if (visited.has(String(day))) return null;
      visited.add(String(day));
      const entry = days[day];
      if (!entry || typeof entry !== 'object') return null;
      if (!entry.use) return entry;
      const target = resolve(entry.use, visited);
      return target ? { ...target, ...entry } : null;
    };
    const defaults = defaultsFor(settings);
    const models = {}, schedule = {};
    for (let day = 1; day <= 7; day++) {
      const model = resolve(day);
      if (!complete(model)) continue;
      models[model.id] = modelDefaults(model, defaults);
      // Resolve variant defaults before the first day's model becomes the fallback.
      // Otherwise that model's alpha mode can leak into unrelated weekdays.
      if (Array.isArray(model.variants)) {
        models[model.id].variants = model.variants.map(variant => modelDefaults(variant, defaults));
      }
      schedule[day] = model.id;
    }
    const fallback = Object.values(models)[0];
    if (!fallback) return { ...settings, enable: false, weekly: { ...weekly, days: {} }, models: {} };
    const normalized = { ...settings, ...fallback,
      speed: defaults.speed, premultiplied_alpha: defaults.premultiplied_alpha,
      interaction_label: defaults.interaction_label,
      use: forcedDay(settings.use), weekly: { ...weekly, days: schedule }, models };
    delete normalized.width;
    delete normalized.height;
    return normalized;
  }

  function select(settings, date = new Date(), selectedId) {
    settings = { ...normalize(settings) };
    delete settings.width;
    delete settings.height;
    const weekly = settings.weekly || {};
    let formatter;
    try { formatter = new Intl.DateTimeFormat('en-US', { timeZone: weekly.timezone || 'Asia/Shanghai', weekday: 'short' }); }
    catch (_) { formatter = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Shanghai', weekday: 'short' }); }
    const preview = forcedDay(settings.use);
    const weekday = preview || weekdays[formatter.format(date)];
    const fallback = settings.id || 'default';
    const scheduled = (preview || weekly.enable === true) && weekly.days && weekly.days[weekday];
    const scheduledModel = scheduled && settings.models && settings.models[scheduled];
    const familyKey = scheduled === fallback || !scheduledModel || !scheduledModel.skeleton || !scheduledModel.atlas || !scheduledModel.idle ? fallback : scheduled;
    const base = settings.models?.[familyKey] || settings;
    const candidates = [{ ...base, id: familyKey }, ...(Array.isArray(base.variants) ? base.variants : [])]
      .map(model => modelDefaults(model, defaultsFor(settings)))
      .filter((model, index, models) => complete(model) && models.findIndex(other => other.id === model.id) === index);
    const category = model => model.category === 'scene' ? 'scene' : 'character';
    const choices = modelChoices(candidates, base.menu_order);
    const model = candidates.find(model => model.id === selectedId) || candidates.find(model => category(model) === 'character') || candidates[0];
    if (!model) return { weekday, key: fallback, familyKey, choices, config: { ...settings, id: fallback, category: 'character' } };
    const key = model.id;
    if (key === fallback) {
      const config = { ...settings, ...model, use: preview, id: key, category: category(model) };
      delete config.width;
      delete config.height;
      return { weekday, key, familyKey, choices, config };
    }
    const skin = model.skin || 'default';
    return { weekday, key, familyKey, choices, config: {
      ...settings,
      id: key,
      name: model.name || base.name || key,
      category: category(model),
      skeleton: model.skeleton,
      atlas: model.atlas,
      texture_base: model.texture_base ?? settings.texture_base ?? '',
      texture_urls: model.texture_urls || null,
      skin,
      preference_aliases: Array.isArray(model.preference_aliases) ? model.preference_aliases : [],
      skins: model.skins,
      idle: model.idle,
      interaction: model.interaction || '',
      attack: model.attack || '',
      interaction_label: model.interaction_label || settings.interaction_label || '互动',
      attack_label: model.attack_label || settings.attack_label || '互动',
      attack_icon: model.attack_icon || 'fa-heart',
      speed: model.speed ?? settings.speed ?? .5,
      interaction_speed: model.interaction_speed ?? null,
      voices: model.voices || null,
      voice_volume: model.voice_volume ?? settings.voice_volume ?? .7,
      scene_steps: Array.isArray(model.scene_steps) ? model.scene_steps : null,
      composites: Array.isArray(model.composites) ? model.composites : [],
      hidden_slots: Array.isArray(model.hidden_slots) ? model.hidden_slots : [],
      scene_crop: model.scene_crop || null,
      scene_feather: model.scene_feather || null,
      framing: model.framing || 'actions',
      premultiply_textures: model.premultiply_textures === true,
      premultiplied_alpha: (model.premultiplied_alpha ?? settings.premultiplied_alpha) !== false
    } };
  }

  window.BlogSpineMascotSchedule = Object.freeze({ select, normalize });
})();
