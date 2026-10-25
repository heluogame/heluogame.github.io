(() => {
  'use strict';

  // Shared display rules must not drift with individual model configuration.
  const policy = Object.freeze({ idleHeight: 270, minZoom: .6, maxZoom: 3, padding: .02, margin: 8, fallbackWidth: 200, fallbackHeight: 280 });
  const valid = bounds => bounds && [bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite) && bounds.width > 0 && bounds.height > 0;
  const sides = ['left', 'right', 'top', 'bottom'];
  const validFeather = feather => feather && sides.every(side => Number.isFinite(feather[side]) && feather[side] >= 0) && sides.some(side => feather[side] > 0);
  const validEdgeMask = mask => validFeather(mask) && mask.left + mask.right < 1 && mask.top + mask.bottom < 1;
  // Original B_BG_black strip: 56 texture rows; the feather mesh spans 34.5788555.
  // Invert the sampled alpha so the authored dark matte becomes page transparency.
  // Both CSS and hit testing interpolate these same outer-to-inner stops.
  const matteAlpha = [0, 0, 0, 0, 0, 0, 1, 2, 7, 11, 18, 27, 36, 51, 64, 82, 100, 128, 151, 178, 196, 214, 228, 241, 244, 251, 252, 255, 255];
  const featherProfile = [[0, 0], ...matteAlpha.map((alpha, row) => [1 - (row + .5) / 34.57885551452637, 1 - alpha / 255]).reverse(), [1, 1]];

  function featherAlpha(distance) {
    if (distance <= 0) return 0;
    if (distance >= 1) return 1;
    for (let i = 1; i < featherProfile.length; i++) {
      const [end, to] = featherProfile[i];
      if (distance > end) continue;
      const [start, from] = featherProfile[i - 1];
      return from + (to - from) * (distance - start) / (end - start);
    }
    return 1;
  }

  function maskImage(edgeMask) {
    if (!validEdgeMask(edgeMask)) return 'none';
    const gradient = (direction, start, end) => {
      const stops = start > 0 ? featherProfile.map(([position, alpha]) => [position * start, alpha]) : [[0, 1]];
      stops.push(...(end > 0 ? [...featherProfile].reverse().map(([position, alpha]) => [1 - position * end, alpha]) : [[1, 1]]));
      return `linear-gradient(to ${direction}, ${stops.map(([position, alpha]) => `rgba(0, 0, 0, ${alpha}) ${position * 100}%`).join(', ')})`;
    };
    return `${gradient('right', edgeMask.left, edgeMask.right)}, ${gradient('bottom', edgeMask.top, edgeMask.bottom)}`;
  }

  function merge(a, b) {
    if (!valid(b)) return a;
    if (!a) return { ...b };
    const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
    return { x, y, width: Math.max(a.x + a.width, b.x + b.width) - x, height: Math.max(a.y + a.height, b.y + b.height) - y };
  }

  function animationRange(animation, range) {
    if (!animation || !Number.isFinite(animation.duration) || animation.duration <= 0 ||
      !Array.isArray(range) || range.length !== 2 || !range.every(Number.isFinite)) return null;
    const [start, requestedEnd] = range, end = Math.min(requestedEnd, animation.duration);
    return start >= 0 && start < end ? { start, end } : null;
  }

  function rangedAnimation(animation, range) {
    if (!range) return animation;
    const duration = range.end - range.start;
    return {
      name: `${animation.name}[${range.start},${range.end}]`, duration,
      apply(skeleton, lastTime, time, loop, events, alpha, blend, direction) {
        const offset = value => range.start + Math.max(0, Math.min(duration, value));
        return animation.apply(skeleton, lastTime < 0 ? lastTime : offset(lastTime), offset(time), false, events, alpha, blend, direction);
      }
    };
  }

  function measureSteps(instance, skins, steps) {
    const skeleton = instance.skeleton;
    let bounds = null, idle = null, placement = null;
    const placements = [];
    for (const skin of skins) {
      if (!skeleton.data.findSkin(skin.name)) continue;
      skeleton.setSkinByName(skin.name);
      for (const [stepIndex, step] of steps.entries()) {
        const excluded = steps.filter(other => other !== step && other.bounds_prefix !== step.bounds_prefix)
          .map(other => other.bounds_prefix)
          .concat(Array.isArray(step.bounds_exclude) ? step.bounds_exclude : [])
          .filter(prefix => typeof prefix === 'string' && prefix.length)
          .map(prefix => prefix.toLowerCase());
        const samples = new Map();
        for (const [name, requestedRange, isIdle] of [
          [step.animation, step.interaction_range, false], [step.idle, step.idle_range, true]
        ]) {
          const animation = skeleton.data.findAnimation(name);
          if (!animation) continue;
          const range = animationRange(animation, requestedRange);
          const key = JSON.stringify([name, range?.start ?? 0, range?.end ?? animation.duration]);
          const sample = samples.get(key);
          if (sample) sample.isIdle ||= isIdle;
          else samples.set(key, { animation: rangedAnimation(animation, range), isIdle });
        }
        for (const { animation, isIdle } of samples.values()) {
          const reach = {}, getBounds = skeleton.getBounds;
          const ownsGetBounds = Object.prototype.hasOwnProperty.call(skeleton, 'getBounds');
          // Some scenes park the other pose offscreen instead of hiding its slots.
          // Filter only during measurement; keep the live skeleton and draw order intact.
          skeleton.getBounds = function (...args) {
            const order = this.drawOrder;
            if (!Array.isArray(order) || !excluded.length) return getBounds.apply(this, args);
            this.drawOrder = order.filter(slot => !excluded.some(prefix =>
              slot.data?.name?.toLowerCase().startsWith(prefix) || slot.attachment?.name?.toLowerCase().startsWith(prefix)));
            try { return getBounds.apply(this, args); }
            finally { this.drawOrder = order; }
          };
          try { instance.calculateAnimationViewport(animation, reach); }
          finally {
            if (ownsGetBounds) skeleton.getBounds = getBounds;
            else delete skeleton.getBounds;
          }
          bounds = merge(bounds, reach);
          if (isIdle) {
            placement = merge(placement, reach);
            placements[stepIndex] = merge(placements[stepIndex], reach);
            if (step === steps[0]) idle = merge(idle, reach);
          }
        }
      }
    }
    return bounds ? { bounds, idle: idle || placement || bounds, placement: placement || idle || bounds, placements } : null;
  }

  function measure(instance, runtime, skins, config) {
    // Story exports can contain large matte panels and off-camera spare parts.
    // Use their authored picture window, rather than fitting those parts.
    if (valid(config.scene_crop)) {
      const { x, y, width, height } = config.scene_crop;
      const picture = { x, y, width, height };
      const feather = config.scene_feather;
      if (validFeather(feather)) {
        const expanded = { x: x - feather.left, y: y - feather.bottom,
          width: width + feather.left + feather.right, height: height + feather.top + feather.bottom };
        const edgeMask = { left: feather.left / expanded.width, right: feather.right / expanded.width,
          top: feather.top / expanded.height, bottom: feather.bottom / expanded.height };
        if (valid(expanded) && validEdgeMask(edgeMask)) {
          return { bounds: expanded, idle: picture, placement: expanded, padding: 0, edgeMask };
        }
      }
      return { bounds: picture, idle: picture, placement: picture, padding: 0 };
    }
    const steps = Array.isArray(config.scene_steps) ? config.scene_steps.filter(step => step &&
      typeof step.animation === 'string' && step.animation && typeof step.idle === 'string' && step.idle) : [];
    if (steps.length) return measureSteps(instance, skins, steps);
    const skeleton = instance.skeleton, offset = new runtime.Vector2(), size = new runtime.Vector2();
    const setup = () => {
      skeleton.setToSetupPose();
      skeleton.updateWorldTransform();
      skeleton.getBounds(offset, size, []);
      return { x: offset.x, y: offset.y, width: size.x, height: size.y };
    };
    let bounds = merge(null, setup()), idle = null;
    if (!bounds) return null;
    for (const skin of skins) {
      if (!skeleton.data.findSkin(skin.name)) continue;
      skeleton.setSkinByName(skin.name);
      if (config.framing === 'setup') bounds = merge(bounds, setup());
      const names = config.framing === 'setup' ? [config.idle] : [config.idle, config.interaction, config.attack];
      for (const name of new Set(names)) {
        const animation = name && skeleton.data.findAnimation(name);
        if (!animation) continue;
        const reach = {};
        instance.calculateAnimationViewport(animation, reach);
        if (name === config.idle) idle = merge(idle, reach);
        if (config.framing !== 'setup') bounds = merge(bounds, reach);
      }
    }
    return { bounds, idle: idle || bounds };
  }

  function fit(bounds, width, height, idleHeight = 0, targetHeight = 0, padding = 0) {
    const ratio = bounds.width / bounds.height;
    if (!Number.isFinite(ratio) || bounds.width <= 0 || bounds.height <= 0) return { width, height };
    if (Number.isFinite(idleHeight) && idleHeight > 0 && Number.isFinite(targetHeight) && targetHeight > 0) {
      const scale = targetHeight / idleHeight * (1 + 2 * padding);
      return { width: bounds.width * scale, height: bounds.height * scale };
    }
    return ratio > width / height
      ? { width, height: width / ratio }
      : { width: height * ratio, height };
  }

  function project(idle, bounds, width, height, padding = 0) {
    const sx = width / (bounds.width * (1 + 2 * padding)), sy = height / (bounds.height * (1 + 2 * padding));
    return {
      x: (idle.x - bounds.x + bounds.width * padding) * sx,
      y: (bounds.y + bounds.height * (1 + padding) - idle.y - idle.height) * sy,
      width: idle.width * sx,
      height: idle.height * sy
    };
  }

  function pixelFrame(pixels, columns, rows, width, height, previous = null) {
    if (!pixels || pixels.length < columns * rows * 4 || !Number.isInteger(columns) || !Number.isInteger(rows) ||
      columns <= 0 || rows <= 0 || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return previous;
    let left = columns, top = rows, right = -1, bottom = -1;
    for (let y = 0; y < rows; y++) for (let x = 0; x < columns; x++) {
      if (pixels[(y * columns + x) * 4 + 3] <= 12) continue;
      left = Math.min(left, x); right = Math.max(right, x);
      top = Math.min(top, y); bottom = Math.max(bottom, y);
    }
    if (right < left) return previous;
    // Accumulate idle pixels so breathing never shrinks the drag envelope.
    return merge(previous, { x: left * width / columns, y: top * height / rows,
      width: (right - left + 1) * width / columns, height: (bottom - top + 1) * height / rows });
  }

  function layout(width, height, frame, viewportWidth, viewportHeight, zoom, placementFrame = null, fitFrame = null) {
    const base = valid(frame) ? frame : { x: 0, y: 0, width, height };
    const placementBase = valid(placementFrame) ? placementFrame : base;
    const fitBase = valid(fitFrame) ? fitFrame : placementBase;
    const requestedZoom = Number.isFinite(zoom) ? Math.max(policy.minZoom, Math.min(policy.maxZoom, zoom)) : 1;
    // Leave room to reposition even at the largest permitted size.
    const dragRoom = 48;
    const effectiveZoom = Math.min(requestedZoom,
      Math.max(1, viewportWidth - 2 * policy.margin - dragRoom) / Math.max(base.width, placementBase.width, fitBase.width),
      Math.max(1, viewportHeight - 2 * policy.margin - dragRoom) / Math.max(base.height, placementBase.height, fitBase.height));
    const visible = Object.fromEntries(Object.entries(base).map(([key, value]) => [key, value * effectiveZoom]));
    const placement = placementBase === base ? visible
      : Object.fromEntries(Object.entries(placementBase).map(([key, value]) => [key, value * effectiveZoom]));
    const minX = policy.margin - placement.x, minY = policy.margin - placement.y;
    return {
      zoom: effectiveZoom, width: width * effectiveZoom, height: height * effectiveZoom, visible, placement,
      minX, minY,
      maxX: Math.max(minX, viewportWidth - policy.margin - placement.x - placement.width),
      maxY: Math.max(minY, viewportHeight - policy.margin - placement.y - placement.height)
    };
  }

  function hitPath(pixels, columns, rows, width, height, edgeMask = null) {
    const rectangles = [], active = new Map();
    const feathered = validEdgeMask(edgeMask);
    const sideAlpha = (distance, feather) => feather > 0 ? featherAlpha(distance / feather) : 1;
    const axisAlpha = (count, start, end) => Array.from({ length: count }, (_, index) => {
      const position = (index + .5) / count;
      return sideAlpha(position, start) * sideAlpha(1 - position, end);
    });
    const horizontal = feathered ? axisAlpha(columns, edgeMask.left, edgeMask.right) : null;
    const vertical = feathered ? axisAlpha(rows, edgeMask.top, edgeMask.bottom) : null;
    // Very faint shadows/effects should not prevent using the page underneath.
    const visible = (x, y) => {
      let alpha = pixels[(y * columns + x) * 4 + 3];
      if (feathered) alpha *= horizontal[x] * vertical[y];
      return alpha > 32;
    };
    for (let y = 0; y < rows; y++) {
      const current = new Set();
      for (let x = 0; x < columns;) {
        if (!visible(x, y)) { x++; continue; }
        const start = x++;
        while (x < columns && visible(x, y)) x++;
        const key = `${start}:${x}`;
        current.add(key);
        if (active.has(key)) active.get(key).bottom = y + 1;
        else {
          const rect = { left: start, right: x, top: y, bottom: y + 1 };
          rectangles.push(rect);
          active.set(key, rect);
        }
      }
      for (const key of active.keys()) if (!current.has(key)) active.delete(key);
    }
    const sx = width / columns, sy = height / rows;
    // Keep tolerance in CSS pixels, not sample cells that grow when zoomed in.
    const path = rectangles.map(rect => {
      const left = Math.max(0, rect.left * sx - 1).toFixed(1);
      const top = Math.max(0, rect.top * sy - 1).toFixed(1);
      const right = Math.min(width, rect.right * sx + 1).toFixed(1);
      const bottom = Math.min(height, rect.bottom * sy + 1).toFixed(1);
      return `M${left} ${top}H${right}V${bottom}H${left}Z`;
    }).join('');
    return `path("${path || 'M0 0Z'}")`;
  }

  window.BlogSpineMascotFraming = Object.freeze({ policy, animationRange, measure, fit, project, pixelFrame, layout, maskImage, hitPath });
})();
