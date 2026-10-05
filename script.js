/* ============================================================================
   NOVA — script.js
   ----------------------------------------------------------------------------
   A cinematic scroll experience. Every module is independent and every heavy
   effect is opt-in: nothing here is required for the composition to read.

   utils ................. selectors, maths, environment detection
   initLoader ............ 000 → 100 calibration, curtain lift, fires the intro
   initHero .............. hero intro timeline + idle motion + pointer parallax
   initCursor ............ dot + trailing ring, state machine, velocity stretch
   initMagneticElements .. quickTo magnetism (≤16px)
   initTextAnimations .... word / char splitting + reveal choreography
   initScrollScenes ...... hero→manifesto→story→kinetic→CTA scrubbed scenes
   initHorizontalGallery . pinned vertical→horizontal translate + containerAnimation
   initMenu .............. fullscreen menu timeline (clip-path circle from button)
   initMicroInteractions . marquee, scroll velocity, clock, scroll-to, progress rail
   initPreview ........... floating visual that follows the cursor over the index
   initProjectFlip ....... GSAP Flip between panel visual and full-screen case
   initAtmosphere ........ canvas dust field
   initLiquid ............ throttled SVG turbulence morph (self-pausing)
   initResponsiveAnimations . font/resize refresh policy, breakpoint re-measure
   ========================================================================== */

(function () {
  'use strict';

  /* ── utils ─────────────────────────────────────────────────────────────── */

  var $  = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var clamp = function (v, a, b) { return v < a ? a : (v > b ? b : v); };
  var lerp  = function (a, b, t) { return a + (b - a) * t; };
  var round = function (v, p) { var m = Math.pow(10, p || 0); return Math.round(v * m) / m; };

  var env = {
    hasGSAP: !!window.gsap,
    hasST:   !!(window.gsap && window.ScrollTrigger),
    hasFlip: !!(window.gsap && window.Flip),
    reduced: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    touch:   window.matchMedia('(hover: none), (pointer: coarse)').matches,
    mobileMQ: window.matchMedia('(max-width: 860px)'),
    isMobile: function () { return env.mobileMQ.matches; }
  };

  var gsap = window.gsap || null;
  var ScrollTrigger = window.ScrollTrigger || null;
  var Flip = window.Flip || null;

  /* shared motion state (written by ScrollTrigger, read by the ticker) */
  var motion = { velocity: 0, skew: 0 };

  if (window.gsap) {
    gsap.registerPlugin(ScrollTrigger, Flip);
    gsap.ticker.lagSmoothing(500, 33);
    gsap.defaults({ ease: 'power3.out' });
    if (ScrollTrigger) ScrollTrigger.config({ ignoreMobileResize: true });
  }

  if (env.reduced) document.documentElement.classList.add('is-reduced');
  if (!env.hasGSAP) document.documentElement.classList.add('no-gsap');

  /* scroll lock with scrollbar compensation (no layout jump) */
  var scrollLock = {
    lock: function () {
      var sw = window.innerWidth - document.documentElement.clientWidth;
      if (sw > 0) document.body.style.paddingRight = sw + 'px';
      document.documentElement.classList.add('is-locked');
      document.body.classList.add('is-locked');
    },
    unlock: function () {
      document.documentElement.classList.remove('is-locked');
      document.body.classList.remove('is-locked');
      document.body.style.paddingRight = '';
    }
  };

  /* eased window scroll without a plugin */
  function scrollToY(target, duration) {
    var start = window.pageYOffset;
    var delta = target - start;
    if (Math.abs(delta) < 2) return;
    if (!gsap || env.reduced) { window.scrollTo(0, target); return; }
    var proxy = { y: 0 };
    gsap.to(proxy, {
      y: 1, duration: duration || 1.05, ease: 'power3.inOut', overwrite: 'auto',
      onUpdate: function () { window.scrollTo(0, start + delta * proxy.y); }
    });
  }
  function scrollToEl(el, pad) {
    if (!el) return;
    var y = el.getBoundingClientRect().top + window.pageYOffset - (pad || 0);
    scrollToY(Math.max(0, y));
  }

  /* ══════════════════════════════════════════════════════════════════════════
     LOADER
     ═════════════════════════════════════════════════════════════════════════ */
  function initLoader(afterCalibrate) {
    var loader = $('#loader');
    var count = $('#loaderCount');
    var bar = $('#loaderBar');

    function finish() {
      if (loader) loader.style.display = 'none';
      document.documentElement.classList.add('is-ready');
    }

    /* hard safety: the loader can never strand the visitor */
    var guard = window.setTimeout(function () {
      if (loader && loader.style.display !== 'none') {
        if (gsap) { gsap.set(loader, { clipPath: 'inset(0% 0% 100% 0%)' }); }
        finish();
      }
    }, 6000);

    if (!gsap || !loader) {
      window.clearTimeout(guard);
      finish();
      if (afterCalibrate) afterCalibrate();
      return;
    }

    var proxy = { v: 0 };
    var tl = gsap.timeline({
      onComplete: function () { window.clearTimeout(guard); finish(); }
    });

    tl.set(loader, { clipPath: 'inset(0% 0% 0% 0%)' })
      .to(proxy, {
        v: 100, duration: 1.05, ease: 'power2.inOut',
        onUpdate: function () {
          if (count) count.textContent = String(Math.round(proxy.v)).padStart(3, '0');
          if (bar) bar.style.transform = 'scaleX(' + (proxy.v / 100) + ')';
        }
      }, 0)
      .to('#loaderStatus', { opacity: 0, duration: .25 }, .8)
      .add(function () { if (afterCalibrate) afterCalibrate(); }, 1.1)
      .to('.loader__grid, .loader__mid, .loader__foot', { y: '-8%', opacity: 0, duration: .5, ease: 'power2.in' }, 1.05)
      .to(loader, { clipPath: 'inset(0% 0% 100% 0%)', duration: 1.05, ease: 'expo.inOut' }, 1.35);
  }

  /* ══════════════════════════════════════════════════════════════════════════
     HERO — intro timeline, idle life, pointer depth
     ═════════════════════════════════════════════════════════════════════════ */
  function initHero() {
    if (!env.hasGSAP) return null;

    var stage  = $('[data-hero-visual]');
    var meta   = $('[data-hero-meta]');
    var notes  = $$('[data-hero-note]');
    var glyphs = $$('.hero__title .hl i, .hero__title .hl em, .hero__title .hl b');
    var title  = $('.hero__title');
    var navEls = $$('.nav__links a');
    var brand  = $('.nav__brand');
    var menuBtn = $('#menuBtn');

    /* the intro is built paused and played by the loader, so pre-intro states
       exist from the first frame and nothing flashes before the curtain lifts */
    var intro = gsap.timeline({ paused: true, defaults: { ease: 'expo.out' } });

    if (!env.reduced) {
      intro
        /* 0.30 — metadata */
        .from(meta, { opacity: 0, y: 18, filter: 'blur(6px)', duration: 1 }, .30)
        /* 0.60 — typography, line by line, out of a clipping container */
        .from(glyphs, { yPercent: 118, duration: 1.25, stagger: .075 }, .60)
        .fromTo(title, { scale: 1.035 }, { scale: 1, duration: 1.7, ease: 'power2.out' }, .60)
        /* 1.00 — the artefact emerges through a circular aperture */
        .fromTo(stage,
          { opacity: 0, scale: .74, filter: 'blur(22px)', clipPath: 'inset(42% 42% 42% 42% round 50%)' },
          { opacity: 1, scale: 1, filter: 'blur(0px)', clipPath: 'inset(0% 0% 0% 0% round 50%)', duration: 1.5 }, 1.00)
        /* 1.40 — navigation */
        .from([brand, menuBtn], { opacity: 0, y: -14, duration: .9, stagger: .06 }, 1.40)
        .from(navEls, { opacity: 0, y: -12, duration: .8, stagger: .07 }, 1.42)
        /* 1.80 — secondary details */
        .from(notes, { opacity: 0, y: 22, duration: .9, stagger: .09 }, 1.80)
        .from('.hero__scroll', { opacity: 0, y: 16, duration: .8 }, 1.95)
        .from('.rail', { opacity: 0, duration: .8 }, 2.0)
        /* 2.20 — settles into its final composition */
        .add(function () {
          gsap.set([stage, title], { clearProps: 'filter,clipPath' });
        }, 2.68);
    }

    /* ── idle motion: always alive, transform-only ── */
    if (!env.reduced) {
      gsap.to('.art-sphereWrap', { y: -10, duration: 5.5, yoyo: true, repeat: -1, ease: 'sine.inOut' });
      gsap.to('.art-band', { y: 16, scaleY: 1.22, duration: 7, yoyo: true, repeat: -1, ease: 'sine.inOut' });
      gsap.to('.art-spec', { x: 22, y: -12, opacity: .34, duration: 6.4, yoyo: true, repeat: -1, ease: 'sine.inOut' });
      gsap.to('.art-rim', { x: -18, y: 10, duration: 8.5, yoyo: true, repeat: -1, ease: 'sine.inOut' });
      gsap.to('.art-ringA', { scaleX: 1.04, scaleY: .94, duration: 6, yoyo: true, repeat: -1, ease: 'sine.inOut', transformOrigin: '50% 50%' });
      gsap.to('.art-ringB', { rotation: 360, duration: 150, repeat: -1, ease: 'none', transformOrigin: '50% 50%' });
      gsap.to('.art-bloom', { scale: 1.14, opacity: .26, duration: 7.5, yoyo: true, repeat: -1, ease: 'sine.inOut', transformOrigin: '50% 50%' });
      gsap.to('.hero__halo', { opacity: .55, duration: 6, yoyo: true, repeat: -1, ease: 'sine.inOut' });

      /* micro-satellite tracking the outer orbit; dips behind the sphere */
      var sat = $('.art-sat');
      if (sat) {
        var orbit = { a: -0.4 };
        gsap.to(orbit, {
          a: Math.PI * 1.6, duration: 16, repeat: -1, ease: 'none',
          onUpdate: function () {
            var x = 320 + 286 * Math.cos(orbit.a);
            var y = 320 + 84 * Math.sin(orbit.a);
            sat.setAttribute('transform', 'translate(' + (x - 606) + ' ' + (y - 320) + ')');
            sat.style.opacity = String(clamp((Math.sin(orbit.a) + .75) / 1.4, .12, 1));
          }
        });
      }
    }

    /* ── pointer depth: title, artefact and grid move on separate planes ── */
    if (!env.touch && !env.reduced && window.matchMedia('(hover:hover) and (pointer:fine)').matches) {
      var toArtX = gsap.quickTo('.artifact', 'x', { duration: 1.1, ease: 'power3' });
      var toArtY = gsap.quickTo('.artifact', 'y', { duration: 1.1, ease: 'power3' });
      var toArtR = gsap.quickTo('.artifact', 'rotation', { duration: 1.4, ease: 'power3' });
      var toTtlX = gsap.quickTo('.hero__title', 'x', { duration: 1.3, ease: 'power3' });
      var toGridX = gsap.quickTo('.hero__grid', 'x', { duration: 1.6, ease: 'power3' });

      window.addEventListener('pointermove', function (e) {
        var nx = (e.clientX / window.innerWidth) * 2 - 1;
        var ny = (e.clientY / window.innerHeight) * 2 - 1;
        toArtX(nx * -34); toArtY(ny * -22); toArtR(nx * 1.6);
        toTtlX(nx * 14);
        toGridX(nx * -18);
      }, { passive: true });
    }

    return intro;
  }

  /* ══════════════════════════════════════════════════════════════════════════
     CURSOR — desktop only, disabled on touch
     ═════════════════════════════════════════════════════════════════════════ */
  function initCursor() {
    if (env.touch || !env.hasGSAP) return;
    var root = $('#cursor');
    var label = $('#cursorLabel');
    if (!root) return;

    document.documentElement.classList.add('has-cursor');

    var LABELS = { work: 'VIEW', media: 'EXPLORE' };
    var mx = window.innerWidth / 2, my = window.innerHeight / 2;
    var lastX = mx;

    var ringX = gsap.quickTo('.cursor__ring', 'x', { duration: env.reduced ? 0 : .45, ease: 'power3' });
    var ringY = gsap.quickTo('.cursor__ring', 'y', { duration: env.reduced ? 0 : .45, ease: 'power3' });
    var dotTX = gsap.quickTo('.cursor__dot', 'x', { duration: env.reduced ? 0 : .12, ease: 'power2' });
    var dotTY = gsap.quickTo('.cursor__dot', 'y', { duration: env.reduced ? 0 : .12, ease: 'power2' });

    /* the cursor only appears once the visitor actually moves a pointer */
    window.addEventListener('pointermove', function (e) {
      mx = e.clientX; my = e.clientY;
      ringX(mx); ringY(my); dotTX(mx); dotTY(my);
      root.classList.add('is-on');
    }, { passive: true });

    /* velocity stretch — the ring leans into the movement */
    if (!env.reduced) {
      var prevX = mx, prevY = my;
      gsap.ticker.add(function () {
        var vx = mx - prevX, vy = my - prevY;
        prevX = mx; prevY = my;
        var speed = Math.min(Math.sqrt(vx * vx + vy * vy), 90);
        var stretch = clamp(speed / 90, 0, 1) * .22;
        var ang = Math.atan2(vy, vx) * 180 / Math.PI;
        gsap.set('.cursor__ring', {
          rotation: speed > 2 ? ang : 0,
          scaleX: 1 + stretch, scaleY: 1 - stretch * .55
        });
      });
    }

    /* state machine, event-delegated so dynamic nodes work too */
    function setState(state) {
      root.classList.remove('is-link', 'is-button', 'is-work', 'is-media');
      delete root.dataset.labelled;
      if (!state) { if (label) label.textContent = ''; return; }
      root.classList.add('is-' + state);
      if (label) label.textContent = LABELS[state] || '';
    }

    document.addEventListener('pointerover', function (e) {
      var t = e.target && e.target.closest ? e.target.closest('[data-cursor]') : null;
      if (!t) { setState(null); return; }
      setState(t.getAttribute('data-cursor'));
    });
    document.addEventListener('pointerout', function (e) {
      if (e.target && e.target.closest && e.target.closest('[data-cursor]')) setState(null);
    });
    window.addEventListener('pointerdown', function () { root.classList.add('is-down'); });
    window.addEventListener('pointerup', function () { root.classList.remove('is-down'); });
    window.addEventListener('blur', function () { setState(null); });
    document.addEventListener('mouseleave', function () { root.classList.remove('is-on'); });
    document.addEventListener('mouseenter', function () { root.classList.add('is-on'); });
  }

  /* ══════════════════════════════════════════════════════════════════════════
     MAGNETIC ELEMENTS — 10–20px of attraction, never more
     ═════════════════════════════════════════════════════════════════════════ */
  function initMagneticElements() {
    if (env.touch || env.reduced || !env.hasGSAP) return;
    if (!window.matchMedia('(hover:hover) and (pointer:fine)').matches) return;

    $$('.magnetic, .btn, .menubtn, .overlay__close, .panel__open').forEach(function (el) {
      var strength = el.classList.contains('btn') ? 18 : 12;
      var xTo = gsap.quickTo(el, 'x', { duration: .55, ease: 'power3' });
      var yTo = gsap.quickTo(el, 'y', { duration: .55, ease: 'power3' });

      el.addEventListener('pointermove', function (e) {
        var r = el.getBoundingClientRect();
        var relX = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
        var relY = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
        xTo(clamp(relX, -1, 1) * strength);
        yTo(clamp(relY, -1, 1) * strength * .8);
      });
      el.addEventListener('pointerleave', function () { xTo(0); yTo(0); });
    });
  }

  /* ══════════════════════════════════════════════════════════════════════════
     TEXT — splitting utilities + reveal choreography
     ═════════════════════════════════════════════════════════════════════════ */
  function walkTextNodes(el, fn) {
    Array.prototype.slice.call(el.childNodes).forEach(function (node) {
      if (node.nodeType === 3) { if (node.nodeValue.trim()) fn(node); }
      else if (node.nodeType === 1 && node.tagName !== 'BR') walkTextNodes(node, fn);
    });
  }

  function splitWords(el) {
    if (el.dataset.splitDone) return $$('.w > i', el);
    walkTextNodes(el, function (node) {
      var frag = document.createDocumentFragment();
      node.nodeValue.split(/(\s+)/).forEach(function (part) {
        if (!part) return;
        if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(' ')); return; }
        var w = document.createElement('span');
        var i = document.createElement('i');
        w.className = 'w'; i.textContent = part;
        w.appendChild(i); frag.appendChild(w);
      });
      node.parentNode.replaceChild(frag, node);
    });
    el.dataset.splitDone = 'words';
    return $$('.w > i', el);
  }

  function splitChars(el) {
    if (el.dataset.splitDone) return $$('.c', el);
    walkTextNodes(el, function (node) {
      var frag = document.createDocumentFragment();
      node.nodeValue.split('').forEach(function (ch) {
        if (/\s/.test(ch)) { frag.appendChild(document.createTextNode(' ')); return; }
        var c = document.createElement('span');
        c.className = 'c'; c.textContent = ch;
        frag.appendChild(c);
      });
      node.parentNode.replaceChild(frag, node);
    });
    el.dataset.splitDone = 'chars';
    return $$('.c', el);
  }

  function initTextAnimations() {
    if (!env.hasGSAP || env.reduced) return;

    /* manifesto headline — word reveal inside a clipping line */
    $$('[data-split="words"]').forEach(function (el) {
      var words = splitWords(el);
      if (!words.length) return;
      gsap.from(words, {
        yPercent: 112, duration: 1.1, ease: 'expo.out', stagger: .028,
        scrollTrigger: { trigger: el, start: 'top 82%' }
      });
    });

    /* CTA — letters reveal progressively, then the rest of the room settles */
    $$('[data-split="chars"]').forEach(function (el) {
      var chars = splitChars(el);
      if (!chars.length) return;
      gsap.set(el, { perspective: 700 });
      gsap.from(chars, {
        yPercent: 105, opacity: 0, rotate: 4, transformOrigin: '50% 100%',
        duration: 1.05, ease: 'expo.out', stagger: { each: .016, from: 'start' },
        scrollTrigger: { trigger: el, start: 'top 86%' }
      });
    });

    /* generic fade-rises for supporting copy */
    $$('[data-fade]').forEach(function (el) {
      gsap.from(el, {
        y: 30, opacity: 0, duration: 1, ease: 'power3.out',
        scrollTrigger: { trigger: el, start: 'top 88%' }
      });
    });
  }

  /* ══════════════════════════════════════════════════════════════════════════
     SCROLL SCENES — hero → manifesto → story → kinetic → CTA
     ═════════════════════════════════════════════════════════════════════════ */
  function heroExitScene() {
    var wrap = $('.hero-wrap');
    if (!wrap) return;
    gsap.timeline({
      scrollTrigger: { trigger: wrap, start: 'top top', end: 'bottom bottom', scrub: 1 }
    })
      .to('.hero__title', { y: '-26vh', duration: 1 }, 0)
      .to('.hero__stage', { scale: 1.5, y: '7vh', duration: 1, ease: 'power1.in' }, 0)
      .to('.hero', { scale: 1.07, transformOrigin: '50% 38%', duration: 1, ease: 'power1.in' }, 0)
      .to('.hero__grid', { scale: 1.16, opacity: .18, duration: 1 }, 0)
      .to('.hero__bloom', { y: '-24vh', scale: 1.3, duration: 1 }, 0)
      .to(['.hero__meta', '.hero__foot', '.hero__scroll'], { opacity: 0, y: -18, duration: .35, stagger: .04 }, 0)
      .to('.hero__title', { opacity: .06, duration: .4 }, .58);
  }

  function manifestoCurtain() {
    var panel = $('.manifesto');
    if (!panel) return;
    gsap.fromTo(panel,
      { clipPath: 'inset(0% 0% 100% 0%)' },
      {
        clipPath: 'inset(0% 0% 0% 0%)', ease: 'none',
        scrollTrigger: { trigger: panel, start: 'top 62%', end: 'top 0%', scrub: 1 }
      });
    gsap.fromTo('.manifesto__inner',
      { y: 60 },
      { y: 0, ease: 'none', scrollTrigger: { trigger: panel, start: 'top bottom', end: 'top top', scrub: 1 } });
  }

  function storyScene() {
    var section = $('.story');
    var stage = $('.story__stage');
    if (!section || !stage) return;

    var caps = $$('.cap');
    var setCap = function (i) {
      caps.forEach(function (c, n) { c.classList.toggle('is-on', n === i); });
    };
    setCap(0);

    /* portrait gets shorter travel distances, resolved on every refresh */
    var mv = function (mobileV, deskV) {
      return function () { return env.isMobile() ? mobileV : deskV; };
    };

    var tl = gsap.timeline({
      scrollTrigger: {
        trigger: section,
        start: 'top top',
        end: 'bottom bottom',
        pin: stage,
        pinSpacing: false,
        scrub: 1,
        invalidateOnRefresh: true,
        onUpdate: function (self) {
          var p = self.progress;
          setCap(clamp(Math.floor(p * 6), 0, 5));
          gsap.set('#storyMeter i', { scaleY: p });
        }
      }
    });

    /* STAGE 1 — the form arrives out of the dark */
    tl.fromTo('.story__object',
        { opacity: 0, scale: .8, y: '9vh' },
        { opacity: 1, scale: 1, y: 0, duration: .1, ease: 'power2.out' }, 0)
      .to('.story__flare', { opacity: .8, duration: .12 }, .02);

    /* STAGE 2 — it turns, looking for the light */
    tl.to('.story__object', { rotation: 26, duration: .16, ease: 'sine.inOut' }, .12)
      .to('.sRingA', { scaleX: 1.06, scaleY: .92, duration: .16, transformOrigin: '50% 50%' }, .12)
      .to('.sRingB', { rotation: 120, duration: .2, transformOrigin: '50% 50%' }, .12);

    /* STAGE 3 — language crosses the frame */
    tl.fromTo('.story__typeLine:first-child',
        { x: mv('-90vw', '-58vw'), opacity: 0 },
        { x: mv('6vw', '18vw'), opacity: 1, duration: .16, ease: 'power1.out' }, .26)
      .fromTo('.story__typeLine:last-child',
        { x: mv('90vw', '58vw'), opacity: 0 },
        { x: mv('-4vw', '-16vw'), opacity: 1, duration: .16, ease: 'power1.out' }, .28)
      .to(['.story__typeLine'], { opacity: 0, duration: .08 }, .44);

    /* STAGE 4 — the form opens */
    tl.to('.story__object', { scale: 1.62, rotation: 8, duration: .2, ease: 'power2.inOut' }, .46)
      .to('.story__flare', { opacity: .3, scale: 1.4, duration: .2 }, .46)
      .to('.story__typeLine:first-child', { x: mv('-70vw', '70vw'), duration: .16, ease: 'power1.in' }, .46)
      .to('.story__typeLine:last-child', { x: mv('70vw', '-70vw'), duration: .16, ease: 'power1.in' }, .46);

    /* STAGE 5 — something lives inside it */
    tl.fromTo('.story__inside',
        { opacity: 0, scale: .86, filter: 'blur(10px)' },
        { opacity: 1, scale: 1, filter: 'blur(0px)', duration: .14, ease: 'power2.out' }, .64)
      .fromTo('.story__insideBig',
        { yPercent: 22, letterSpacing: '.06em' },
        { yPercent: 0, letterSpacing: '-.035em', duration: .16 }, .66)
      .fromTo('.story__insideSmall', { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: .1 }, .72)
      .to('.story__object', { scale: 1.5, duration: .12 }, .76);

    /* STAGE 6 — and it becomes the next room */
    tl.to('.story__inside', { opacity: 0, scale: 1.1, duration: .1 }, .86)
      .to('.story__flare', { opacity: 0, duration: .1 }, .86)
      .to('.story__object', { scale: 3.4, opacity: 0, duration: .14, ease: 'power2.in' }, .88);
  }

  function kineticScene() {
    var band = $('.kinetic__band');
    var row = $('#kinRow');
    if (!band || !row) return;

    gsap.fromTo(row, { xPercent: 4 }, {
      xPercent: -22, ease: 'none',
      scrollTrigger: { trigger: band, start: 'top bottom', end: 'bottom top', scrub: 1 }
    });

    /* per-character entrance */
    var chars = [];
    $$('.kin', band).forEach(function (word) {
      var text = word.textContent;
      word.textContent = '';
      text.split('').forEach(function (ch) {
        var s = document.createElement('span');
        s.className = 'c'; s.textContent = ch;
        word.appendChild(s); chars.push(s);
      });
    });
    gsap.from(chars, {
      yPercent: 70, opacity: 0, rotate: 6, duration: 1, ease: 'expo.out',
      stagger: { each: .012, from: 'start' },
      scrollTrigger: { trigger: band, start: 'top 88%' }
    });

    gsap.from('.index__row', {
      y: 40, opacity: 0, duration: .9, ease: 'power3.out', stagger: .07,
      scrollTrigger: { trigger: '.index', start: 'top 88%' }
    });
  }

  function ctaScene() {
    var cta = $('.cta');
    if (!cta) return;
    gsap.fromTo('.cta__glow',
      { opacity: 0, scale: .8 },
      {
        opacity: 1, scale: 1.1, ease: 'none',
        scrollTrigger: { trigger: cta, start: 'top bottom', end: 'center center', scrub: 1 }
      });
    gsap.from('.cta__row', {
      y: 34, opacity: 0, duration: 1, ease: 'power3.out', delay: .35,
      scrollTrigger: { trigger: '.cta__row', start: 'top 90%' }
    });
    gsap.from('.footer__col', {
      y: 22, opacity: 0, duration: .8, stagger: .1,
      scrollTrigger: { trigger: '.footer', start: 'top 95%' }
    });
  }

  function initScrollScenes() {
    if (!env.hasGSAP || !env.hasST) return;
    if (env.reduced) return;          /* composition already at its final state */
    heroExitScene();
    manifestoCurtain();
    storyScene();
    kineticScene();
    ctaScene();
    navInversion();
  }

  /* the two light rooms invert the chrome instead of a difference blend, which
     would turn the single ember accent into cyan */
  function navInversion() {
    var nav = $('#nav');
    if (!nav) return;
    var triggers = [];
    var sync = function () {
      nav.classList.toggle('is-light', triggers.some(function (t) { return t.isActive; }));
    };
    var light = function (sel, endEl) {
      triggers.push(ScrollTrigger.create({
        trigger: sel,
        start: 'top 46px',
        endTrigger: endEl || sel,
        end: endEl ? 'top 46px' : 'bottom 46px',
        onToggle: sync,
        onRefresh: sync
      }));
    };
    light('.manifesto');
    light('.cta', '.footer');
    sync();
  }

  /* ══════════════════════════════════════════════════════════════════════════
     HORIZONTAL GALLERY — vertical scroll drives horizontal travel
     ═════════════════════════════════════════════════════════════════════════ */
  function initHorizontalGallery() {
    var section = $('.gallery');
    var track = $('#galTrack');
    if (!section || !track) return;

    function distance() {
      return Math.max(0, track.scrollWidth - window.innerWidth);
    }

    /* the bottom rail reports travel in both modes */
    function readRail() {
      var fill = $('#galFill');
      if (!fill) return;
      var max = track.scrollWidth - track.clientWidth;
      fill.style.transform = 'scaleX(' + (max > 0 ? track.scrollLeft / max : 0) + ')';
    }

    if (!env.hasGSAP || !env.hasST) {
      track.addEventListener('scroll', readRail, { passive: true });
      return;
    }

    var mm = gsap.matchMedia();

    /* ── desktop: vertical scroll drives the horizontal travel, room pinned ── */
    mm.add('(min-width: 861px) and (prefers-reduced-motion: no-preference)', function () {
      var tween = gsap.to(track, {
        x: function () { return -distance(); },
        ease: 'none',
        scrollTrigger: {
          trigger: section,
          start: 'top top',
          end: function () { return '+=' + distance(); },
          pin: true,
          scrub: 1,
          anticipatePin: 1,
          invalidateOnRefresh: true,
          onUpdate: function (self) {
            gsap.set('#galFill', { scaleX: self.progress });
          }
        }
      });

      /* depth: each panel enters from the side, settles, then recedes */
      $$('.panel', track).forEach(function (panel, i) {
        var tl = gsap.timeline({
          scrollTrigger: {
            trigger: panel,
            containerAnimation: tween,
            start: 'left 96%',
            end: 'right 4%',
            scrub: true
          }
        });
        tl.fromTo(panel,
            { scale: .9, opacity: .25 },
            { scale: 1, opacity: 1, duration: .42, ease: 'power1.out' }, 0)
          .to(panel, { scale: .9, opacity: .25, duration: .42, ease: 'power1.in' }, .58);

        /* the visual un-clips as it arrives — a different reveal per column */
        var reveal = [
          { clipPath: 'inset(14% 12% 14% 12%)', scale: 1.16 },
          { clipPath: 'inset(0% 100% 0% 0%)', scale: 1.08 },
          { clipPath: 'inset(38% 0% 38% 0%)', scale: 1.12 },
          { clipPath: 'inset(0% 0% 62% 0%)', scale: 1.2 }
        ][i % 4];

        gsap.fromTo(panel.querySelector('.panel__visual'),
          { clipPath: reveal.clipPath, scale: reveal.scale, filter: 'blur(8px)' },
          {
            clipPath: 'inset(0% 0% 0% 0%)', scale: 1, filter: 'blur(0px)',
            ease: 'power2.out', duration: 1,
            scrollTrigger: {
              trigger: panel, containerAnimation: tween,
              start: 'left 95%', end: 'left 45%', scrub: true
            }
          });

        gsap.from(panel.querySelector('.panel__info'), {
          yPercent: 22, opacity: 0, duration: 1, ease: 'power3.out',
          scrollTrigger: {
            trigger: panel, containerAnimation: tween,
            start: 'left 80%', end: 'left 45%', scrub: true
          }
        });
      });

      return function () { gsap.set(track, { clearProps: 'transform' }); };
    });

    /* ── portrait / reduced motion: the same room, natively scrollable ── */
    function railMode() {
      track.addEventListener('scroll', readRail, { passive: true });
      readRail();
      return function () { track.removeEventListener('scroll', readRail); };
    }
    mm.add('(max-width: 860px)', railMode);
    mm.add('(prefers-reduced-motion: reduce)', railMode);
  }

  /* ══════════════════════════════════════════════════════════════════════════
     MENU — background expands from the button, items follow sequentially
     ═════════════════════════════════════════════════════════════════════════ */
  function initMenu() {
    var menu = $('#menu');
    var btn = $('#menuBtn');
    var close = $('#menuClose');
    if (!menu || !btn) return;

    var open = false;
    var tl = null;
    var circle = { r: 0, x: window.innerWidth - 90, y: 44 };

    function paint() {
      menu.style.clipPath = 'circle(' + circle.r + 'px at ' + circle.x + 'px ' + circle.y + 'px)';
    }

    function build() {
      tl = gsap.timeline({ paused: true, defaults: { ease: 'power3.inOut' } });
      tl.to(circle, {
          r: function () { return Math.hypot(window.innerWidth, window.innerHeight) * 1.05; },
          duration: .95,
          onUpdate: paint
        }, 0)
        .from('.menu__eyebrow', { opacity: 0, y: 18, duration: .5 }, .3)
        .from('.menu__list .mline b', { yPercent: 118, duration: .85, stagger: .075 }, .34)
        .from('.menu__list i', { opacity: 0, x: -10, duration: .5, stagger: .06 }, .42)
        .from('.menu__foot span', { opacity: 0, y: 14, duration: .5, stagger: .05 }, .5)
        .from('.menu__close', { opacity: 0, duration: .4 }, .5)
        .from('.menu__artifact', { opacity: 0, scale: 1.16, rotate: -8, duration: 1.1 }, .25)
        .from('.menu__halo', { opacity: 0, scale: .7, duration: 1 }, .25);
      return tl;
    }

    function setOpen(next) {
      if (open === next) return;
      open = next;
      btn.setAttribute('aria-expanded', String(open));
      menu.setAttribute('aria-hidden', String(!open));
      if (open) {
        var r = btn.getBoundingClientRect();
        circle.x = r.left + r.width / 2;
        circle.y = r.top + r.height / 2;
        circle.r = Math.max(r.width, r.height) / 2;
        paint();
        menu.classList.add('is-open');
        scrollLock.lock();
        if (!tl) build(); else tl.invalidate();
        tl.timeScale(1);
        tl.play(0);
        if (close) close.focus({ preventScroll: true });
      } else {
        scrollLock.unlock();
        if (!tl) { menu.classList.remove('is-open'); return; }
        tl.timeScale(1.5).reverse();
        tl.eventCallback('onReverseComplete', function () {
          menu.classList.remove('is-open');
          menu.style.clipPath = '';
        });
        btn.focus({ preventScroll: true });
      }
    }

    btn.addEventListener('click', function () { setOpen(!open); });
    if (close) close.addEventListener('click', function () { setOpen(false); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && open) setOpen(false);
    });
    $$('[data-menu-link]').forEach(function (a) {
      a.addEventListener('click', function (e) {
        e.preventDefault();
        var target = $(a.getAttribute('href'));
        setOpen(false);
        window.setTimeout(function () { scrollToEl(target, 0); }, 420);
      });
    });

    return { close: function () { setOpen(false); }, isOpen: function () { return open; } };
  }

  /* ══════════════════════════════════════════════════════════════════════════
     MICRO-INTERACTIONS — marquee, velocity, nav, rail, clock, scroll-to
     ═════════════════════════════════════════════════════════════════════════ */
  function initMicroInteractions() {
    /* marquee: endless, and it leans with the scroll velocity */
    var track = $('#marqueeTrack');
    var marquee = null;
    if (track && env.hasGSAP && !env.reduced) {
      marquee = gsap.to(track, { xPercent: -50, duration: 30, ease: 'none', repeat: -1 });
    }

    /* anchors scroll with the page rather than jumping through pins
       (menu links own their timing — they close the menu first) */
    $$('a[href^="#"]:not([data-menu-link])').forEach(function (a) {
      a.addEventListener('click', function (e) {
        var id = a.getAttribute('href').slice(1);
        var target = document.getElementById(id);
        if (!target) return;
        e.preventDefault();
        scrollToEl(target, 0);
        if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
        window.setTimeout(function () { target.focus({ preventScroll: true }); }, 60);
      });
    });
    var toTop = $('#toTop');
    if (toTop) toTop.addEventListener('click', function () { scrollToY(0, 1.2); });

    /* progress rail + nav state, driven from one ScrollTrigger */
    var rail = $('#rail');
    var railFill = $('#railFill');
    var railPct = $('#railPct');
    var railNum = $('#railNum');
    var nav = $('#nav');
    var lastY = window.pageYOffset;

    if (env.hasGSAP && env.hasST) {
      ScrollTrigger.create({
        start: 0, end: 'max',
        onUpdate: function (self) {
          motion.velocity = self.getVelocity();
          var p = self.progress;
          if (railFill) railFill.style.transform = 'scaleY(' + p + ')';
          if (railPct) railPct.textContent = String(Math.round(p * 100)).padStart(2, '0');
          if (railNum) railNum.textContent = '0' + clamp(Math.ceil(p * 6) || 1, 1, 6);
          if (rail) rail.classList.toggle('is-on', window.pageYOffset > 60);
          if (nav) {
            var y = window.pageYOffset;
            nav.classList.toggle('is-scrolled', y > 60);
            if (Math.abs(y - lastY) > 6) {
              gsap.to(nav, {
                y: y > lastY && y > 200 ? -12 : 0,
                opacity: y > lastY && y > 200 ? .62 : 1,
                duration: .6, ease: 'power2.out', overwrite: 'auto'
              });
              lastY = y;
            }
          }
        }
      });
    }

    /* one ticker drives every velocity response: coherence over quantity */
    if (env.hasGSAP && !env.reduced) {
      var artEls = $$('.panel__visual .art');
      gsap.ticker.add(function () {
        motion.skew = lerp(motion.skew, clamp(motion.velocity / 200, -9, 9), .1);
        var k = motion.skew;
        if (Math.abs(k) < .01) return;
        gsap.set('#kinRow', { skewX: k * .8 });
        if (!$('#overlay').classList.contains('is-open')) {
          artEls.forEach(function (a) { gsap.set(a, { skewX: k * .3 }); });
        }
        if (marquee) marquee.timeScale(1 + clamp(Math.abs(motion.velocity) / 900, 0, 2.4));
      });
    }

    /* the studio clock — a small sign of life in the footer */
    var clock = $('#clock');
    if (clock) {
      var tick = function () {
        var d = new Date();
        clock.textContent = [d.getHours(), d.getMinutes(), d.getSeconds()]
          .map(function (n) { return String(n).padStart(2, '0'); }).join(':');
      };
      tick();
      window.setInterval(tick, 1000);
    }
  }

  /* ══════════════════════════════════════════════════════════════════════════
     FLOATING PREVIEW — editorial hover reveal, follows with inertia
     ═════════════════════════════════════════════════════════════════════════ */
  function initPreview() {
    var wrap = $('#preview');
    var art = $('#previewArt');
    var cap = $('#previewCap');
    if (!wrap || !art || env.touch || !env.hasGSAP || env.reduced) return;

    var xTo = gsap.quickTo(wrap, 'x', { duration: .65, ease: 'power3' });
    var yTo = gsap.quickTo(wrap, 'y', { duration: .65, ease: 'power3' });
    var rTo = gsap.quickTo(wrap, 'rotation', { duration: .9, ease: 'power3' });
    var mx = 0, my = 0, lastX = 0, shown = false;

    window.addEventListener('pointermove', function (e) {
      mx = e.clientX; my = e.clientY;
      if (shown) {
        var h = wrap.offsetHeight || 300;
        xTo(mx + 26); yTo(my - h * .5);
        rTo(clamp((mx - lastX) * .35, -7, 7));
        lastX = mx;
      }
    }, { passive: true });

    function show(kind, label) {
      art.innerHTML = '<span class="art art--' + kind + '"></span>';
      if (cap) cap.textContent = label || '';
      shown = true;
      var h = wrap.offsetHeight || 300;
      gsap.set(wrap, { x: mx + 26, y: my - h * .5 });
      gsap.timeline()
        .set(wrap, { visibility: 'visible' })
        .to(wrap, { autoAlpha: 1, duration: .35, ease: 'power2.out' }, 0)
        .to('.preview__inner', { clipPath: 'inset(0% 0% 0% 0%)', scale: 1, duration: .8, ease: 'expo.out' }, 0)
        .to('.preview__art', { scale: 1, duration: 1, ease: 'power2.out' }, 0)
        .to(cap, { autoAlpha: 1, duration: .4 }, .25);
    }

    function hide() {
      shown = false;
      gsap.timeline({ onComplete: function () { gsap.set(wrap, { visibility: 'hidden' }); } })
        .to('.preview__inner', { clipPath: 'inset(46% 46% 46% 46%)', scale: .92, duration: .5, ease: 'power3.inOut' }, 0)
        .to('.preview__art', { scale: 1.18, duration: .6 }, 0)
        .to(cap, { autoAlpha: 0, duration: .2 }, 0)
        .to(wrap, { autoAlpha: 0, duration: .4 }, .1);
    }

    $$('.index__row').forEach(function (row) {
      row.addEventListener('pointerenter', function () { show(row.dataset.preview, row.dataset.cap); });
      row.addEventListener('pointerleave', hide);
    });
  }

  /* ══════════════════════════════════════════════════════════════════════════
     PROJECT FLIP — the panel's artwork becomes the full-screen case
     ═════════════════════════════════════════════════════════════════════════ */
  var PROJECTS = {
    NOVA:   { index: '01', role: 'DIGITAL ART DIRECTION', year: '2026', tech: 'ECLIPSE GRADIENT · SVG · CSS',
              lead: 'A surface that behaves like matter.',
              text: 'Chrome, light and one moving form — composed as a slow camera move across four screens of scroll.' },
    HELIX:  { index: '02', role: 'INTERACTIVE INSTALLATION', year: '2025', tech: 'MOIRÉ INTERFERENCE · CSS · SOUND',
              lead: 'Two grids, one interference pattern.',
              text: 'A moiré engine driven by sound: the visitor moves, the pattern answers. Built for a 9-metre LED wall.' },
    VESSEL: { index: '03', role: 'ARCHITECTURAL INTERFACE', year: '2025', tech: 'CONIC LIGHT · PERSPECTIVE GRID',
              lead: 'Type as load-bearing structure.',
              text: 'A spatial interface for a museum wing — wayfinding, archive and light composed in one continuous gradient.' },
    SIGNAL: { index: '04', role: 'GENERATIVE IDENTITY', year: '2024', tech: 'RADAR RINGS · SCANLINES · LIVE DATA',
              lead: 'An identity that never repeats.',
              text: 'Scanlines, sweeps and live data. The mark redraws itself every 40 seconds from the studio\u2019s own telemetry.' }
  };

  function initProjectFlip() {
    var overlay = $('#overlay');
    var slot = $('#ovSlot');
    var bg = $('.overlay__bg');
    if (!overlay || !slot || !env.hasFlip || !env.hasGSAP) return;

    var active = null;
    var busy = false;

    function fill(project) {
      var data = PROJECTS[project] || PROJECTS.NOVA;
      $('#ovIndex').textContent = data.index;
      $('#ovName').textContent = project;
      $('#ovRole').textContent = data.role;
      $('#ovYear').textContent = data.year;
      $('#ovLead').textContent = data.lead;
      $('#ovText').textContent = data.text;
      var tech = $('#ovTech');
      if (tech) tech.textContent = data.tech;
    }

    function open(panel) {
      if (busy) return;
      var art = $('.art', panel.querySelector('.panel__visual'));
      if (!art) return;
      busy = true;
      active = { art: art, parent: art.parentNode, next: art.nextSibling, panel: panel };

      fill(panel.dataset.project);
      var state = Flip.getState(art);
      slot.appendChild(art);

      overlay.classList.add('is-open');
      overlay.setAttribute('aria-hidden', 'false');
      scrollLock.lock();

      gsap.timeline({ onComplete: function () { busy = false; } })
        .to(bg, { opacity: 1, duration: .5, ease: 'power2.out' }, 0)
        .fromTo('.overlay__inner', { y: 26 }, { y: 0, duration: .8, ease: 'power3.out' }, .05)
        .fromTo(['.overlay__name', '.overlay__head .mono', '.overlay__close'],
          { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: .7, stagger: .08, ease: 'power3.out' }, .2)
        .fromTo(['.overlay__lead', '.overlay__meta .body', '.overlay__facts > div'],
          { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: .6, stagger: .07, ease: 'power3.out' }, .32);

      Flip.from(state, {
        duration: .95, ease: 'power3.inOut', absolute: true, zIndex: 2
      });

      var closeBtn = $('#ovClose');
      if (closeBtn) closeBtn.focus({ preventScroll: true });
    }

    function close() {
      if (!active || busy) return;
      busy = true;
      var state = Flip.getState(active.art);
      if (active.next) active.parent.insertBefore(active.art, active.next);
      else active.parent.appendChild(active.art);

      Flip.from(state, {
        duration: .8, ease: 'power3.inOut', absolute: true, zIndex: 2,
        onComplete: function () {
          overlay.classList.remove('is-open');
          overlay.setAttribute('aria-hidden', 'true');
          scrollLock.unlock();
          busy = false;
        }
      });

      gsap.to(bg, { opacity: 0, duration: .55, delay: .15 });
      gsap.to('.overlay__inner > *', { opacity: 0, y: 18, duration: .3, ease: 'power2.in' });
      active = null;
    }

    $$('[data-open-project]').forEach(function (btnEl) {
      btnEl.addEventListener('click', function (e) {
        e.preventDefault();
        open(btnEl.closest('.panel'));
      });
    });
    $$('.panel__visual').forEach(function (vis) {
      vis.addEventListener('click', function () { open(vis.closest('.panel')); });
    });
    var ovClose = $('#ovClose');
    if (ovClose) ovClose.addEventListener('click', close);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && overlay.classList.contains('is-open')) close();
    });

    return { close: close, isOpen: function () { return overlay.classList.contains('is-open'); } };
  }

  /* ══════════════════════════════════════════════════════════════════════════
     ATMOSPHERE — a restrained dust field on one canvas
     ═════════════════════════════════════════════════════════════════════════ */
  function initAtmosphere() {
    var canvas = $('#dust');
    if (!canvas || env.reduced) return;
    var ctx = canvas.getContext('2d');
    if (!ctx) return;

    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var count = env.isMobile() ? 14 : 42;
    var motes = [];
    var w = 0, h = 0, running = true;

    function resize() {
      w = window.innerWidth; h = window.innerHeight;
      canvas.width = Math.floor(w * dpr); canvas.height = Math.floor(h * dpr);
      canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    function seed() {
      motes = [];
      for (var i = 0; i < count; i++) {
        motes.push({
          x: Math.random() * w, y: Math.random() * h,
          r: .4 + Math.random() * 1.5,
          vx: (Math.random() - .5) * .12,
          vy: -.06 - Math.random() * .16,
          a: .05 + Math.random() * .22,
          t: Math.random() * Math.PI * 2
        });
      }
    }
    function frame() {
      if (!running) return;
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';
      for (var i = 0; i < motes.length; i++) {
        var m = motes[i];
        m.t += .006;
        m.x += m.vx + Math.sin(m.t) * .1;
        m.y += m.vy;
        if (m.y < -10) { m.y = h + 10; m.x = Math.random() * w; }
        if (m.x < -10) m.x = w + 10;
        if (m.x > w + 10) m.x = -10;
        ctx.beginPath();
        ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(244,244,240,' + m.a + ')';
        ctx.fill();
      }
    }
    resize(); seed();
    window.addEventListener('resize', function () { resize(); seed(); });
    document.addEventListener('visibilitychange', function () {
      running = !document.hidden;
      if (running) requestAnimationFrame(frame);
    });
    (function loop() { if (running) { frame(); requestAnimationFrame(loop); } else { requestAnimationFrame(loop); } })();
  }

  /* ══════════════════════════════════════════════════════════════════════════
     LIQUID — throttled turbulence morph. A big SVG filter is expensive, so it
     updates ~4×/second, only while the hero is on screen and the tab is awake.
     ═════════════════════════════════════════════════════════════════════════ */
  function initLiquid() {
    if (env.reduced || env.isMobile()) return;
    var map = $('#liquidMap');
    if (!map) return;

    var visible = true, awake = true, t = 0;

    if (env.hasST) {
      ScrollTrigger.create({
        trigger: '.hero-wrap', start: 'top bottom', end: 'bottom top',
        onToggle: function (self) { visible = self.isActive; }
      });
    }
    document.addEventListener('visibilitychange', function () { awake = !document.hidden; });

    window.setInterval(function () {
      if (!visible || !awake) return;
      t += .24;
      var s = 20 + Math.sin(t * 1.1) * 8 + Math.sin(t * .43) * 5;
      map.setAttribute('scale', round(s, 2));
      map.setAttribute('xChannelSelector', t % 2 > 1 ? 'R' : 'G');
    }, 260);
  }

  /* ══════════════════════════════════════════════════════════════════════════
     RESPONSIVE / REFRESH POLICY
     ═════════════════════════════════════════════════════════════════════════ */
  function initResponsiveAnimations() {
    if (!env.hasGSAP || !env.hasST) return;

    /* fonts change line boxes — re-measure once they land */
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () { ScrollTrigger.refresh(); });
    }
    window.addEventListener('load', function () { ScrollTrigger.refresh(); });

    var resizeTimer = null;
    window.addEventListener('resize', function () {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(function () { ScrollTrigger.refresh(); }, 220);
    });

    /* a breakpoint change re-measures pins and the horizontal travel distance */
    env.mobileMQ.addEventListener('change', function () {
      ScrollTrigger.refresh();
    });
  }

  /* ══════════════════════════════════════════════════════════════════════════
     BOOT
     ═════════════════════════════════════════════════════════════════════════ */
  function boot() {
    initAtmosphere();
    initLiquid();
    initCursor();
    initMagneticElements();
    initTextAnimations();
    initPreview();
    initProjectFlip();
    var menu = initMenu();
    initHorizontalGallery();
    initScrollScenes();
    initMicroInteractions();
    initResponsiveAnimations();

    /* failure path: no GSAP at all — the composition stands on its own */
    if (!env.hasGSAP) {
      var loader = $('#loader');
      if (loader) loader.style.display = 'none';
      return;
    }

    var intro = initHero();
    initLoader(function () {
      if (!intro) return;
      if (env.reduced) { intro.progress(1); return; }
      intro.play(0);
    });

    /* keyboard: escape closes whatever is open, in order of precedence */
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (menu && menu.isOpen()) menu.close();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

})();
