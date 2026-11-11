/* ==========================================================================
   중력파 체험관
   Shared constants, helpers, and the page-level scroll behaviour. One module
   per experiment is added below as each one lands:
     1. 블랙홀 소리 실험실   #lab
     2. 10^21 줌            #zoom
     3. 별의 일생 시뮬레이터  #stars
     4. 블랙홀 키우기        #game
   ========================================================================== */

'use strict';

/* Solar mass expressed as a time, G*M_sun/c^3. Every chirp formula uses this
   to turn a mass in solar units into seconds. */
const T_SUN = 4.925e-6;

/* The detectors only hear above roughly 20 Hz, so that is where a chirp
   starts and where the oscillation count begins. */
const F_START = 20;

/* Playback is capped so a light pair does not outlast anyone's patience. */
const MAX_CHIRP_SECONDS = 8;

/* How far the cover plate drifts against the page, as a share of scrolled
   distance. Small on purpose — this should register as depth, not motion. */
const PARALLAX_RATE = 0.18;

const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const prefersReducedMotion =
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* --------------------------------------------------------------------------
   Reveal on scroll
   Groups are staggered by position so a row of cards lands one after another
   rather than all at once. The attribute is removed once the animation ends,
   which hands the element back to the stylesheet so hover states work.
   -------------------------------------------------------------------------- */

function markReveals() {
  /* [selector for the group, selector for its members] */
  const groups = [
    ['.exp__head', ':scope > *'],
    ['.cards',     ':scope > .card'],
    ['.sources ul',':scope > li'],
  ];

  groups.forEach(([groupSel, memberSel]) => {
    $$(groupSel).forEach((group) => {
      $$(memberSel, group).forEach((el, i) => {
        el.dataset.reveal = '';
        el.style.setProperty('--i', i);
      });
    });
  });

  /* Standalone blocks reveal on their own, with no stagger.
     [data-no-reveal] opts out: the zoom stage pins a child with position:sticky,
     and a transform on an ancestor — which the reveal animation applies —
     would stop that sticky from sticking. */
  $$('.exp__stage, .caveat, .closing-line, .colophon').forEach((el) => {
    if (el.closest('[data-no-reveal]')) return;
    el.dataset.reveal = '';
  });
}

function watchReveals() {
  const targets = $$('[data-reveal]');
  if (!targets.length) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-in');
      observer.unobserve(entry.target);
    });
  }, {
    /* Fire a little before the element reaches the fold so the overshoot has
       finished by the time it is properly in view */
    rootMargin: '0px 0px -12% 0px',
    threshold: 0.08,
  });

  targets.forEach((el) => {
    observer.observe(el);
    el.addEventListener('animationend', () => {
      el.removeAttribute('data-reveal');
      el.classList.remove('is-in');
      el.style.removeProperty('--i');
    }, { once: true });
  });
}

/* --------------------------------------------------------------------------
   Counters
   Numbers that carry the argument count up once, when they first appear.
   -------------------------------------------------------------------------- */

function watchCounters() {
  const targets = $$('[data-count]');
  if (!targets.length) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      countUp(entry.target);
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.6 });

  targets.forEach((el) => {
    /* Reserve the final width up front so nothing reflows mid-count */
    el.style.minWidth = `${String(el.dataset.count).length}ch`;
    el.classList.add('counting');
    el.textContent = '0';
    observer.observe(el);
  });
}

function countUp(el) {
  const target = Number(el.dataset.count);
  const duration = 900;
  const start = performance.now();

  function frame(now) {
    const t = Math.min((now - start) / duration, 1);
    /* Decelerating curve — fast at first, then creeping to the real number */
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = Math.round(target * eased).toLocaleString('ko-KR');
    if (t < 1) requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

/* --------------------------------------------------------------------------
   Reading progress and cover parallax
   Both read scrollY, so they share one rAF-throttled handler.
   -------------------------------------------------------------------------- */

function watchScroll() {
  const bar = $('.progress span');
  const cover = $('.cover');
  let queued = false;

  function paint() {
    queued = false;
    const y = window.scrollY;

    if (bar) {
      const travel = document.documentElement.scrollHeight - window.innerHeight;
      const ratio = travel > 0 ? Math.min(y / travel, 1) : 0;
      bar.style.transform = `scaleX(${ratio})`;
    }

    if (cover && y < window.innerHeight) {
      cover.style.setProperty('--parallax', `${y * PARALLAX_RATE}px`);
    }
  }

  function onScroll() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(paint);
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  paint();
}

/* --------------------------------------------------------------------------
   Boot
   -------------------------------------------------------------------------- */

if (prefersReducedMotion) {
  /* Counters still resolve, they just arrive at the number immediately */
  $$('[data-count]').forEach((el) => {
    el.textContent = Number(el.dataset.count).toLocaleString('ko-KR');
  });
} else {
  document.documentElement.classList.add('is-animated');
  markReveals();
  watchReveals();
  watchCounters();
  watchScroll();
}

/* ==========================================================================
   체험 1 — 블랙홀 소리 실험실
   명세서 5장. 선행 차수(뉴턴) 근사로 처프를 계산하고, 같은 식으로 오디오
   버퍼와 그래프를 함께 만든다. 숫자와 소리와 그림이 한 계산에서 나오므로
   서로 어긋날 수 없다.
   ========================================================================== */

/* 재생할 때 주파수에 곱하는 값. 끄면 실제 주파수 그대로 나간다. */
const PITCH_BOOST = 8;

/* 병합 후 울림 길이와, 끝에서 소리를 접는 구간 */
const RING_SECONDS = 0.1;
const FADE_SECONDS = 0.05;

/* 처프 질량 — 나선 단계의 주파수 변화를 혼자 결정하는 양 */
const chirpMass = (m1, m2) =>
  Math.pow(m1 * m2, 3 / 5) / Math.pow(m1 + m2, 1 / 5);

/* 주파수 f 일 때 병합까지 남은 시간 */
const tauAt = (f, mc) =>
  (5 / 256) * Math.pow(Math.PI * f, -8 / 3) * Math.pow(mc * T_SUN, -5 / 3);

/* 남은 시간 τ 일 때의 중력파 주파수 */
const freqAt = (tau, mc) =>
  (1 / Math.PI) * Math.pow(5 / (256 * tau), 3 / 8) * Math.pow(mc * T_SUN, -5 / 8);

/* 가장 안쪽 안정 궤도 — 나선 단계가 끝나는 주파수 */
const fIsco = (mTotal) => 4400 / mTotal;

/* 병합 후 울림. 남은 블랙홀 질량 0.95 M, 스핀 0.7 을 가정한 대표값 */
function ringdownOf(mTotal) {
  const mFinal = 0.95 * mTotal;
  const spinTerm = 1 - 0.63 * Math.pow(1 - 0.7, 0.3);
  const f = (32000 * spinTerm) / mFinal;
  return { mFinal, f, decay: 3.5 / f };
}

/* 재생을 시작할 주파수.
   기본은 관측 대역 하단인 20 Hz 지만 두 가지 예외가 있다.
   - 가벼운 쌍은 20 Hz 에서 8초를 넘기므로 시작 주파수를 올린다.
   - 아주 무거운 쌍은 f_isco 가 20 Hz 아래라, 20 Hz 에서 시작하면 들을 것이
     남지 않는다. 그런 경우에만 대역 밑에서 시작하고 화면에 사실을 적는다. */
function startFreq(mc, isco) {
  if (isco <= F_START) return 0.55 * isco;
  const tau20 = tauAt(F_START, mc);
  if (tau20 <= MAX_CHIRP_SECONDS) return F_START;
  return Math.pow(
    (5 / 256) / (MAX_CHIRP_SECONDS * Math.pow(mc * T_SUN, 5 / 3)),
    3 / 8
  ) / Math.PI;
}

/* --------------------------------------------------------------------------
   한 번의 적분으로 오디오 버퍼, 그래프용 자취, 결과 숫자를 모두 만든다.
   -------------------------------------------------------------------------- */

function synthesize(ctx, m1, m2, boost) {
  const sr = ctx.sampleRate;
  const mc = chirpMass(m1, m2);
  const mTotal = m1 + m2;
  const isco = fIsco(mTotal);
  const f0 = startFreq(mc, isco);
  const ring = ringdownOf(mTotal);

  const tauStart = tauAt(f0, mc);
  const tauEnd = isco > f0 ? tauAt(isco, mc) : tauStart * 1e-3;
  const span = Math.max(tauStart - tauEnd, 1 / sr);

  const nInspiral = Math.round(span * sr);
  const nRing = Math.round(RING_SECONDS * sr);
  const total = nInspiral + nRing;

  const buffer = ctx.createBuffer(1, total, sr);
  const out = buffer.getChannelData(0);
  const track = [];
  const trackEvery = Math.max(1, Math.floor(nInspiral / 400));

  const dt = 1 / sr;
  let phase = 0;          // 재생 위상 (boost 가 곱해진 쪽)
  let audiblePhase = 0;   // 20 Hz 위에서만 쌓는 실제 위상

  for (let i = 0; i < nInspiral; i++) {
    const tau = tauStart - i * dt;
    const f = Math.min(freqAt(tau, mc), isco);

    phase += 2 * Math.PI * f * boost * dt;
    if (f >= F_START) audiblePhase += 2 * Math.PI * f * dt;

    /* 진폭은 f^(2/3) 에 비례하고 f_isco 에서 최대가 된다 */
    out[i] = Math.pow(f / isco, 2 / 3) * Math.sin(phase);

    if (i % trackEvery === 0) track.push({ t: i * dt, f });
  }
  track.push({ t: span, f: isco });

  /* 울림 — 위상을 이어받아 감쇠 사인파를 붙인다 */
  for (let i = 0; i < nRing; i++) {
    const t = i * dt;
    phase += 2 * Math.PI * ring.f * boost * dt;
    out[nInspiral + i] = Math.exp(-t / ring.decay) * Math.sin(phase);
  }

  /* 끝 0.05초는 접어서 뚝 끊기는 소리를 막는다 */
  const nFade = Math.min(Math.round(FADE_SECONDS * sr), total);
  for (let i = 0; i < nFade; i++) {
    out[total - nFade + i] *= 1 - i / nFade;
  }

  return {
    buffer,
    track,
    duration: total / sr,
    inspiral: span,
    mc, mTotal, isco, f0, ring,
    cycles: audiblePhase / (2 * Math.PI),
    belowBand: isco <= F_START,
  };
}

/* --------------------------------------------------------------------------
   주파수 그래프. 가로는 시간, 세로는 실제 주파수의 로그 눈금 10~1000 Hz.
   boost 를 켜도 이 그림은 바뀌지 않는다 — 실제 주파수를 보여 주는 자리다.
   -------------------------------------------------------------------------- */

const PLOT_F_MIN = 10;
const PLOT_F_MAX = 1000;
const PLOT_TICKS = [10, 20, 50, 100, 200, 500, 1000];

function drawPlot(canvas, model, progress) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cssW = canvas.clientWidth || 960;
  const cssH = cssW * 9 / 16;

  if (canvas.width !== Math.round(cssW * dpr)) {
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
  }

  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  const pad = { l: 46, r: 16, t: 18, b: 30 };
  const w = cssW - pad.l - pad.r;
  const h = cssH - pad.t - pad.b;

  const logMin = Math.log10(PLOT_F_MIN);
  const logMax = Math.log10(PLOT_F_MAX);
  const yOf = (f) =>
    pad.t + h * (1 - (Math.log10(Math.max(f, PLOT_F_MIN)) - logMin) / (logMax - logMin));
  const xOf = (t) => pad.l + w * (model ? t / model.duration : 0);

  ctx.font = '11px "JetBrains Mono", monospace';
  ctx.textBaseline = 'middle';

  /* 가로 눈금선과 주파수 라벨 */
  PLOT_TICKS.forEach((f) => {
    const y = yOf(f);
    ctx.strokeStyle = 'rgba(245,243,239,0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad.l, y);
    ctx.lineTo(pad.l + w, y);
    ctx.stroke();

    ctx.fillStyle = 'rgba(245,243,239,0.34)';
    ctx.textAlign = 'right';
    ctx.fillText(String(f), pad.l - 8, y);
  });

  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(245,243,239,0.34)';
  ctx.fillText('Hz', pad.l - 40, pad.t - 4);

  if (!model) {
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(245,243,239,0.34)';
    ctx.font = '13px Pretendard, sans-serif';
    ctx.fillText('병합을 누르면 여기에 주파수가 그려집니다', pad.l + w / 2, pad.t + h / 2);
    return;
  }

  /* 관측 대역 하단 20 Hz */
  const y20 = yOf(F_START);
  ctx.save();
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = 'rgba(245,243,239,0.28)';
  ctx.beginPath();
  ctx.moveTo(pad.l, y20);
  ctx.lineTo(pad.l + w, y20);
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = 'rgba(245,243,239,0.34)';
  ctx.textAlign = 'left';
  ctx.font = '10px Pretendard, sans-serif';
  ctx.fillText('관측 대역 하단', pad.l + 6, y20 - 9);

  /* 나선 단계가 끝나는 f_isco */
  const yIsco = yOf(model.isco);
  ctx.save();
  ctx.setLineDash([2, 5]);
  ctx.strokeStyle = 'rgba(217,112,63,0.5)';
  ctx.beginPath();
  ctx.moveTo(pad.l, yIsco);
  ctx.lineTo(pad.l + w, yIsco);
  ctx.stroke();
  ctx.restore();

  /* 전체 자취를 흐리게 깔아 두고, 재생된 만큼만 밝게 덮는다 */
  const drawTrace = (limit, color, width) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    let started = false;
    for (const p of model.track) {
      if (p.t > limit) break;
      const x = xOf(p.t);
      const y = yOf(p.f);
      if (!started) { ctx.moveTo(x, y); started = true; } else { ctx.lineTo(x, y); }
    }
    ctx.stroke();
    return started;
  };

  drawTrace(model.duration, 'rgba(245,243,239,0.16)', 1.5);

  /* 울림은 주파수가 껑충 뛰므로 이어 긋지 않고 따로 표시한다 */
  const yRing = yOf(model.ring.f);
  ctx.save();
  ctx.setLineDash([3, 3]);
  ctx.strokeStyle = 'rgba(217,112,63,0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(xOf(model.inspiral), yRing);
  ctx.lineTo(xOf(model.duration), yRing);
  ctx.stroke();
  ctx.restore();

  const played = progress * model.duration;
  ctx.save();
  ctx.shadowColor = 'rgba(217,112,63,0.85)';
  ctx.shadowBlur = 14;
  drawTrace(played, '#D9703F', 2.5);
  ctx.restore();

  /* 재생 머리 */
  if (progress > 0 && progress < 1) {
    const cur = model.track.filter((p) => p.t <= played).pop();
    if (cur) {
      ctx.fillStyle = '#D9703F';
      ctx.beginPath();
      ctx.arc(xOf(cur.t), yOf(cur.f), 4.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /* 시간 축 */
  ctx.fillStyle = 'rgba(245,243,239,0.34)';
  ctx.font = '11px "JetBrains Mono", monospace';
  ctx.textAlign = 'left';
  ctx.fillText('0s', pad.l, pad.t + h + 14);
  ctx.textAlign = 'right';
  ctx.fillText(`${model.duration.toFixed(2)}s`, pad.l + w, pad.t + h + 14);
}

/* --------------------------------------------------------------------------
   배선
   -------------------------------------------------------------------------- */

function setupLab() {
  const canvas = $('#lab-plot');
  if (!canvas) return;

  const m1 = $('#m1');
  const m2 = $('#m2');
  const out1 = $('#m1-out');
  const out2 = $('#m2-out');
  const boostToggle = $('#lab-boost');
  const boostNote = $('#lab-boost-note');
  const mergeBtn = $('#lab-merge');
  const realBtn = $('#lab-real');
  const note = $('#lab-note');

  const statMc = $('#stat-mc');
  const statIsco = $('#stat-isco');
  const statCycles = $('#stat-cycles');
  const statDur = $('#stat-dur');

  let audio = null;        // AudioContext, 첫 조작 때 만든다
  let voice = null;        // 지금 울리고 있는 source
  let model = null;
  let realBuffer = null;
  let frame = 0;

  /* 브라우저 자동 재생 정책 — 사용자가 누른 뒤에만 소리가 시작된다 */
  function audioContext() {
    if (!audio) {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      audio = new Ctor();
    }
    if (audio.state === 'suspended') audio.resume();
    return audio;
  }

  /* 이전 소리를 반드시 끊고 새로 낸다. 겹쳐 울리면 소리가 깨진다. */
  function stopVoice() {
    cancelAnimationFrame(frame);
    if (voice) {
      try { voice.stop(); } catch (_) { /* 이미 끝난 source */ }
      voice.disconnect();
      voice = null;
    }
  }

  function play(buffer, onProgress) {
    const ctx = audioContext();
    stopVoice();

    const gain = ctx.createGain();
    gain.gain.value = 0.85;
    gain.connect(ctx.destination);

    voice = ctx.createBufferSource();
    voice.buffer = buffer;
    voice.connect(gain);

    const startedAt = ctx.currentTime;
    voice.start();

    if (!onProgress) return;
    const tick = () => {
      const p = Math.min((ctx.currentTime - startedAt) / buffer.duration, 1);
      onProgress(p);
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
  }

  function fmtCycles(value, belowBand) {
    if (belowBand || value < 1) return null;
    return value < 10 ? value.toFixed(1) : Math.round(value).toString();
  }

  function render(progress) {
    drawPlot(canvas, model, progress);
  }

  /* 질량이 바뀌면 소리를 내지 않고 숫자와 그래프만 다시 계산한다 */
  function recompute({ play: shouldPlay = false } = {}) {
    const a = Number(m1.value);
    const b = Number(m2.value);
    const boost = boostToggle.checked ? PITCH_BOOST : 1;

    model = synthesize(audioContext(), a, b, boost);

    statMc.textContent = model.mc.toFixed(1);
    statMc.insertAdjacentHTML('beforeend', '<small>태양질량</small>');

    statIsco.textContent = model.isco.toFixed(1);
    statIsco.insertAdjacentHTML('beforeend', '<small>Hz</small>');

    const cycles = fmtCycles(model.cycles, model.belowBand);
    if (cycles === null) {
      statCycles.className = 'stat__value is-text';
      statCycles.textContent = '20 Hz 위로 올라오기 전에 합쳐짐';
    } else {
      statCycles.className = 'stat__value';
      statCycles.textContent = cycles;
      statCycles.insertAdjacentHTML('beforeend', '<small>회</small>');
    }

    statDur.textContent = model.duration.toFixed(2);
    statDur.insertAdjacentHTML('beforeend', '<small>초</small>');

    updateNote();
    render(shouldPlay ? 0 : 1);
    if (shouldPlay) play(model.buffer, render);
  }

  function updateNote() {
    if (!model) return;
    const boosted = boostToggle.checked;
    const parts = [];

    if (model.belowBand) {
      parts.push(
        `f_isco 가 ${model.isco.toFixed(1)} Hz 로 관측 대역 20 Hz 아래다. ` +
        '너무 무거워서 들리는 영역에 들어오기도 전에 합쳐진다. ' +
        `들려주기 위해 ${model.f0.toFixed(1)} Hz 부터 재생한다.`
      );
    }

    if (!boosted) {
      const lowest = Math.min(model.f0, model.isco);
      if (lowest < 60) {
        parts.push('실제 주파수로 재생 중이다. 휴대폰이나 노트북 스피커로는 거의 들리지 않는다. 이어폰을 쓰면 낫다.');
      }
    }

    note.innerHTML = parts.join(' ');
    note.className = parts.length && !boosted ? 'note note--warn' : 'note';
  }

  /* ---- 조작 ---- */

  const syncLabels = () => {
    out1.textContent = m1.value;
    out2.textContent = m2.value;
  };

  /* 드래그 중에는 input 이 연달아 들어온다. 한 프레임에 한 번만 합성한다.
     가벼운 쌍은 6초짜리 버퍼라 매번 다시 만들면 손이 끌리는 느낌이 난다. */
  let pending = 0;
  function recomputeSoon() {
    cancelAnimationFrame(pending);
    pending = requestAnimationFrame(() => recompute());
  }

  [m1, m2].forEach((slider) => {
    slider.addEventListener('input', () => {
      syncLabels();
      if (audio) recomputeSoon();      // 아직 소리를 켜지 않았으면 계산도 미룬다
    });
  });

  $$('[data-preset]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const [a, b] = btn.dataset.preset.split(',');
      m1.value = a;
      m2.value = b;
      syncLabels();
      recompute({ play: true });
    });
  });

  mergeBtn.addEventListener('click', () => recompute({ play: true }));

  boostToggle.addEventListener('change', () => {
    boostNote.innerHTML = boostToggle.checked
      ? '실제보다 <span class="num">8</span>배 높은 소리로 재생합니다.'
      : '실제 주파수 그대로 재생합니다.';
    if (audio) recompute();
  });

  realBtn.addEventListener('click', async () => {
    const ctx = audioContext();
    realBtn.disabled = true;
    try {
      if (!realBuffer) {
        const res = await fetch('assets/GW150914_chirp.wav');
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        realBuffer = await ctx.decodeAudioData(await res.arrayBuffer());
      }
      play(realBuffer);
      note.className = 'note';
      note.textContent = 'GW150914 관측 데이터로 만든 소리다. 위 그래프는 근사 모형이라 세부가 다르다.';
    } catch (err) {
      note.className = 'note note--warn';
      note.textContent = `관측 소리를 불러오지 못했다 (${err.message}). 파일을 직접 열지 말고 로컬 서버로 열어야 한다.`;
    } finally {
      realBtn.disabled = false;
    }
  });

  window.addEventListener('resize', () => render(1), { passive: true });

  /* 첫 화면은 소리 없이, 축만 그려 둔다 */
  syncLabels();
  drawPlot(canvas, null, 0);
}

setupLab();

/* ==========================================================================
   체험 4 — 블랙홀 키우기
   명세서 8장. 1세대 블랙홀을 합쳐 GW231123 의 무거운 쪽을 만드는 게임.
   숫자는 전부 설명을 위한 대표값이고, 지키는 원리는 하나다 — 합치면 질량의
   일부가 중력파로 빠져나가고, 남은 것이 붙잡히려면 환경의 탈출 속도보다
   느려야 한다.
   ========================================================================== */

const MERGE_LOSS = 0.95;          // 약 5%가 중력파로 빠져나간다
const MERGED_SPIN = 0.7;          // 비슷한 질량끼리 합친 결과의 대표값
const GOAL = [120, 159];          // GW231123 무거운 쪽의 90% 구간
const MASS_GAP = [60, 130];       // 별에서 바로는 만들기 어려운 구간
const BAND_MAX = 160;
const DEAL_SIZE = 8;
const CARD_RANGE = [10, 55];      // 1세대는 간극 아래에서만 나온다

/* 어떻게 합쳐도 목표에 닿지 못하는 패가 드물게 나온다. 그런 패는 버린다. */
const DEAL_FLOOR = 130;

const ENVIRONMENTS = {
  small: { name: '작은 성단',          kick: 0.60 },
  dense: { name: '무거운 성단 중심',    kick: 0.25 },
  disk:  { name: '은하 중심 가스 원반', kick: 0.10 },
};

const randInt = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));

/* 한 패에서 만들 수 있는 가장 무거운 블랙홀.
   최종 질량은 Σ 질량 × 0.95^깊이 라서, 무거운 카드일수록 얕게 두어야 한다.
   가장 가벼운 둘을 먼저 합치는 순서가 그것을 만든다. */
function maxReachable(masses) {
  const q = [...masses].sort((a, b) => a - b);
  while (q.length > 1) {
    const a = q.shift();
    const b = q.shift();
    q.push((a + b) * MERGE_LOSS);
    q.sort((x, y) => x - y);
  }
  return q[0];
}

function dealHand() {
  let masses;
  do {
    masses = Array.from({ length: DEAL_SIZE },
      () => randInt(CARD_RANGE[0], CARD_RANGE[1]));
  } while (maxReachable(masses) < DEAL_FLOOR);
  return masses;
}

function setupGame() {
  const setup = $('#game-setup');
  const board = $('#game-board');
  if (!setup || !board) return;

  const grid = $('#game-cards');
  const logBox = $('#game-log');
  const outcome = $('#game-outcome');
  const mergeBtn = $('#game-merge');
  const pickLabel = $('#game-pick');
  const dots = $('#band-dots');

  let state = null;
  let nextId = 0;

  /* ---- 질량 띠 ---- */

  const pct = (mass) => (mass / BAND_MAX) * 100;

  function paintBandFrame() {
    $('#band-gap').style.left  = `${pct(MASS_GAP[0])}%`;
    $('#band-gap').style.width = `${pct(MASS_GAP[1] - MASS_GAP[0])}%`;

    $('#band-goal').style.left  = `${pct(GOAL[0])}%`;
    $('#band-goal').style.width = `${pct(GOAL[1] - GOAL[0])}%`;

    $('#band-marks').innerHTML = [
      { at: 0,            text: '0' },
      { at: MASS_GAP[0],  text: '60',  note: '질량 간극', cls: 'band__mark--gap' },
      { at: MASS_GAP[1],  text: '130' },
      { at: GOAL[1],      text: '159', note: '목표',      cls: 'band__mark--goal' },
    ].map((m) =>
      `<span class="band__mark ${m.cls || ''}" style="left:${pct(m.at)}%">${m.text}` +
      (m.note ? `<span>${m.note}</span>` : '') + '</span>'
    ).join('');
  }

  function paintDots() {
    dots.innerHTML = state.cards.map((c) =>
      `<span class="band__dot" data-gen="${Math.min(c.gen, 3)}" ` +
      `style="left:${pct(c.mass)}%" title="${c.mass.toFixed(1)} 태양질량"></span>`
    ).join('');
  }

  /* ---- 카드 ---- */

  /* 블랙홀은 반지름이 질량에 비례한다. 그래서 선형으로 키우는 것이 맞는데,
     1세대는 10~55 라 그대로 두면 크기 차이가 거의 안 보인다. 아래쪽을 조금
     깎아 내려 같은 비례를 유지하면서 눈에 띄는 폭을 벌린다. */
  const discSize = (mass) => {
    const t = (Math.min(mass, BAND_MAX) - CARD_RANGE[0]) / (BAND_MAX - CARD_RANGE[0]);
    return Math.round(32 + Math.pow(t, 0.72) * 72);
  };

  function paintCards(newId = null) {
    grid.innerHTML = state.cards.map((c) => {
      const d = discSize(c.mass);
      const picked = state.picked.includes(c.id);
      return `
        <button type="button" class="bh-card${c.id === newId ? ' is-new' : ''}"
                data-id="${c.id}" data-gen="${Math.min(c.gen, 3)}"
                aria-pressed="${picked}">
          <span class="bh-card__disc" style="width:${d}px;height:${d}px"></span>
          <span class="bh-card__mass">${c.mass.toFixed(c.gen === 1 ? 0 : 1)}</span>
          <span class="bh-card__gen">${c.gen}세대${c.gen > 1 ? ` · 스핀 ${MERGED_SPIN}` : ''}</span>
        </button>`;
    }).join('');
    paintDots();
  }

  function paintMeta() {
    $('#game-env').textContent = state.env.name;
    $('#game-kick').textContent = `${Math.round(state.env.kick * 100)}%`;
    $('#game-merges').textContent = state.merges;
    $('#game-gen').textContent = Math.max(...state.cards.map((c) => c.gen), 1);
  }

  function paintPick() {
    const chosen = state.picked.map((id) => state.cards.find((c) => c.id === id)).filter(Boolean);
    mergeBtn.disabled = chosen.length !== 2 || state.over || state.busy;

    if (state.over) { pickLabel.textContent = ''; return; }
    if (chosen.length === 0) { pickLabel.textContent = '카드 두 장을 고르세요'; return; }
    if (chosen.length === 1) {
      pickLabel.innerHTML = `<b>${chosen[0].mass.toFixed(1)}</b> + ?`;
      return;
    }
    const sum = (chosen[0].mass + chosen[1].mass) * MERGE_LOSS;
    pickLabel.innerHTML =
      `<b>${chosen[0].mass.toFixed(1)}</b> + <b>${chosen[1].mass.toFixed(1)}</b> → ` +
      `<b>${sum.toFixed(1)}</b> 태양질량`;
  }

  function log(html, cls = '') {
    const line = document.createElement('p');
    if (cls) line.className = cls;
    line.innerHTML = html;
    logBox.prepend(line);
  }

  /* ---- 진행 ---- */

  function start(key) {
    state = {
      env: ENVIRONMENTS[key],
      cards: dealHand().map((mass) => ({ id: nextId++, mass, gen: 1 })),
      picked: [],
      merges: 0,
      over: false,
      busy: false,
    };

    setup.hidden = true;
    board.hidden = false;
    outcome.hidden = true;
    logBox.innerHTML = '';

    paintBandFrame();
    paintCards();
    paintMeta();
    paintPick();
    log(`<span>${state.env.name}에서 시작. 1세대 블랙홀 ${DEAL_SIZE}장.</span>`);
  }

  function toggleCard(id) {
    if (state.over || state.busy) return;
    const at = state.picked.indexOf(id);
    if (at >= 0) state.picked.splice(at, 1);
    else if (state.picked.length < 2) state.picked.push(id);
    else state.picked = [state.picked[1], id];   // 세 번째를 고르면 가장 오래된 것을 민다
    paintCards();
    paintPick();
  }

  function merge() {
    if (state.busy) return;
    const [a, b] = state.picked.map((id) => state.cards.find((c) => c.id === id));
    if (!a || !b) return;

    const mass = (a.mass + b.mass) * MERGE_LOSS;
    const gen = Math.max(a.gen, b.gen) + 1;
    const kicked = Math.random() < state.env.kick;

    state.cards = state.cards.filter((c) => c.id !== a.id && c.id !== b.id);
    state.picked = [];
    state.merges++;

    const pair = `${a.mass.toFixed(1)} + ${b.mass.toFixed(1)}`;

    if (kicked) {
      log(`${pair} → <span class="kicked">튕겨 나감</span>`, '');

      /* 합쳐진 블랙홀이 환경을 벗어나는 순간이 이 게임에서 제일 중요한 장면이다.
         보드를 바로 다시 그리지 말고, 두 장이 날아가는 것을 보여 준 뒤 지운다. */
      const flying = [a.id, b.id]
        .map((id) => grid.querySelector(`[data-id="${id}"]`))
        .filter(Boolean);

      if (prefersReducedMotion || !flying.length) {
        paintCards();
        paintMeta();
        paintPick();
        checkEnd();
        return;
      }

      state.busy = true;
      flying.forEach((el) => el.classList.add('is-kicked'));
      mergeBtn.disabled = true;

      setTimeout(() => {
        state.busy = false;
        paintCards();
        paintMeta();
        paintPick();
        checkEnd();
      }, 560);
      return;
    }

    const made = { id: nextId++, mass, gen };
    state.cards.push(made);
    log(`${pair} → <b>${mass.toFixed(1)}</b> (${gen}세대)`);

    paintCards(made.id);
    paintMeta();
    paintPick();

    if (mass >= GOAL[0] && mass <= GOAL[1]) finish(true, made);
    else checkEnd();
  }

  function checkEnd() {
    if (state.cards.length <= 1) finish(false);
  }

  function finish(won, made) {
    state.over = true;
    paintPick();

    if (won) {
      log(`목표 달성 — ${made.mass.toFixed(1)} 태양질량, ${made.gen}세대`, 'won');
      outcome.innerHTML = `
        <p class="outcome__title">간극 위 블랙홀을 만들었다</p>
        <p class="outcome__stats">
          ${made.mass.toFixed(1)} 태양질량 · ${made.gen}세대 · 병합 ${state.merges}번
        </p>
        <p class="outcome__body">
          계층적 병합으로 간극 위 블랙홀을 만들었다. 실제 GW231123도 이런 과정을
          거쳤을 수 있다는 것이 유력한 가설 중 하나다. 다만 어떤 환경에서 생겼는지
          확인할 방법이 아직 없어 가설로 남아 있다. 다른 가설로는 다른 별 진화 경로,
          중력렌즈 확대가 있다.
        </p>
        <button type="button" class="btn" data-restart>다른 환경에서 다시 해 보기</button>`;
    } else {
      const left = state.cards[0];
      log('카드가 떨어졌다 — 실패', 'kicked');
      outcome.innerHTML = `
        <p class="outcome__title">카드가 떨어졌다</p>
        <p class="outcome__stats">
          ${left ? `${left.mass.toFixed(1)} 태양질량에서 멈춤` : '남은 블랙홀 없음'}
          · 병합 ${state.merges}번
        </p>
        <p class="outcome__body">
          ${state.env.name}에서는 합쳐진 블랙홀이 ${Math.round(state.env.kick * 100)}%
          확률로 튕겨 나간다. 탈출 속도가 더 큰 환경이라면 같은 카드로도 결과가 달라진다.
        </p>
        <button type="button" class="btn" data-restart>다른 환경에서 다시 해 보기</button>`;
    }

    outcome.hidden = false;
  }

  function backToSetup() {
    board.hidden = true;
    setup.hidden = false;
    outcome.hidden = true;
    state = null;
  }

  /* ---- 배선 ---- */

  $$('[data-env]').forEach((btn) => {
    btn.addEventListener('click', () => start(btn.dataset.env));
  });

  grid.addEventListener('click', (e) => {
    const card = e.target.closest('.bh-card');
    if (card) toggleCard(Number(card.dataset.id));
  });

  mergeBtn.addEventListener('click', merge);
  $('#game-restart').addEventListener('click', backToSetup);
  outcome.addEventListener('click', (e) => {
    if (e.target.closest('[data-restart]')) backToSetup();
  });
}

setupGame();

/* ==========================================================================
   체험 3 — 별의 일생 시뮬레이터
   명세서 7장. 경계값은 전부 대략값이고, 60 이상은 금속이 적은 별을 가정한
   이론 모형이다. 그 구간의 숫자는 화면에서 흐리게 보인다.
   ========================================================================== */

const STAR_MIN = 0.05;
const STAR_MAX = 300;
const STAR_STEPS = 1000;              // 슬라이더 눈금 수
const FATE_ANIM_MS = 1500;

/* 질량 간극은 남은 블랙홀의 질량으로 재는 구간이다 */
const STAR_GAP = [60, 130];
const STAR_BAND_MAX = 160;
const GW231123_HEAVY = 137;

/* 로그 슬라이더 ↔ 질량 */
const sliderToMass = (v) =>
  STAR_MIN * Math.pow(STAR_MAX / STAR_MIN, v / STAR_STEPS);
const massToSlider = (m) =>
  Math.round(Math.log(m / STAR_MIN) / Math.log(STAR_MAX / STAR_MIN) * STAR_STEPS);

/* 명세서 7장 구간표. upTo 는 그 구간의 위쪽 경계(대략값)다.
   theory 가 참이면 금속이 적은 별을 가정한 이론 모형이라 경계를 흐리게 쓴다. */
const STAR_FATES = [
  {
    upTo: 0.08, anim: 'brown',
    name: '수소 핵융합을 못 함',
    object: '갈색왜성', sn: '없음',
    source: '일반 천문학', badge: 'badge--fact', theory: false,
  },
  {
    upTo: 8, anim: 'wd',
    name: '백색왜성',
    object: '백색왜성', sn: '없음 (행성상 성운)',
    source: '수업 자료', badge: 'badge--fact', theory: false,
  },
  {
    upTo: 25, anim: 'ns',
    name: 'II형 초신성',
    object: '중성자별', sn: 'II형',
    source: '수업 자료', badge: 'badge--fact', theory: false,
  },
  {
    upTo: 60, anim: 'sn-bh',
    name: 'Ib · Ic형 초신성 또는 직접 붕괴',
    object: '블랙홀', sn: 'Ib형 · Ic형 (또는 없음)',
    source: '수업 자료', badge: 'badge--fact', theory: false,
  },
  {
    upTo: 100, anim: 'collapse-bh',
    name: '강한 항성풍 뒤 직접 붕괴',
    object: '블랙홀', sn: '없음',
    source: '이론 모형 · 확인 필요', badge: 'badge--theory', theory: true,
  },
  {
    upTo: 140, anim: 'ppisn',
    name: '맥동 쌍불안정성',
    object: '블랙홀', sn: '여러 번 질량을 뿜어냄',
    source: '이론 모형 · 확인 필요', badge: 'badge--theory', theory: true,
  },
  {
    upTo: 260, anim: 'pisn',
    name: '쌍불안정성 초신성',
    object: '아무것도 남지 않음', sn: '쌍불안정성 초신성',
    source: '이론 모형(금속이 적은 별) · 확인 필요', badge: 'badge--theory', theory: true,
  },
  {
    upTo: Infinity, anim: 'collapse-bh',
    name: '직접 붕괴',
    object: '아주 무거운 블랙홀', sn: '없음',
    source: '이론 모형(금속이 적은 별) · 확인 필요', badge: 'badge--theory', theory: true,
  },
];

const fateFor = (m) => STAR_FATES.find((f) => m < f.upTo);

/* 남는 질량. 명세서 구간표가 건 조건만 지키도록 맞춘 대략값이다.
   백색왜성만 흔히 쓰는 초기-최종 질량 선형 근사를 따르고, 그마저도
   0.8 태양질량 아래에는 쓸 수 없어 초기 질량으로 잘라 둔다. */
function remnantMass(m) {
  if (m < 0.08) return m;
  if (m < 8)    return Math.min(0.109 * m + 0.394, 1.38, m);
  if (m < 25)   return 1.4;
  if (m < 60)   return 0.45 * m;
  if (m < 100)  return 27 + (m - 60) * 0.45;
  if (m < 140)  return 45;
  if (m < 260)  return 0;
  return 0.5 * m;
}

const fmtMass = (m) =>
  m >= 100 ? m.toFixed(0) : m >= 10 ? m.toFixed(1) : m.toFixed(2);

/* --------------------------------------------------------------------------
   별 그리기. 도형만 쓴다 — 선, 원, 점.
   t 는 최후 장면의 진행도 0~1 이고, 1 이면 다 끝난 모습이다.
   -------------------------------------------------------------------------- */

const easeOut = (t) => 1 - Math.pow(1 - t, 3);

function drawStar(canvas, mass, fate, t) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cssW = canvas.clientWidth || 800;
  const cssH = cssW * 3 / 4;

  if (canvas.width !== Math.round(cssW * dpr)) {
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
  }

  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  const cx = cssW / 2;
  const cy = cssH / 2;

  /* 질량이 클수록 크고 옅게, 작을수록 작고 진하게 */
  const u = Math.log(mass / STAR_MIN) / Math.log(STAR_MAX / STAR_MIN);
  const rStar = Math.min(28 + 112 * u, cssH * 0.36);
  const lerp = (a, b) => Math.round(a + (b - a) * u);
  const starColor = `rgb(${lerp(168, 242)},${lerp(67, 234)},${lerp(28, 228)})`;

  const e = easeOut(t);

  /* 처음 별이 어디까지 차 있었는지 점선으로 남겨 둔다. 남는 천체가 백색왜성
     처럼 작을 때, 이 자국이 없으면 넓은 화면에 점 하나만 떠 있게 된다.
     "이만했는데 이만큼만 남았다" 가 이 체험의 요점이기도 하다. */
  if (e > 0.12) {
    ctx.save();
    ctx.setLineDash([3, 6]);
    ctx.strokeStyle = 'rgba(245,243,239,0.22)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, rStar, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = 'rgba(245,243,239,0.34)';
    ctx.font = '11px Pretendard, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('처음 별의 크기', cx, cy - rStar - 8);
  }

  /* 퍼져 나가는 테두리 — 초신성과 쌍불안정성에 쓴다 */
  const ring = (progress, maxScale, width) => {
    if (progress <= 0 || progress >= 1) return;
    const r = rStar * (1 + (maxScale - 1) * progress);
    ctx.save();
    ctx.globalAlpha = (1 - progress) * 0.85;
    ctx.strokeStyle = starColor;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  };

  const disc = (r, fill, stroke) => {
    /* 별은 스스로 타는 물건이다. 납작한 원이 아니라 빛나게 둔다. */
    ctx.save();
    if (fill && fill !== '#0A0A0A') {
      ctx.shadowColor = fill;
      ctx.shadowBlur = Math.min(r * 0.9, 46);
    } else if (stroke === '#D9703F') {
      ctx.shadowColor = 'rgba(217,112,63,0.9)';
      ctx.shadowBlur = 24;
    }
    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(r, 0.5), 0, Math.PI * 2);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.5; ctx.stroke(); }
    ctx.restore();
  };

  /* 남은 블랙홀의 크기도 질량에 따라 달라진다 */
  const rem = remnantMass(mass);
  const rRemnant = 8 + 34 * Math.min(rem / STAR_BAND_MAX, 1);

  switch (fate.anim) {
    case 'brown':
      /* 불이 붙지 못한 공. 작아지고 어두워질 뿐이다 */
      ctx.globalAlpha = 1 - 0.45 * e;
      disc(rStar * (1 - 0.2 * e), starColor);
      ctx.globalAlpha = 1;
      break;

    case 'wd':
      /* 바깥 껍질이 행성상 성운으로 퍼지고 중심만 남는다 */
      ring(Math.min(e / 0.75, 1), 3.2, 2);
      disc(rStar + (6 - rStar) * e, starColor);
      break;

    case 'ns':
      /* 빠르게 터지고 아주 작은 점만 남는다 */
      ring(Math.min(e / 0.45, 1), 4.4, 3);
      disc(rStar + (4 - rStar) * e, e > 0.5 ? '#F5F3EF' : starColor);
      break;

    case 'sn-bh':
      /* 터진 뒤 빛이 빠져나오지 못하는 원이 남는다 */
      ring(Math.min(e / 0.5, 1), 4.0, 3);
      disc(rStar + (rRemnant - rStar) * e, '#0A0A0A', e > 0.35 ? '#D9703F' : starColor);
      break;

    case 'collapse-bh':
      /* 터지지 않고 그대로 주저앉는다 */
      disc(rStar + (rRemnant - rStar) * e, '#0A0A0A', e > 0.25 ? '#D9703F' : starColor);
      break;

    case 'ppisn': {
      /* 여러 번 뿜어낸 뒤 주저앉는다 */
      for (let k = 0; k < 3; k++) {
        const p = (e - k * 0.17) / 0.4;
        if (p > 0 && p < 1) ring(p, 2.4, 2);
      }
      const shrink = Math.max((e - 0.5) / 0.5, 0);
      disc(rStar + (rRemnant - rStar) * shrink, shrink > 0.4 ? '#0A0A0A' : starColor,
           shrink > 0.4 ? '#D9703F' : null);
      break;
    }

    case 'pisn':
      /* 별 전체가 날아가고 아무것도 남지 않는다 */
      ring(Math.min(e / 0.8, 1), 5.2, 3);
      ctx.globalAlpha = Math.max(1 - e / 0.7, 0);
      disc(rStar * (1 - e), starColor);
      ctx.globalAlpha = 1;
      if (e >= 1) {
        ctx.strokeStyle = 'rgba(245,243,239,0.18)';
        ctx.setLineDash([3, 5]);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx, cy, rStar * 0.8, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      break;
  }
}

/* --------------------------------------------------------------------------
   배선
   -------------------------------------------------------------------------- */

function setupStars() {
  const canvas = $('#star-plot');
  const slider = $('#star-mass');
  if (!canvas || !slider) return;

  const massOut = $('#star-mass-out');
  const tag = $('#star-tag');
  const note = $('#star-note');
  const dots = $('#star-band-dots');

  let mass = sliderToMass(Number(slider.value));
  let fate = fateFor(mass);
  let frame = 0;

  /* ---- 질량 띠 ---- */

  const pct = (m) => (m / STAR_BAND_MAX) * 100;

  (function paintBandFrame() {
    $('#star-band-gap').style.left  = `${pct(STAR_GAP[0])}%`;
    $('#star-band-gap').style.width = `${pct(STAR_GAP[1] - STAR_GAP[0])}%`;
    $('#star-band-flag').style.left = `${pct(GW231123_HEAVY)}%`;

    $('#star-band-marks').innerHTML = [
      { at: 0,            text: '0' },
      { at: STAR_GAP[0],  text: '60',  note: '질량 간극', cls: 'band__mark--gap' },
      { at: STAR_GAP[1],  text: '130' },
      { at: STAR_BAND_MAX, text: '160' },
    ].map((m) =>
      `<span class="band__mark ${m.cls || ''}" style="left:${pct(m.at)}%">${m.text}` +
      (m.note ? `<span>${m.note}</span>` : '') + '</span>'
    ).join('');
  })();

  function paintDot() {
    const rem = remnantMass(mass);
    const isBlackHole = fate.object.includes('블랙홀');
    dots.innerHTML = (isBlackHole && rem > 0)
      ? `<span class="band__dot" data-gen="3" style="left:${pct(Math.min(rem, STAR_BAND_MAX))}%"
               title="${fmtMass(rem)} 태양질량"></span>`
      : '';
  }

  /* ---- 결과 카드 ---- */

  function paintFate() {
    const rem = remnantMass(mass);

    $('#fate-name').textContent = fate.name;

    const badge = $('#fate-badge');
    badge.className = `badge ${fate.badge}`;
    badge.textContent = fate.theory ? '이론' : '확인된 사실';

    $('#fate-object').textContent = fate.object;

    const remBox = $('#fate-remnant');
    if (rem > 0) {
      remBox.className = fate.theory ? 'is-dim' : '';
      remBox.innerHTML = `약 ${fmtMass(rem)}<small>태양질량</small>`;
    } else {
      remBox.className = 'is-text';
      remBox.textContent = '남지 않음';
    }

    $('#fate-sn').textContent = fate.sn;
    $('#fate-source').textContent = fate.source;

    tag.textContent = `${fmtMass(mass)} 태양질량`;

    /* 명세서: 확인하지 못한 이론 경계는 숫자를 흐리게 쓰고 한 줄을 덧붙인다 */
    const lines = [];
    if (fate.theory) {
      lines.push('이 구간의 경계는 이론 모형에 따라 크게 다르다. 금속이 적은 별을 가정한 값이다.');
    }
    if (mass < 0.8 && mass >= 0.08) {
      lines.push('이만큼 가벼운 별은 수명이 우주 나이보다 길어, 아직 백색왜성이 된 것이 하나도 없다.');
    }
    if (fate.object.includes('블랙홀')) {
      const rel = rem < STAR_GAP[0] ? '간극 아래' : rem > STAR_GAP[1] ? '간극 위' : '간극 안';
      lines.push(`남는 블랙홀은 약 ${fmtMass(rem)} 태양질량으로 질량 간극 ${rel}에 놓인다.`);
    }
    note.textContent = lines.join(' ');
    note.className = fate.theory ? 'note' : 'note';
  }

  /* ---- 최후 애니메이션 ---- */

  function playFate() {
    cancelAnimationFrame(frame);
    if (prefersReducedMotion) { drawStar(canvas, mass, fate, 1); return; }

    const start = performance.now();
    const step = (now) => {
      const t = Math.min((now - start) / FATE_ANIM_MS, 1);
      drawStar(canvas, mass, fate, t);
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
  }

  function setMass(m, { animate = true } = {}) {
    mass = m;
    fate = fateFor(mass);
    massOut.textContent = fmtMass(mass);
    paintFate();
    paintDot();
    if (animate) playFate();
    else drawStar(canvas, mass, fate, 1);
  }

  /* 드래그 중에는 숫자만 따라오고, 손을 떼면 최후를 보여 준다 */
  slider.addEventListener('input', () => {
    setMass(sliderToMass(Number(slider.value)), { animate: false });
  });

  slider.addEventListener('change', () => {
    setMass(sliderToMass(Number(slider.value)));
  });

  $$('[data-star]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const m = Number(btn.dataset.star);
      slider.value = massToSlider(m);
      setMass(m);
    });
  });

  window.addEventListener('resize', () => drawStar(canvas, mass, fate, 1), { passive: true });

  setMass(mass, { animate: false });
}

setupStars();

/* ==========================================================================
   체험 2 — 10^21 의 크기
   명세서 6장. 4 km 에서 4×10^-18 m 까지 21제곱을 내려간다.

   스크롤 대신 손으로 끄는 막대로 조절한다. 앞뒤로 오갈 수 있어야 "얼마나
   작은가" 를 비교할 수 있다. 명세서가 적어 둔 일곱 단계 사이에 참고 대상을
   더 끼워 넣었다. 세포와 원자 사이처럼 다섯 제곱이 통째로 비는 구간이 있어서,
   일곱 개만으로는 끄는 내내 빈 화면을 보게 된다.
   ========================================================================== */

const ZOOM_MARGIN = 2.6;     // 대상이 화면을 꽉 채우지 않고 숨 쉴 만큼
const ZOOM_FINAL_AT = 0.9;   // 마지막 패널이 올라오는 지점

/* 자연물은 흰빛, 사람이 만든 것은 살짝 식은 빛, 지금 보는 것은 테라코타.
   색을 더 늘리지 않고 명도와 번짐만으로 구분한다. */
const TONE_NATURAL = [245, 243, 239];
const TONE_MADE    = [205, 214, 222];
const TONE_ACTIVE  = [217, 112, 63];

const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

/* ---- 그리기 밑감 ---- */

/* 구. 왼쪽 위에서 빛을 받는 것으로 통일한다. */
function ball(ctx, cx, cy, r, tone, alpha = 1) {
  const g = ctx.createRadialGradient(
    cx - r * 0.36, cy - r * 0.4, r * 0.04, cx, cy, r);
  g.addColorStop(0, rgba(tone, 0.95 * alpha));
  g.addColorStop(0.45, rgba(tone, 0.45 * alpha));
  g.addColorStop(1, rgba(tone, 0.1 * alpha));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
}

/* 테두리에만 빛이 걸리는 고리 */
function rim(ctx, cx, cy, r, tone, alpha = 1, width = 1.6) {
  ctx.strokeStyle = rgba(tone, 0.8 * alpha);
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
}

function capsule(ctx, x, y, w, h, tone, alpha = 1) {
  const r = Math.min(w, h) / 2;
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, rgba(tone, 0.85 * alpha));
  g.addColorStop(1, rgba(tone, 0.3 * alpha));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}

/* 실루엣 그림. 흰색 + 알파로 저장해 두고 캔버스에서 색을 입힌다.
   그래야 지금 보는 대상일 때 테라코타로, 아닐 때 흰빛으로 같이 바뀐다. */
const SCALE_ART = {};

function loadArt(key, src) {
  const img = new Image();
  img.addEventListener('load', () => {
    SCALE_ART[key] = img;
    /* 캔버스는 그림이 늦게 와도 스스로 다시 그리지 않는다 */
    window.dispatchEvent(new Event('resize'));
  });
  img.src = src;
}

loadArt('human', 'assets/figure-human.png');
loadArt('burj',  'assets/obj-burj.png');
loadArt('hand',  'assets/obj-hand.png');
loadArt('hair',  'assets/obj-hair.png');

/* 사진은 색을 입히지 않는다. 실루엣이 아니라 찍어 온 것이라 원래 색이 정보다.
   지금 보는 대상일 때만 테두리에 빛을 둘러 구분한다. */
function drawPhoto(ctx, art, cx, cy, w, h, alpha, glow) {
  ctx.save();
  ctx.globalAlpha = alpha;
  if (glow) {
    ctx.shadowColor = rgba(TONE_ACTIVE, 0.7);
    ctx.shadowBlur = Math.min(Math.max(w, h) * 0.12, 30);
  }
  ctx.drawImage(art, cx - w / 2, cy - h / 2, w, h);
  ctx.restore();
}

const ready = (k) => SCALE_ART[k] && SCALE_ART[k].naturalHeight > 0;

/* 사진은 늘리면 뭉개진다. 원본보다 지나치게 크게 그려야 하는 자리에서는
   사진을 포기하고 그려 둔 도형으로 돌아간다 — 도형은 아무리 키워도 선명하다. */
const PHOTO_MAX_UPSCALE = 2.2;

function photoFor(key, drawnPx) {
  const art = SCALE_ART[key];
  if (!art || !art.naturalHeight) return null;
  return drawnPx > art.naturalHeight * PHOTO_MAX_UPSCALE ? null : art;
}

const artTint = new Map();

function tintedArt(img, tone) {
  const key = `${img.src}|${tone.join(',')}`;
  let c = artTint.get(key);
  if (c) return c;

  c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const x = c.getContext('2d');
  x.drawImage(img, 0, 0);
  x.globalCompositeOperation = 'source-in';
  x.fillStyle = `rgb(${tone[0]},${tone[1]},${tone[2]})`;
  x.fillRect(0, 0, c.width, c.height);

  artTint.set(key, c);
  return c;
}

/* ---- 대상들. 크기는 미터, px 는 화면에서의 지름이다. ---- */

const SCALE_OBJECTS = [
  {
    size: 4e3, star: 1, name: 'LIGO 팔 길이', label: '4&times;10<sup>3</sup> m', made: true,
    draw(ctx, cx, cy, px, tone, a) {
      const L = px;
      const x0 = cx - L / 2;
      const y0 = cy + L / 2;
      const beam = Math.max(L * 0.022, 2);

      /* 진공관 두 개 */
      capsule(ctx, x0, y0 - beam / 2, L, beam, tone, a);
      capsule(ctx, x0 - beam / 2, y0 - L, beam, L, tone, a);

      /* 관 안을 달리는 빛 */
      ctx.save();
      ctx.shadowColor = rgba(tone, 0.9 * a);
      ctx.shadowBlur = Math.min(L * 0.05, 18);
      ctx.strokeStyle = rgba(tone, 0.95 * a);
      ctx.lineWidth = Math.max(beam * 0.22, 1);
      ctx.beginPath();
      ctx.moveTo(x0 + L, y0); ctx.lineTo(x0, y0); ctx.lineTo(x0, y0 - L);
      ctx.stroke();
      ctx.restore();

      /* 양 끝 거울과 꺾이는 자리의 건물 */
      const m = Math.max(L * 0.05, 4);
      ctx.fillStyle = rgba(tone, 0.9 * a);
      ctx.beginPath(); ctx.roundRect(x0 + L - m / 2, y0 - m, m, m * 2, 2); ctx.fill();
      ctx.beginPath(); ctx.roundRect(x0 - m, y0 - L - m / 2, m * 2, m, 2); ctx.fill();
      ctx.beginPath(); ctx.roundRect(x0 - m, y0 - m, m * 2, m * 2, 2); ctx.fill();
    },
  },
  {
    size: 828, name: '부르즈 할리파', label: '828 m', made: true,
    draw(ctx, cx, cy, px, tone, a) {
      const burj = photoFor('burj', px);
      if (burj) {
        const art = burj;
        drawPhoto(ctx, art, cx, cy, px * (art.naturalWidth / art.naturalHeight), px,
                  a, tone === TONE_ACTIVE);
        return;
      }
      const H = px, W = px * 0.17;
      const top = cy - H / 2;
      ctx.fillStyle = rgba(tone, 0.55 * a);
      ctx.beginPath();
      ctx.moveTo(cx - W / 2, cy + H / 2);
      ctx.lineTo(cx - W * 0.17, top + H * 0.22);
      ctx.lineTo(cx, top);
      ctx.lineTo(cx + W * 0.17, top + H * 0.22);
      ctx.lineTo(cx + W / 2, cy + H / 2);
      ctx.closePath();
      ctx.fill();
      /* 층이 쌓인 자국 */
      ctx.strokeStyle = rgba(tone, 0.22 * a);
      ctx.lineWidth = 1;
      for (let i = 1; i < 14; i++) {
        const t = i / 14;
        const y = cy + H / 2 - H * t;
        const hw = (W / 2) * (1 - t * 0.78);
        ctx.beginPath(); ctx.moveTo(cx - hw, y); ctx.lineTo(cx + hw, y); ctx.stroke();
      }
    },
  },
  {
    size: 30, name: '아파트 10층', label: '약 30 m',  made: true,
    draw(ctx, cx, cy, px, tone, a) {
      const H = px, W = px * 0.62;
      const x = cx - W / 2, y = cy - H / 2;
      const g = ctx.createLinearGradient(x, 0, x + W, 0);
      g.addColorStop(0, rgba(tone, 0.22 * a));
      g.addColorStop(0.35, rgba(tone, 0.5 * a));
      g.addColorStop(1, rgba(tone, 0.18 * a));
      ctx.fillStyle = g;
      ctx.fillRect(x, y, W, H);

      /* 창문. 몇 집은 불이 켜져 있다. */
      const cols = 5, rows = 10;
      const cw = W / (cols * 2 + 1), chh = H / (rows * 2 + 1);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const lit = ((r * 7 + c * 3) % 5) < 2;
          ctx.fillStyle = rgba(tone, (lit ? 0.75 : 0.16) * a);
          ctx.fillRect(x + cw * (c * 2 + 1), y + chh * (r * 2 + 1), cw, chh);
        }
      }
    },
  },
  {
    size: 4.5, name: '자동차', label: '약 4.5 m', made: true,
    draw(ctx, cx, cy, px, tone, a) {
      const L = px, H = L * 0.42;
      const y = cy + H * 0.2;
      ctx.fillStyle = rgba(tone, 0.55 * a);
      ctx.beginPath();
      ctx.moveTo(cx - L / 2, y);
      ctx.lineTo(cx - L / 2, y - H * 0.42);
      ctx.quadraticCurveTo(cx - L * 0.3, y - H * 0.5, cx - L * 0.22, y - H * 0.52);
      ctx.lineTo(cx - L * 0.1, y - H);
      ctx.lineTo(cx + L * 0.16, y - H);
      ctx.quadraticCurveTo(cx + L * 0.3, y - H * 0.95, cx + L * 0.33, y - H * 0.5);
      ctx.quadraticCurveTo(cx + L * 0.46, y - H * 0.46, cx + L / 2, y - H * 0.34);
      ctx.lineTo(cx + L / 2, y);
      ctx.closePath();
      ctx.fill();

      /* 창 */
      ctx.fillStyle = rgba(tone, 0.22 * a);
      ctx.beginPath();
      ctx.moveTo(cx - L * 0.17, y - H * 0.52);
      ctx.lineTo(cx - L * 0.07, y - H * 0.92);
      ctx.lineTo(cx + L * 0.13, y - H * 0.92);
      ctx.lineTo(cx + L * 0.27, y - H * 0.52);
      ctx.closePath();
      ctx.fill();

      /* 바퀴 */
      for (const dx of [-0.27, 0.27]) {
        ctx.beginPath();
        ctx.arc(cx + L * dx, y, H * 0.26, 0, Math.PI * 2);
        ctx.fillStyle = rgba(tone, 0.85 * a);
        ctx.fill();
      }
    },
  },
  {
    size: 1.7, star: 2, name: '사람 키', label: '1.7 m',
    draw(ctx, cx, cy, px, tone, a) {
      /* 실루엣 그림이 도착했으면 그걸 쓴다. 아직이거나 못 받았으면
         아래에서 직접 그린다 — 그림 하나 때문에 체험이 멈추면 안 된다. */
      const art = photoFor('human', px / 1.8);
      if (art) {
        const h = px;
        const w = h * (art.naturalWidth / art.naturalHeight);
        ctx.save();
        ctx.globalAlpha = a;
        ctx.shadowColor = rgba(tone, 0.55);
        ctx.shadowBlur = Math.min(h * 0.11, 26);
        ctx.drawImage(tintedArt(art, tone), cx - w / 2, cy - h / 2, w, h);
        ctx.restore();
        return;
      }

      /* 화장실 표지판 같은 픽토그램으로 그린다. 가는 선으로 된 막대 사람은
         작아지면 먼저 사라져서, 축척을 비교하는 자리에서는 못 쓴다. */
      const H = px;
      const top = cy - H / 2;
      const headR = H * 0.085;
      const shoulder = top + H * 0.205;
      const hip = top + H * 0.56;
      const foot = cy + H / 2;

      ctx.save();
      ctx.shadowColor = rgba(tone, 0.55 * a);
      ctx.shadowBlur = Math.min(H * 0.12, 26);

      const g = ctx.createLinearGradient(cx - H * 0.13, 0, cx + H * 0.13, 0);
      g.addColorStop(0, rgba(tone, 0.42 * a));
      g.addColorStop(0.38, rgba(tone, 0.95 * a));
      g.addColorStop(1, rgba(tone, 0.4 * a));
      ctx.fillStyle = g;

      /* 머리 */
      ctx.beginPath();
      ctx.arc(cx, top + headR, headR, 0, Math.PI * 2);
      ctx.fill();

      /* 어깨에서 팔까지 한 덩어리인 몸통 */
      const sw = H * 0.125;          // 어깨 반폭 (팔 포함)
      const hw = H * 0.072;          // 허리 반폭
      const r = H * 0.035;
      ctx.beginPath();
      ctx.moveTo(cx - sw + r, shoulder);
      ctx.quadraticCurveTo(cx - sw, shoulder, cx - sw, shoulder + r);
      ctx.lineTo(cx - hw, hip);
      ctx.lineTo(cx + hw, hip);
      ctx.lineTo(cx + sw, shoulder + r);
      ctx.quadraticCurveTo(cx + sw, shoulder, cx + sw - r, shoulder);
      ctx.closePath();
      ctx.fill();

      /* 다리 둘, 사이를 조금 띄운다 */
      const lw = H * 0.058;
      const gap = H * 0.012;
      for (const side of [-1, 1]) {
        const x = cx + side * gap - (side < 0 ? lw : 0);
        ctx.beginPath();
        ctx.roundRect(x, hip - H * 0.01, lw, foot - hip + H * 0.01,
                      [0, 0, lw * 0.4, lw * 0.4]);
        ctx.fill();
      }
      ctx.restore();
    },
  },
  {
    size: 0.1, name: '손바닥', label: '약 10 cm',
    draw(ctx, cx, cy, px, tone, a) {
      const handArt = photoFor('hand', px);
      if (handArt) {
        const art = handArt;
        drawPhoto(ctx, art, cx, cy, px * (art.naturalWidth / art.naturalHeight), px,
                  a, tone === TONE_ACTIVE);
        return;
      }
      const H = px;
      capsule(ctx, cx - H * 0.3, cy - H * 0.06, H * 0.6, H * 0.46, tone, a);
      for (let i = 0; i < 4; i++) {
        const x = cx - H * 0.27 + i * H * 0.17;
        capsule(ctx, x, cy - H * 0.48, H * 0.12, H * 0.45, tone, a);
      }
      capsule(ctx, cx - H * 0.46, cy - H * 0.02, H * 0.2, H * 0.11, tone, a);
    },
  },
  {
    size: 5e-3, name: '개미', label: '약 5 mm',
    draw(ctx, cx, cy, px, tone, a) {
      const L = px;
      ball(ctx, cx - L * 0.3, cy, L * 0.15, tone, a);   // 머리
      ball(ctx, cx,           cy, L * 0.12, tone, a);   // 가슴
      ball(ctx, cx + L * 0.32, cy, L * 0.2, tone, a);   // 배
      ctx.strokeStyle = rgba(tone, 0.6 * a);
      ctx.lineWidth = Math.max(L * 0.016, 1);
      for (let i = -1; i <= 1; i++) {
        for (const s of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(cx + i * L * 0.1, cy);
          ctx.quadraticCurveTo(cx + i * L * 0.16, cy + s * L * 0.2,
                               cx + i * L * 0.3, cy + s * L * 0.3);
          ctx.stroke();
        }
      }
      for (const s of [-1, 1]) {   // 더듬이
        ctx.beginPath();
        ctx.moveTo(cx - L * 0.38, cy);
        ctx.quadraticCurveTo(cx - L * 0.52, cy + s * L * 0.08,
                             cx - L * 0.56, cy + s * L * 0.22);
        ctx.stroke();
      }
    },
  },
  {
    size: 1e-4, star: 3, name: '머리카락 굵기', label: '약 10<sup>-4</sup> m',
    draw(ctx, cx, cy, px, tone, a, w, h) {
      const hairArt = photoFor('hair', px);
      if (hairArt) {
        /* 사진 속 가닥은 가로로 누워 있다. 90도 돌려 세우면 짧은 변이
           굵기가 된다. 화면보다 짧으면 위아래로 이어 붙인다. */
        const art = hairArt;
        const thick = px;
        const seg = thick * (art.naturalWidth / art.naturalHeight);
        ctx.save();
        ctx.globalAlpha = a;
        if (tone === TONE_ACTIVE) {
          ctx.shadowColor = rgba(TONE_ACTIVE, 0.6);
          ctx.shadowBlur = Math.min(thick * 0.25, 26);
        }
        ctx.translate(cx, cy);
        ctx.rotate(Math.PI / 2);
        const n = Math.ceil(h / seg) + 2;
        for (let i = -n; i <= n; i++) {
          ctx.drawImage(art, i * seg - seg / 2, -thick / 2, seg, thick);
        }
        ctx.restore();
        return;
      }
      const W = px;
      const g = ctx.createLinearGradient(cx - W / 2, 0, cx + W / 2, 0);
      g.addColorStop(0, rgba(tone, 0.12 * a));
      g.addColorStop(0.3, rgba(tone, 0.62 * a));
      g.addColorStop(0.46, rgba(tone, 0.95 * a));   // 가닥에 맺히는 빛
      g.addColorStop(0.7, rgba(tone, 0.5 * a));
      g.addColorStop(1, rgba(tone, 0.1 * a));
      ctx.fillStyle = g;
      ctx.fillRect(cx - W / 2, -h, W, h * 3);

      /* 큐티클 비늘 */
      if (W > 26) {
        ctx.strokeStyle = rgba(tone, 0.2 * a);
        ctx.lineWidth = 1;
        for (let y = -h; y < h * 2; y += W * 0.42) {
          ctx.beginPath();
          ctx.moveTo(cx - W / 2, y);
          ctx.lineTo(cx + W / 2, y + W * 0.2);
          ctx.stroke();
        }
      }
    },
  },
  {
    size: 1e-5, star: 4, name: '세포', label: '약 10<sup>-5</sup> m',
    draw(ctx, cx, cy, px, tone, a) {
      const r = px / 2;
      const g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.1, cx, cy, r);
      g.addColorStop(0, rgba(tone, 0.26 * a));
      g.addColorStop(0.75, rgba(tone, 0.12 * a));
      g.addColorStop(1, rgba(tone, 0.03 * a));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();

      ctx.save();
      ctx.shadowColor = rgba(tone, 0.7 * a);
      ctx.shadowBlur = Math.min(r * 0.3, 18);
      rim(ctx, cx, cy, r, tone, a, Math.max(r * 0.035, 1.4));
      ctx.restore();

      ball(ctx, cx + r * 0.18, cy - r * 0.12, r * 0.3, tone, a * 0.9);   // 핵
      if (r > 40) {
        for (const [dx, dy, s] of [[-0.42, 0.3, 0.1], [-0.2, -0.5, 0.08],
                                   [0.45, 0.42, 0.09], [-0.55, -0.1, 0.07]]) {
          ball(ctx, cx + r * dx, cy + r * dy, r * s, tone, a * 0.55);
        }
      }
    },
  },
  {
    size: 7e-6, name: '적혈구', label: '약 7 &micro;m',
    draw(ctx, cx, cy, px, tone, a) {
      const r = px / 2;
      /* 가운데가 눌린 도넛 */
      const g = ctx.createRadialGradient(cx, cy, r * 0.05, cx, cy, r);
      g.addColorStop(0, rgba(tone, 0.1 * a));
      g.addColorStop(0.42, rgba(tone, 0.22 * a));
      g.addColorStop(0.72, rgba(tone, 0.72 * a));
      g.addColorStop(1, rgba(tone, 0.18 * a));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
      rim(ctx, cx, cy, r, tone, a * 0.7, Math.max(r * 0.03, 1));
    },
  },
  {
    size: 2e-6, name: '세균', label: '약 2 &micro;m',
    draw(ctx, cx, cy, px, tone, a) {
      const L = px;
      capsule(ctx, cx - L * 0.5, cy - L * 0.17, L, L * 0.34, tone, a);
      ctx.strokeStyle = rgba(tone, 0.5 * a);
      ctx.lineWidth = Math.max(L * 0.02, 1);
      for (const s of [-1, 1]) {   // 편모
        ctx.beginPath();
        ctx.moveTo(cx + L * 0.5, cy + s * L * 0.05);
        for (let i = 0; i <= 18; i++) {
          const t = i / 18;
          ctx.lineTo(cx + L * (0.5 + t * 0.55),
                     cy + s * L * 0.05 + Math.sin(t * 11) * L * 0.1);
        }
        ctx.stroke();
      }
    },
  },
  {
    size: 1e-7, name: '바이러스', label: '약 10<sup>-7</sup> m',
    draw(ctx, cx, cy, px, tone, a) {
      const r = px / 2;
      ctx.save();
      ctx.shadowColor = rgba(tone, 0.6 * a);
      ctx.shadowBlur = Math.min(r * 0.4, 16);

      /* 껍질은 각진 다면체다 */
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const t = (i / 6) * Math.PI * 2 - Math.PI / 2;
        const x = cx + Math.cos(t) * r * 0.64;
        const y = cy + Math.sin(t) * r * 0.64;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.closePath();
      const g = ctx.createRadialGradient(cx - r * 0.2, cy - r * 0.25, r * 0.05, cx, cy, r * 0.7);
      g.addColorStop(0, rgba(tone, 0.85 * a));
      g.addColorStop(1, rgba(tone, 0.25 * a));
      ctx.fillStyle = g;
      ctx.fill();
      ctx.restore();

      /* 돌기 */
      ctx.strokeStyle = rgba(tone, 0.55 * a);
      ctx.lineWidth = Math.max(r * 0.045, 1);
      for (let i = 0; i < 14; i++) {
        const t = (i / 14) * Math.PI * 2;
        const x1 = cx + Math.cos(t) * r * 0.62, y1 = cy + Math.sin(t) * r * 0.62;
        const x2 = cx + Math.cos(t) * r, y2 = cy + Math.sin(t) * r;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        ctx.beginPath(); ctx.arc(x2, y2, Math.max(r * 0.055, 1), 0, Math.PI * 2);
        ctx.fillStyle = rgba(tone, 0.7 * a); ctx.fill();
      }
    },
  },
  {
    size: 2e-9, name: 'DNA 가닥 폭', label: '약 2 nm',
    draw(ctx, cx, cy, px, tone, a, w, h) {
      const W = px;
      const span = Math.min(h * 1.1, W * 9);
      ctx.lineWidth = Math.max(W * 0.08, 1.4);

      for (const phase of [0, Math.PI]) {
        ctx.strokeStyle = rgba(tone, (phase ? 0.45 : 0.85) * a);
        ctx.beginPath();
        for (let i = 0; i <= 90; i++) {
          const t = i / 90;
          const y = cy - span / 2 + span * t;
          const x = cx + Math.sin(t * Math.PI * 5 + phase) * W * 0.5;
          i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
        ctx.stroke();
      }
      /* 염기쌍 가로대 */
      ctx.strokeStyle = rgba(tone, 0.3 * a);
      ctx.lineWidth = Math.max(W * 0.05, 1);
      for (let i = 0; i <= 26; i++) {
        const t = i / 26;
        const y = cy - span / 2 + span * t;
        const o = Math.sin(t * Math.PI * 5) * W * 0.5;
        ctx.beginPath(); ctx.moveTo(cx - o, y); ctx.lineTo(cx + o, y); ctx.stroke();
      }
    },
  },
  {
    size: 1e-10, star: 5, name: '원자', label: '약 10<sup>-10</sup> m',
    draw(ctx, cx, cy, px, tone, a) {
      const r = px / 2;
      /* 전자는 궤도가 아니라 확률 구름이다 */
      for (let i = 4; i >= 1; i--) {
        const rr = r * (i / 4);
        const g = ctx.createRadialGradient(cx, cy, rr * 0.55, cx, cy, rr);
        g.addColorStop(0, rgba(tone, 0));
        g.addColorStop(0.75, rgba(tone, 0.05 * a));
        g.addColorStop(1, rgba(tone, 0));
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI * 2); ctx.fill();
      }
      ctx.save();
      ctx.setLineDash([Math.max(r * 0.05, 2), Math.max(r * 0.07, 3)]);
      ctx.strokeStyle = rgba(tone, 0.3 * a);
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();

      ctx.save();
      ctx.shadowColor = rgba(tone, 0.95 * a);
      ctx.shadowBlur = Math.min(r * 0.5, 26);
      ball(ctx, cx, cy, Math.max(r * 0.035, 2.5), tone, a);
      ctx.restore();
    },
  },
  {
    size: 1e-14, name: '원자핵', label: '약 10<sup>-14</sup> m',
    draw(ctx, cx, cy, px, tone, a) {
      const r = px / 2;
      const n = 12;
      ctx.save();
      ctx.shadowColor = rgba(tone, 0.7 * a);
      ctx.shadowBlur = Math.min(r * 0.5, 20);
      for (let i = 0; i < n; i++) {
        const t = (i / n) * Math.PI * 2 * 1.618;
        const d = r * 0.62 * Math.sqrt(i / n);
        ball(ctx, cx + Math.cos(t) * d, cy + Math.sin(t) * d, r * 0.3, tone, a * 0.9);
      }
      ctx.restore();
    },
  },
  {
    size: 1.7e-15, star: 6, name: '양성자', label: '약 1.7&times;10<sup>-15</sup> m',
    draw(ctx, cx, cy, px, tone, a) {
      const r = px / 2;
      const g = ctx.createRadialGradient(cx, cy, r * 0.1, cx, cy, r);
      g.addColorStop(0, rgba(tone, 0.5 * a));
      g.addColorStop(0.7, rgba(tone, 0.18 * a));
      g.addColorStop(1, rgba(tone, 0.02 * a));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();

      /* 안에 쿼크 셋 */
      ctx.save();
      ctx.shadowColor = rgba(tone, 0.95 * a);
      ctx.shadowBlur = Math.min(r * 0.6, 22);
      for (let i = 0; i < 3; i++) {
        const t = (i / 3) * Math.PI * 2 - Math.PI / 2;
        ball(ctx, cx + Math.cos(t) * r * 0.34, cy + Math.sin(t) * r * 0.34,
             Math.max(r * 0.17, 2), tone, a);
      }
      ctx.restore();
      rim(ctx, cx, cy, r, tone, a * 0.4, 1);
    },
  },
  {
    size: 4e-18, star: 7, name: '중력파가 바꾼 팔 길이', label: '약 4&times;10<sup>-18</sup> m',
    draw(ctx, cx, cy, px, tone, a) {
      const half = px / 2;
      const tick = Math.max(px * 0.75, 30);
      ctx.save();
      ctx.shadowColor = rgba(tone, 0.95 * a);
      ctx.shadowBlur = 20;
      ctx.strokeStyle = rgba(tone, 0.95 * a);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx - half, cy - tick); ctx.lineTo(cx - half, cy + tick);
      ctx.moveTo(cx + half, cy - tick); ctx.lineTo(cx + half, cy + tick);
      ctx.stroke();
      ctx.restore();

      /* 두 눈금 사이를 가리키는 화살 */
      ctx.strokeStyle = rgba(tone, 0.8 * a);
      ctx.lineWidth = 1.4;
      const arm = Math.max(px * 2.6, 46);
      ctx.beginPath();
      ctx.moveTo(cx - half - arm, cy); ctx.lineTo(cx - half, cy);
      ctx.moveTo(cx + half, cy);       ctx.lineTo(cx + half + arm, cy);
      ctx.moveTo(cx - half - 9, cy - 4); ctx.lineTo(cx - half, cy); ctx.lineTo(cx - half - 9, cy + 4);
      ctx.moveTo(cx + half + 9, cy - 4); ctx.lineTo(cx + half, cy); ctx.lineTo(cx + half + 9, cy + 4);
      ctx.stroke();
    },
  },
];

/* 명세서가 못 박은 일곱 단계. 레일과 진행도는 이것만 쓴다. */
const ZOOM_STEPS = SCALE_OBJECTS.filter((o) => o.star);
const ZOOM_FOV0 = ZOOM_STEPS[0].size * ZOOM_MARGIN;

/* 진행도를 단계 사이 로그 보간으로 바꾼다. 단계마다 같은 거리를 쓰므로
   간격이 한 제곱인 구간과 다섯 제곱인 구간의 속도가 다르다. 실제로 그렇다. */
function zoomStateAt(p) {
  const last = ZOOM_STEPS.length - 1;
  const seg = Math.min(Math.max(p, 0), 1) * last;
  const i = Math.min(Math.floor(seg), last - 1);
  const frac = seg - i;

  const a = Math.log10(ZOOM_STEPS[i].size * ZOOM_MARGIN);
  const b = Math.log10(ZOOM_STEPS[i + 1].size * ZOOM_MARGIN);
  const fov = Math.pow(10, a + (b - a) * frac);

  return { fov, active: Math.round(seg), seg };
}

/* 화면에 들어온 것 중 지금 폭에 가장 가까운 대상 */
function nearestObject(fov) {
  const target = fov / ZOOM_MARGIN;
  let best = SCALE_OBJECTS[0];
  let gap = Infinity;
  for (const o of SCALE_OBJECTS) {
    const d = Math.abs(Math.log10(o.size / target));
    if (d < gap) { gap = d; best = o; }
  }
  return best;
}

/* --------------------------------------------------------------------------
   한 장 그리기
   -------------------------------------------------------------------------- */

function drawZoom(canvas, fov, focus) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth || 800;
  const h = canvas.clientHeight || 460;

  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }

  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const cx = w / 2;
  const cy = h / 2;
  /* 시야폭을 캔버스 폭으로만 잡으면, 가로로 납작한 화면에서 LIGO 의 L 자처럼
     세로로 큰 대상이 위아래로 잘린다. 높이에도 걸리게 묶어 둔다. */
  const pxPerM = Math.min(w, h * 1.9) / fov;
  const reach = Math.max(w, h);

  /* 반제곱마다 모서리만 그은 상자. 대상이 비는 구간에서도 바닥이 계속
     자라 올라와 멈춘 것처럼 보이지 않게 한다. */
  ctx.font = '10px "JetBrains Mono", monospace';
  ctx.textBaseline = 'bottom';
  ctx.textAlign = 'left';
  ctx.lineWidth = 1;

  for (let half = 8; half >= -38; half--) {
    const n = half / 2;
    const side = Math.pow(10, n) * pxPerM;
    if (side < 30 || side > reach * 2.8) continue;

    const fade = Math.min((side - 30) / 70, 1) *
                 Math.min((reach * 2.8 - side) / (reach * 1.2), 1);
    const x = cx - side / 2, y = cy - side / 2;
    const arm = Math.min(side * 0.13, 24);

    ctx.strokeStyle = `rgba(245,243,239,${(0.26 * fade).toFixed(3)})`;
    ctx.beginPath();
    ctx.moveTo(x, y + arm); ctx.lineTo(x, y); ctx.lineTo(x + arm, y);
    ctx.moveTo(x + side - arm, y); ctx.lineTo(x + side, y); ctx.lineTo(x + side, y + arm);
    ctx.moveTo(x + side, y + side - arm); ctx.lineTo(x + side, y + side); ctx.lineTo(x + side - arm, y + side);
    ctx.moveTo(x + arm, y + side); ctx.lineTo(x, y + side); ctx.lineTo(x, y + side - arm);
    ctx.stroke();

    if (Number.isInteger(n) && side > 120 && side < reach * 1.6) {
      ctx.fillStyle = `rgba(245,243,239,${(0.4 * fade).toFixed(3)})`;
      ctx.fillText(`10^${n} m`, x + 6, y - 5);
    }
  }

  /* 대상들. 큰 것부터 그려 작은 것이 위에 오게 한다. */
  let focusPx = 0;
  for (const o of SCALE_OBJECTS) {
    const px = o.size * pxPerM;
    /* 원자와 원자핵 사이에는 네 제곱 동안 아무것도 없다. 거기서도 화면이
       비지 않으려면, 화면보다 커진 대상을 지우는 대신 그 안으로 들어온
       것처럼 옅게 깔아 두어야 한다. */
    if (px < 1 || px > reach * 60) continue;

    const isFocus = o === focus;
    if (isFocus) focusPx = px;

    const fadeIn = Math.min(px / 22, 1);
    /* 화면보다 커진 대상은 그 안에 들어와 있다는 뜻이다. 지우지는 않되
       빠르게 물러나게 해야 한다. 선형으로 줄이면 원자핵처럼 알갱이가 여럿인
       것이 화면 가득 회색 덩어리로 뭉개진다. */
    const fadeOut = px <= reach ? 1 : Math.max(0.05, Math.pow(reach / px, 1.6));

    const alpha = isFocus
      ? Math.min(1, Math.max(0.3, (reach * 3) / px))
      : fadeIn * fadeOut * 0.34;
    if (alpha <= 0.02) continue;

    const tone = isFocus ? TONE_ACTIVE : (o.made ? TONE_MADE : TONE_NATURAL);
    ctx.save();
    o.draw(ctx, cx, cy, px, tone, alpha, w, h);
    ctx.restore();

    if (isFocus && px > 24) {
      ctx.fillStyle = rgba(TONE_ACTIVE, 0.95);
      ctx.font = '12px Pretendard, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(o.name, cx, Math.min(cy + px / 2 + 12, h - 40));
    }
  }

  /* 지금 보는 것이 아직 점보다 작을 때. 축척을 속이지 않으려고 대상을
     키우는 대신, 조준선인 것이 보이는 점선 고리만 둔다. */
  if (focusPx < 7) {
    ctx.save();
    ctx.setLineDash([3, 5]);
    ctx.strokeStyle = rgba(TONE_ACTIVE, 0.55);
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx, cy, 17, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();

    ctx.fillStyle = rgba(TONE_ACTIVE, 0.85);
    ctx.font = '11px Pretendard, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(`${focus.name} — 아직 ${focusPx < 1 ? '보이지 않음' : '1픽셀'}`, cx, cy + 26);
  }

  /* 눈금자. 화면 한 뼘이 몇 미터인지 늘 읽힌다. */
  const barPx = 120;
  const barM = barPx / pxPerM;
  const e = Math.floor(Math.log10(barM));
  const bx = 18, by = h - 20;

  ctx.strokeStyle = 'rgba(245,243,239,0.45)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(bx, by - 5); ctx.lineTo(bx, by + 5);
  ctx.moveTo(bx, by);     ctx.lineTo(bx + barPx, by);
  ctx.moveTo(bx + barPx, by - 5); ctx.lineTo(bx + barPx, by + 5);
  ctx.stroke();

  ctx.fillStyle = 'rgba(245,243,239,0.55)';
  ctx.font = '11px "JetBrains Mono", monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  ctx.fillText(`${(barM / Math.pow(10, e)).toFixed(1)}e${e} m`, bx, by - 9);
}

/* --------------------------------------------------------------------------
   배선
   -------------------------------------------------------------------------- */

function setupZoom() {
  const slider = $('#zoom-slider');
  const canvas = $('#zoom-canvas');
  if (!slider || !canvas) return;

  const what = $('#zoom-what');
  const kind = $('#zoom-kind');
  const sizeOut = $('#zoom-size');
  const magOut = $('#zoom-mag');
  const rail = $('#zoom-rail');
  const final = $('#zoom-final');

  rail.innerHTML = ZOOM_STEPS.map((o, i) =>
    `<button type="button" class="scale__step" data-step="${i}"
             aria-current="${i === 0}">${o.name}</button>`
  ).join('');
  const steps = $$('.scale__step', rail);

  let queued = false;

  function paint() {
    queued = false;
    const p = Number(slider.value) / Number(slider.max);
    const { fov, active } = zoomStateAt(p);
    const focus = nearestObject(fov);

    drawZoom(canvas, fov, focus);

    what.textContent = focus.name;
    sizeOut.innerHTML = focus.label;
    kind.hidden = Boolean(focus.star);

    const mag = ZOOM_FOV0 / fov;
    magOut.innerHTML = mag < 9.5
      ? `${mag.toFixed(1)}배`
      : `10<sup>${Math.round(Math.log10(mag))}</sup>배`;

    steps.forEach((b, i) => b.setAttribute('aria-current', String(i === active)));
    final.classList.toggle('is-in', p >= ZOOM_FINAL_AT);
  }

  function schedule() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(paint);
  }

  slider.addEventListener('input', schedule);

  steps.forEach((btn) => {
    btn.addEventListener('click', () => {
      const i = Number(btn.dataset.step);
      slider.value = String(Math.round(i / (ZOOM_STEPS.length - 1) * Number(slider.max)));
      paint();
    });
  });

  window.addEventListener('resize', schedule, { passive: true });
  paint();
}

setupZoom();


/* ==========================================================================
   별먼지
   바닥이 완전한 평면 검정이면 상자들이 허공에 떠 보인다. 아주 옅은 별을
   깔아서 "뒤에 공간이 있다" 를 만든다. 내려받는 바이트는 0 이다.
   ========================================================================== */

const DUST_PER_MPX = 190;      // 100만 픽셀당 별 개수

function paintStardust(canvas) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = window.innerWidth;
  const h = window.innerHeight;

  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);

  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const count = Math.round((w * h) / 1e6 * DUST_PER_MPX);

  for (let i = 0; i < count; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    const r = Math.pow(Math.random(), 2.4) * 1.5 + 0.25;
    const a = 0.1 + Math.random() * 0.4;

    /* 열에 하나쯤은 따뜻한 색을 섞어 죽은 회색 점으로 보이지 않게 한다 */
    ctx.fillStyle = Math.random() < 0.1
      ? `rgba(217,112,63,${(a * 0.8).toFixed(3)})`
      : `rgba(245,243,239,${a.toFixed(3)})`;

    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();

    /* 큰 별만 번지게 둔다 */
    if (r > 1.2) {
      ctx.save();
      ctx.globalAlpha = a * 0.35;
      ctx.shadowColor = '#F5F3EF';
      ctx.shadowBlur = 7;
      ctx.beginPath();
      ctx.arc(x, y, r * 0.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
}

(function setupStardust() {
  const canvas = $('#stardust');
  if (!canvas) return;

  paintStardust(canvas);

  /* 화면 크기가 바뀔 때만 다시 그린다. 스크롤에는 반응하지 않는다. */
  let t = 0;
  window.addEventListener('resize', () => {
    clearTimeout(t);
    t = setTimeout(() => paintStardust(canvas), 220);
  }, { passive: true });
})();

/* 글꼴이 도착하기 전에 그려진 캔버스는 한글이 두부로 남는다. DOM 과 달리
   캔버스는 글꼴이 바뀌어도 스스로 다시 그리지 않는다. 세 캔버스 모두
   resize 에서 다시 그리므로, 글꼴이 준비되면 한 번 흔들어 준다. */
if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(() => {
    window.dispatchEvent(new Event('resize'));
  });
}
