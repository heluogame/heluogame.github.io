/*
 * Verified BD2 composites for 021391, 021301, 004192 and 004302, cutscene only.
 * Source schedules and separate-skeleton overlay behavior:
 * https://github.com/Jelosus2/BD2-L2D-Viewer/blob/main/src/utils/cutscene_mappings.ts
 * https://github.com/Jelosus2/BD2-L2D-Viewer/blob/main/src/components/SpineViewer.vue
 * Reference project copyright (c) 2025 Jelosus2, MIT; see docs/REFERENCE-LICENSE.txt.
 * This implementation does not fetch resources or implement unverified cross-model composites.
 *
 * Integration with SpinePlayer 4.1:
 *   const composite = ShelfComposites.create(player, definition, { spine, loop: true });
 *   config.frame = (_player, playDelta) => composite.update(playDelta);
 *   config.draw = () => composite.draw();
 * frame's delta already includes player.speed and becomes zero while player.paused.
 * draw runs AFTER SpinePlayer's renderer.end(), clears its normal skeleton output,
 * and draws the independently posed composite layers using the player's camera.
 * The main player, its animation state, camera, RAF and textures remain owned by the caller.
 * Set the camera viewport from composite.bounds, and use composite.time/duration for UI.
 * Seek explicitly clamps to the endpoint; a positive update wraps only if loop is true.
 * dispose() releases only composite state, never shared textures or the player.
 * options.beforeDraw(skeleton) may temporarily hide slots for each independent
 * layer. If it returns a restore function, that function runs in finally after
 * the layer draw, including when the renderer throws. Bounds sampling is unaffected.
 */
(function (root) {
  'use strict';

  function freezeDefinition(value) {
    for (const layer of value.layers) {
      for (const segment of layer) Object.freeze(segment);
      Object.freeze(layer);
    }
    Object.freeze(value.layers);
    return Object.freeze(value);
  }

  const DEFINITIONS = Object.freeze({
    '021391': Object.freeze([
    freezeDefinition({
      charId: '021391', name: 'cut_B_all', duration: 2.51,
      layers: [
        [{ animation: 'cut_B', start: 0, duration: 2.51 }],
        [{ animation: 'cut_B_coat', start: 0, duration: 2.5 }],
      ],
    }),
    freezeDefinition({
      charId: '021391', name: 'cut_all', duration: 8.01,
      layers: [
        [{ animation: 'cut_A', start: 0, duration: 5.5 }, { animation: 'cut_B', start: 5.5, duration: 2.51 }],
        [{ animation: 'cut_B_coat', start: 5.5, duration: 2.5 }],
      ],
    }),
    ]),
    '021301': Object.freeze([
      freezeDefinition({
        charId: '021301', name: 'cut_all', duration: 6.9,
        layers: [[{ animation: 'cut_A', start: 0, duration: 3.9 }, { animation: 'cut_B', start: 3.9, duration: 3 }]],
      }),
    ]),
    '004192': Object.freeze([
      freezeDefinition({
        charId: '004192', name: 'cut_all', duration: 8,
        layers: [[{ animation: 'A_cut', start: 0, duration: 4 }, { animation: 'B_cut', start: 4, duration: 4 }]],
      }),
    ]),
    '004302': Object.freeze([
      freezeDefinition({
        // Full cut_A duration from the original 4.1.11 binary; cut_B is truncated.
        charId: '004302', name: 'cut_all', duration: 4.1666669845581055 + 3.5,
        layers: [[{ animation: 'cut_A', start: 0, duration: 4.1666669845581055 }, { animation: 'cut_B', start: 4.1666669845581055, duration: 3.5 }]],
      }),
    ]),
  });

  function getDefinitions(charId, type) {
    return type === 'cutscene' ? (DEFINITIONS[String(charId)] || []).slice() : [];
  }

  function create(player, definition, options = {}) {
    const spine = options.spine || root.spine;
    const name = typeof definition === 'string' ? definition : definition?.name;
    // Definitions carry character identity because cut_all exists for both models.
    // Bare names retain the original 021391 API; new callers should pass a definition.
    const charId = String((typeof definition === 'object' && definition?.charId) || options.charId || '021391');
    const schedule = DEFINITIONS[charId]?.find(item => item.name === name);
    if (!schedule) throw new Error(`Unsupported composite animation: ${name || '(missing)'}`);
    if (!spine?.Skeleton || !spine?.AnimationState || !spine?.AnimationStateData || !spine?.Vector2) {
      throw new Error('Spine 4.1 runtime is required for composite playback.');
    }
    const source = player?.skeleton, data = source?.data;
    if (!data) throw new Error('Load a cutscene skeleton before creating a composite player.');
    for (const segment of schedule.layers.flat()) {
      const animation = data.animations.find(item => item.name === segment.animation);
      if (!animation) throw new Error(`Composite ${schedule.name} requires animation ${segment.animation}.`);
      if (!Number.isFinite(animation.duration) || animation.duration + 1e-4 < segment.duration) {
        throw new Error(`Animation ${segment.animation} is shorter than the verified composite segment.`);
      }
    }

    let elapsed = 0, loop = options.loop !== false, disposed = false, bounds;
    let skinName = options.skin || source.skin?.name || data.defaultSkin?.name || data.skins?.[0]?.name;
    const layers = schedule.layers.map(segments => {
      const skeleton = new spine.Skeleton(data);
      const stateData = new spine.AnimationStateData(data);
      stateData.defaultMix = 0;
      const animationState = new spine.AnimationState(stateData);
      for (const key of ['x', 'y', 'scaleX', 'scaleY']) {
        if (Number.isFinite(source[key])) skeleton[key] = source[key];
      }
      return { segments, skeleton, animationState, active: false, segment: null };
    });

    function assertActive() {
      if (disposed) throw new Error('This composite player has been disposed.');
    }

    function applySkin() {
      if (skinName && !data.skins.some(skin => skin.name === skinName)) throw new Error(`Unknown skin: ${skinName}`);
      for (const layer of layers) {
        if (skinName) layer.skeleton.setSkinByName(skinName);
        layer.skeleton.setSlotsToSetupPose();
      }
    }

    function segmentAt(segments, time) {
      // Prefer the next scene at an exact boundary (cut_A -> cut_B at 5.5 s).
      for (let index = segments.length - 1; index >= 0; index--) {
        const segment = segments[index];
        if (time >= segment.start && time <= segment.start + segment.duration + 1e-8) return segment;
      }
      return null;
    }

    function pose(time) {
      for (const layer of layers) {
        const { skeleton, animationState } = layer;
        const segment = segmentAt(layer.segments, time);
        layer.active = Boolean(segment); layer.segment = segment;
        animationState.clearTracks();
        skeleton.setToSetupPose();
        if (segment) {
          const entry = animationState.setAnimation(0, segment.animation, false);
          const localTime = Math.max(0, Math.min(segment.duration, time - segment.start));
          entry.mixDuration = 0; entry.mixTime = 0;
          entry.animationEnd = segment.duration;
          entry.trackTime = localTime; entry.trackLast = localTime; entry.nextTrackLast = localTime;
          animationState.apply(skeleton);
        }
        skeleton.updateWorldTransform();
      }
    }

    function sampleBounds() {
      // At most 3 segments * 9 points (+ boundaries); no per-frame geometry scan.
      // This is a sampled camera envelope, not a mathematically exact extrema solver.
      const times = new Set([0, schedule.duration]);
      for (const segment of schedule.layers.flat()) {
        for (let sample = 0; sample <= 8; sample++) times.add(segment.start + segment.duration * sample / 8);
        if (segment.start > 0) times.add(segment.start - 1e-5);
        times.add(Math.max(segment.start, segment.start + segment.duration - 1e-5));
      }
      let left = Infinity, bottom = Infinity, right = -Infinity, top = -Infinity;
      const offset = new spine.Vector2(), size = new spine.Vector2();
      for (const time of times) {
        pose(time);
        for (const layer of layers) {
          if (!layer.active) continue;
          layer.skeleton.getBounds(offset, size);
          if (![offset.x, offset.y, size.x, size.y].every(Number.isFinite) || size.x < 0 || size.y < 0) continue;
          left = Math.min(left, offset.x); bottom = Math.min(bottom, offset.y);
          right = Math.max(right, offset.x + size.x); top = Math.max(top, offset.y + size.y);
        }
      }
      pose(elapsed);
      if (![left, bottom, right, top].every(Number.isFinite) || right <= left || top <= bottom) {
        throw new Error('The composite has no finite drawable bounds for this skin.');
      }
      // A small margin protects sampled in-between poses without making the model tiny.
      const marginX = (right - left) * .03, marginY = (top - bottom) * .03;
      return Object.freeze({ x: left - marginX, y: bottom - marginY, width: right - left + 2 * marginX, height: top - bottom + 2 * marginY });
    }

    applySkin();
    bounds = sampleBounds();

    const controller = {
      get charId() { return schedule.charId; },
      get name() { return schedule.name; },
      get duration() { return schedule.duration; },
      get time() { return elapsed; },
      get bounds() { return bounds; },
      get loop() { return loop; },
      set loop(value) { loop = Boolean(value); },
      get finished() { return !loop && elapsed >= schedule.duration; },
      get disposed() { return disposed; },
      seek(seconds) {
        assertActive();
        if (!Number.isFinite(seconds)) throw new Error('Composite seek time must be finite.');
        elapsed = Math.max(0, Math.min(schedule.duration, seconds)); pose(elapsed);
        return elapsed;
      },
      update(delta) {
        assertActive();
        if (!Number.isFinite(delta) || delta < 0) throw new Error('Composite delta must be finite and nonnegative.');
        if (delta === 0) return elapsed;
        const next = elapsed + delta;
        elapsed = loop ? next % schedule.duration : Math.min(schedule.duration, next);
        pose(elapsed); return elapsed;
      },
      setSkin(name) {
        assertActive();
        if (!data.skins.some(skin => skin.name === name)) throw new Error(`Unknown skin: ${name}`);
        skinName = name; applySkin(); bounds = sampleBounds();
        return bounds;
      },
      draw(drawOptions = {}) {
        assertActive();
        const renderer = player.sceneRenderer;
        if (!renderer) throw new Error('The player has no scene renderer.');
        const gl = player.context?.gl || renderer.context?.gl;
        if (drawOptions.clear !== false && gl) {
          gl.clearColor(0, 0, 0, 0);
          gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
        }
        const premultiplied = options.premultipliedAlpha ?? player.config?.premultipliedAlpha ?? true;
        renderer.begin();
        let count = 0;
        try {
          for (const layer of layers) {
            if (!layer.active) continue;
            let restore;
            try {
              restore = options.beforeDraw?.(layer.skeleton);
              renderer.drawSkeleton(layer.skeleton, premultiplied); count++;
            } finally {
              if (typeof restore === 'function') restore();
            }
          }
        } finally { renderer.end(); }
        return count;
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        for (const layer of layers) layer.animationState.clearTracks();
        layers.length = 0;
      },
    };
    return controller;
  }

  root.ShelfComposites = Object.freeze({ getDefinitions, create });
})(typeof window !== 'undefined' ? window : globalThis);

// Blog adapter: native TrackEntry time owns playback; these layers own no RAF.
// The reference implementation's MIT notice is in spine-mascot-composites.LICENSE.txt.
(function (root) {
  'use strict';
  function install(player, spine, requested, skins) {
    const library = root.ShelfComposites, definitions = new Map();
    for (const item of requested) {
      const definition = library.getDefinitions(item.charId, 'cutscene').find(entry => entry.name === item.name);
      if (!definition) throw new Error(`Unknown mascot composite: ${item.name}`);
      let bounds = null;
      for (const skin of skins) {
        const probe = library.create(player, definition, { spine, loop: false, skin: skin.name });
        try {
          const next = probe.bounds;
          if (!bounds) bounds = { ...next };
          else {
            const x = Math.min(bounds.x, next.x), y = Math.min(bounds.y, next.y);
            bounds = { x, y, width: Math.max(bounds.x + bounds.width, next.x + next.width) - x,
              height: Math.max(bounds.y + bounds.height, next.y + next.height) - y };
          }
        } finally { probe.dispose(); }
      }
      const existing = player.skeleton.data.findAnimation(definition.name);
      if (existing && !existing.mascotComposite) throw new Error(`Composite conflicts with native animation: ${definition.name}`);
      const animation = existing || new spine.Animation(definition.name, [], definition.duration);
      animation.mascotComposite = { definition, bounds };
      if (!existing) player.skeleton.data.animations.push(animation);
      definitions.set(definition.name, animation.mascotComposite);
    }
    const calculate = player.calculateAnimationViewport;
    player.calculateAnimationViewport = function (animation, viewport) {
      const composite = definitions.get(animation.name);
      if (composite) Object.assign(viewport, composite.bounds);
      else calculate.call(this, animation, viewport);
    };
    let active = null, activeDefinition = null, activeSkin = null;
    function stop() {
      active?.dispose();
      active = activeDefinition = activeSkin = null;
    }
    function sync() {
      const entry = player.animationState.getCurrent(0), composite = entry && definitions.get(entry.animation.name);
      if (!composite) { stop(); return; }
      const skin = player.skeleton.skin?.name;
      if (composite.definition !== activeDefinition || skin !== activeSkin) {
        stop();
        active = library.create(player, composite.definition, { spine, loop: false, skin });
        activeDefinition = composite.definition;
        activeSkin = skin;
      }
      active.seek(entry.getAnimationTime());
    }
    // Empty virtual timelines must not blend the return idle toward setup pose.
    player.animationState.addListener({ start(entry) {
      if (definitions.has(entry.animation.name) || definitions.has(entry.mixingFrom?.animation.name)) {
        entry.mixDuration = entry.mixTime = 0;
      }
      if (entry.trackIndex === 0 && !definitions.has(entry.animation.name)) stop();
    } });
    const update = player.config.update, draw = player.config.draw;
    // Runtime update runs AFTER native AnimationState.update/apply; frame runs before.
    player.config.update = (instance, delta) => { update?.(instance, delta); sync(); };
    player.config.draw = (instance, delta) => { draw?.(instance, delta); active?.draw(); };
    return { stop };
  }
  root.BlogSpineMascotComposites = Object.freeze({ install });
})(typeof window !== 'undefined' ? window : globalThis);
