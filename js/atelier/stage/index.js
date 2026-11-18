// BOLAB — Ateliê / Cena: o que o motor 3D carrega quando o ateliê é ligado (js/customizer/engine.js → cake.atelier).
//
//   createStage(ctx) → { setEnabled, setScene, setBackdrop, play, skip, replay, pick, ghost, dripAt, candles,
//                        spread, reveal, capture, before, after, adopt, tick, afterDraw, shot, standChanged, dispose }
//
// Peças: sets.js (os cenários), anims.js (as animações de preparo), fx.js (ferramentas e partículas) e
// choose.js (lógica pura: qual animação cada mudança pede e a linha do tempo das marcas de som).
//
// O diretor (aqui) toca "clipes": cada um sabe se desenhar num instante e se pôr no estado final. Uma mudança
// nova do bolo encerra na hora o que estiver tocando (ninguém espera animação para escolher a próxima opção).
// As marcas de som saem pelo motor: ctx.emit('cue', { name, at, dur, count, part, kind }).
import * as THREE from 'three';
import { ANIMS, QUICK_BY, chooseAnimations, reducedCues, replayPlan, timeline, decorStyle } from './choose.js';
import { createSets, SCENES } from './sets.js';
import { createTools, createSmoke, createSparkles, createConfetti, softDotTexture, sparkTexture } from './fx.js';
import { createAnims, createMontage } from './anims.js';
import { canPlace, nearestFree } from '../../customizer/occupancy.js';
import { KIT } from '../../customizer/kit.js';
import { paintBackdrop } from '../../customizer/backdrop.js';

const TAU = Math.PI * 2;
/** As marcas de som saem um nada antes do quadro em que a batida aparece (o áudio agenda com precisão). */
const LOOKAHEAD = 0.05;
/** Quem interrompe quem: uma animação nova do mesmo grupo encerra a que estiver tocando. */
const GROUP = { intro: 'body', layer: 'body', filling: 'body', soak: 'body', cover: 'body', style: 'body', drip: 'body', cut: 'body', resize: 'body', tier: 'body', swap: 'body', piping: 'bico', decor: 'decor', remove: 'remove', 'candles.light': 'velas', 'candles.blow': 'velas', reveal: 'luz', celebrate: 'festa' };

export function createStage(ctx) {
  const low = ctx.tier.detail < 1;
  const tools = createTools(ctx.tier);
  const sets = createSets(ctx);
  const dotTex = softDotTexture(64);
  const sparkTex = sparkTexture(64);
  const smoke = createSmoke(ctx.scene, dotTex, low ? 14 : 28);
  const sparkles = createSparkles(ctx.scene, sparkTex, low ? 24 : 44);
  const montage = createMontage(ctx);
  let confetti = null;
  let sparkSprite = null;
  let snap = null;

  const S = {
    ctx,
    tools,
    sets,
    smoke,
    sparkles,
    montage,
    candleState: { lit: true },
    revealLevel: 0,
    get confetti() {
      return (confetti ||= createConfetti(ctx.scene, low ? 64 : 120));
    },
    /** A luzinha do fósforo que acende as velas. */
    spark() {
      if (!sparkSprite) {
        sparkSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTex, color: 0xffc070, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
        sparkSprite.visible = false;
        sparkSprite.renderOrder = 9;
        ctx.scene.add(sparkSprite);
      }
      return sparkSprite;
    },
    /** A cobertura de antes da mudança, por andar (cada clipe de cobertura retira a do andar que ele anima). */
    get snapshot() {
      return snap;
    },
    dropSnapshot(old) {
      old.geo.dispose();
      old.mats.forEach((mt) => mt.dispose());
    },
  };
  const anims = createAnims(S);

  let enabled = false;
  let directing = false;
  let disposed = false;
  let plan = [];
  let partsAt = 0; // quando a próxima peça nova (bico, decoração) pode começar a chegar
  const adopted = new Map();
  const later = []; // animações do corpo que esperam a anterior terminar: [{ a, prevM }]
  const clips = [];
  let busy = false;
  let busyTimer = 0;
  let manual = null; // girar o prato com o dedo (spread)
  let replaying = null;
  let recording = null;
  const _cam = {};

  /* ───────── marcas de som ───────── */
  const cue = (c, at = c.at) => ctx.emit('cue', { name: c.name, at: Math.max(0, at), dur: c.dur || 0, count: c.count || 1, part: c.part || '', kind: c.kind || 'hit' });
  function setBusy(on) {
    if (on === busy) return;
    busy = on;
    ctx.emit('busy', on);
  }
  const refreshBusy = () => setBusy(clips.length > 0 || Boolean(replaying));

  /* ───────── diretor ───────── */
  function begin(clip) {
    clip.started = true;
    clip.def.start?.();
    clip.def.update(0);
  }
  /** Põe um clipe para tocar. Devolve a promessa que resolve com true (terminou) ou false (foi interrompido). */
  function run(def, { delay = 0, name = '', key = '' } = {}) {
    if (!def || disposed) return Promise.resolve(false);
    return new Promise((resolve) => {
      const clip = { def, t: -delay, at: 0, started: false, resolve, name, group: GROUP[name] || name, key, open: new Set() };
      clips.push(clip);
      if (delay > 0) def.pending?.();
      else begin(clip);
      refreshBusy();
      ctx.invalidate();
    });
  }
  function end(clip, skipped = false) {
    const i = clips.indexOf(clip);
    if (i < 0) return;
    clips.splice(i, 1);
    try {
      if (!clip.started) clip.def.start?.();
      clip.def.finish(skipped);
    } catch (err) {
      console.error('[ateliê] ao encerrar a animação', clip.name, err);
    }
    // som em laço que ficou aberto: para agora
    clip.open.forEach((n) => cue({ name: n, kind: 'stop', part: clip.def.part || '' }, 0));
    clip.resolve(!skipped ? clip.def.result || true : false);
    if (!skipped && clip.def.chain) play(clip.def.chain);
    refreshBusy();
    ctx.invalidate();
  }
  function endGroup(group, key = '') {
    [...clips].forEach((c) => c.group === group && (!key || c.key === key) && end(c, true));
  }
  function skip() {
    if (replaying) replaying.abort();
    if (manual) manual = null;
    later.length = 0;
    [...clips].forEach((c) => end(c, true));
    tools.hide();
    adopted.forEach((part) => ctx.disposePart(part));
    adopted.clear();
    if (snap) {
      snap.forEach(S.dropSnapshot);
      snap = null;
    }
  }

  function make(name, opts = {}) {
    if (name === 'decor') {
      const id = opts.id || [...ctx.decorParts.keys()][0];
      return id ? anims.decor({ ...opts, id }) : null;
    }
    if (name === 'remove') {
      const ids = opts.ids || (opts.id ? [opts.id] : []);
      const parts = ids.map((id) => adopted.get(id)).filter(Boolean);
      ids.forEach((id) => adopted.delete(id));
      return anims.remove({ ...opts, parts });
    }
    return anims[name] ? anims[name](opts) : null;
  }

  /** Toca uma animação por nome (contrato §2). */
  function play(name, opts = {}) {
    if (disposed || !ctx.m || (!ANIMS.includes(name) && name !== 'swap')) return Promise.resolve(false);
    if (name === 'reveal' && opts.off) {
      endGroup('luz');
      return run(anims.revealOff(), { name: 'reveal' });
    }
    endGroup(GROUP[name] || name, name === 'decor' ? opts.id || '' : '');
    if (name === 'cut' && opts.off) {
      ctx.setCutaway(false);
      return Promise.resolve(true);
    }
    let def = null;
    try {
      def = make(name, opts);
    } catch (err) {
      console.error('[ateliê] animação', name, err);
    }
    if (!def) return Promise.resolve(false);
    if (ctx.reduceMotion && name !== 'reveal') {
      // sem animação: o estado final de uma vez, a batida principal do som e 150 ms de "ocupado"
      def.start?.();
      def.finish();
      reducedCues(name, { ...opts, part: def.cues?.[0]?.part }).forEach((c) => cue(c, 0));
      setBusy(true);
      clearTimeout(busyTimer);
      busyTimer = setTimeout(refreshBusy, 150);
      ctx.invalidate();
      return Promise.resolve(true);
    }
    return run(def, { name, key: name === 'decor' ? opts.id || '' : '' });
  }

  /* ───────── ligação com o setConfig do motor ───────── */
  function snapshotCovers() {
    if (snap) snap.forEach(S.dropSnapshot);
    snap = new Map();
    ctx.m.stack.forEach((t, ti) => {
      const mesh = ctx.named.get(`cobertura:${ti}`)?.objects[0];
      if (!mesh || t.naked || t.volcano) return;
      const f = ctx.mats.frostOf(ti);
      const mats = [f.side, f.top].map((mt) => {
        const copy = mt.clone();
        copy.clippingPlanes = mt.clippingPlanes;
        copy.transparent = false;
        copy.opacity = 1;
        copy.depthWrite = true;
        return copy;
      });
      const geo = mesh.geometry.clone();
      geo.setDrawRange(0, Infinity);
      snap.set(ti, { geo, mats, y0: t.y0, used: false });
    });
  }

  /** Antes de o motor refazer o bolo. Devolve true se a cena vai dirigir a mudança. */
  function before(prev, next, { by = 'user' } = {}) {
    if (!enabled || ctx.reduceMotion || QUICK_BY.has(by)) return false;
    if (JSON.stringify(prev) === JSON.stringify(next)) return true; // nada mudou: quem está tocando continua
    skip();
    plan = chooseAnimations(prev, next, { by });
    if (plan.some((a) => a.name === 'cover' || a.name === 'style')) snapshotCovers();
    return true;
  }

  /** O motor entrega uma decoração retirada: a cena fica com ela se for animar a saída. */
  function adopt(id, part) {
    if (!part || !plan.some((a) => a.name === 'remove' && (a.id === id || a.ids?.includes(id)))) return false;
    adopted.set(id, part);
    return true;
  }

  /** Depois de o motor refazer o bolo: toca o que a mudança pede. */
  function after(prev, next, info = {}) {
    if (info.standChanged || !prev) sets.layout();
    if (!info.told) {
      directing = false;
      return;
    }
    directing = Boolean(info.directed);
    if (!info.directed) {
      // transição curta (desfazer, inspiração, surpresa) ou sem movimento: o motor faz o de sempre; aqui, só o som
      const quick = chooseAnimations(prev, next, { by: QUICK_BY.has(info.by) ? info.by : 'auto' });
      if (quick.length && info.animate !== false) cue({ name: ctx.reduceMotion ? 'plop' : 'whoosh', kind: 'hit', part: 'bolo' }, 0);
      plan = [];
      return;
    }
    let delay = 0;
    const list = plan;
    plan = [];
    // retiradas primeiro e juntas (as peças somem enquanto o resto acontece); depois o corpo, em sequência
    list.filter((a) => a.name === 'remove').forEach((a) => run(make('remove', a), { name: 'remove' }));
    list
      .filter((a) => a.name !== 'remove')
      .slice(0, 3)
      .forEach((a, i) => {
        // a primeira começa já; as seguintes só são montadas quando a anterior termina (montar uma animação
        // já mexe no bolo: esconde a cobertura, põe as camadas à mostra…)
        if (i) later.push({ a, prevM: info.prevM });
        delay += timeline(a.name, a).dur + (a.name === 'layer' && a.mode === 'add' ? 0.36 : 0);
      });
    const first = list.find((a) => a.name !== 'remove');
    if (first) startBody(first, info.prevM);
    dropSpareSnapshot();
    partsAt = ctx.now + delay * 0.85;
  }
  function dropSpareSnapshot() {
    if (!snap || later.some((q) => q.a.name === 'cover' || q.a.name === 'style')) return;
    snap.forEach(S.dropSnapshot);
    snap = null;
  }
  /** Começa uma animação do corpo; quando ela termina (sem ter sido cortada), começa a próxima da fila. */
  function startBody(a, prevM) {
    let def = null;
    try {
      def = make(a.name, { ...a, prevM });
    } catch (err) {
      console.error('[ateliê] animação', a.name, err);
    }
    const next = () => {
      const q = later.shift();
      if (q) startBody(q.a, q.prevM);
      dropSpareSnapshot();
    };
    if (!def) next();
    else run(def, { name: a.name }).then((ok) => ok && next());
  }

  // peça nova (bico ou decoração) acabou de ser construída: a cena anima a chegada dela
  const offBuild = ctx.onBuild((entry) => {
    if (disposed) return;
    const isPipe = entry.kind === 'bico';
    if (!isPipe && entry.kind !== 'decor') return;
    const id = isPipe ? '' : entry.name.slice(6);
    const part = isPipe ? ctx.pipingPart : ctx.decorParts.get(id);
    if (!part) return;
    // as velas nascem no estado em que estavam (acesas ou sopradas)
    if (id === 'velas') part.flames.forEach((f) => (f.lv = S.candleState.lit ? 1 : 0));
    if (!part.fresh || !enabled || !directing || ctx.reduceMotion || replaying) return;
    part.fresh = false;
    let def = null;
    try {
      def = isPipe ? anims.piping({ partObject: part }) : anims.decor({ id, partObject: part });
    } catch (err) {
      console.error('[ateliê] chegada de', entry.name, err);
    }
    if (!def) return;
    if (id === 'velas') S.candleState.lit = true;
    const delay = Math.max(0, partsAt - ctx.now);
    run(def, { delay, name: isPipe ? 'piping' : 'decor', key: id });
    partsAt = Math.max(partsAt, ctx.now) + def.dur * 0.6;
  });

  /* ───────── girar o prato com o dedo (spread) ───────── */
  const spread = {
    begin(part) {
      if (!ctx.m || !enabled) return { progress: 1, done: Promise.resolve(false) };
      endGroup('body');
      const tier = Number(String(part || '').split(':')[1]);
      const state = { progress: 0, tail: 0, idle: 0, auto: false, side: false, fed: false };
      let def = null;
      try {
        def = anims.cover({ mode: 'full', manual: state, tier: Number.isFinite(tier) ? tier : undefined });
      } catch (err) {
        console.error('[ateliê] spread', err);
      }
      if (!def) return { progress: 1, done: Promise.resolve(false) };
      // do som, fica só o que tem hora certa (a colherada e o espalhar do topo); o da lateral segue o dedo
      state.sideAt = def.side;
      def.cues = def.cues.filter((c) => c.at < def.side && c.name !== 'smooth' && c.name !== 'swipe');
      manual = state;
      const done = run(def, { name: 'cover' }).then((ok) => {
        if (manual === state) manual = null;
        return Boolean(ok);
      });
      state.clip = clips[clips.length - 1];
      return {
        get progress() {
          return state.progress;
        },
        done,
      };
    },
    feed(deltaAngle) {
      if (!manual || !Number.isFinite(deltaAngle)) return;
      manual.idle = 0;
      manual.auto = false;
      manual.fed = true;
      manual.pending = (manual.pending || 0) + Math.abs(deltaAngle) / TAU;
      ctx.invalidate();
    },
    cancel() {
      if (manual?.clip) end(manual.clip, true);
      manual = null;
    },
  };
  function tickManual(dt) {
    const st = manual;
    if (!st?.clip) return;
    if (st.clip.t < st.sideAt) {
      st.pending = 0; // o topo ainda está sendo espalhado
      return;
    }
    if (!st.side) {
      st.side = true;
      st.clip.open.add('smooth');
      cue({ name: 'smooth', kind: 'start', part: 'cobertura' }, 0);
    }
    st.idle += dt;
    if (st.idle > 1.5) st.auto = true; // ninguém girou: a cobertura termina sozinha
    if (st.auto) st.progress += dt / 1.15;
    if (st.pending) {
      st.progress += st.pending;
      st.pending = 0;
    }
    if (st.progress >= 1) {
      st.progress = 1;
      if (!st.tail) {
        st.clip.open.delete('smooth');
        cue({ name: 'smooth', kind: 'stop', part: 'cobertura' }, 0);
        cue({ name: 'swipe', kind: 'hit', part: 'cobertura' }, 0);
      }
      st.tail = Math.min(1, st.tail + dt / 0.22);
      if (st.tail >= 1) {
        const clip = st.clip;
        manual = null;
        end(clip, false);
      }
    }
  }

  /* ───────── tocar no bolo ───────── */
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const hitLocal = new THREE.Vector3();
  function pick(clientX, clientY) {
    if (!ctx.m) return null;
    const rect = ctx.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -(((clientY - rect.top) / rect.height) * 2 - 1));
    ctx.camera.updateMatrixWorld();
    raycaster.setFromCamera(ndc, ctx.camera);
    const hits = raycaster.intersectObject(ctx.groups.bodyGroup, true);
    const hit = hits.find((h) => h.object.visible);
    if (!hit) return null;
    ctx.groups.cakeGroup.worldToLocal(hitLocal.copy(hit.point));
    const stack = ctx.m.stack;
    let tier = hit.object.userData.part?.tier;
    if (tier == null) tier = Math.max(0, stack.findIndex((t) => hitLocal.y <= t.y0 + t.Ht + 0.02));
    const t = stack[Math.min(tier, stack.length - 1)];
    const top = t.y0 + t.Ht;
    const upward = hit.face ? hit.face.normal.y > 0.72 : false;
    const face = upward || hitLocal.y >= top - t.rf * 0.45 ? 'topo' : 'lateral';
    return { face, x: +hitLocal.x.toFixed(4), z: +hitLocal.z.toFixed(4), y: +hitLocal.y.toFixed(4), tier };
  }

  let marker = null;
  let ghostKey = '';
  let ghostCfg = null;
  let ghostResult = { ok: false, why: '' };
  function pieceRadius(id, scale = 1) {
    return (KIT[id]?.vars?.[0]?.r || 0.13) * scale;
  }
  /** Prévia da peça sob o dedo: um anel no lugar onde ela ficaria, verde se cabe e vermelho se não. */
  function ghost(piece, hit) {
    if (!piece || !ctx.m) {
      if (marker) marker.visible = false;
      ghostKey = '';
      ctx.invalidate();
      return { ok: false, why: '' };
    }
    const p = { rot: 0, scale: 1, ...piece };
    if (hit) Object.assign(p, { x: hit.x, z: hit.z, face: hit.face }, hit.face === 'lateral' ? { y: hit.y } : {});
    p.face ||= 'topo';
    const key = `${p.id}|${p.face}|${(+p.x).toFixed(2)}|${(+p.z).toFixed(2)}|${p.y != null ? (+p.y).toFixed(2) : ''}|${p.scale}`;
    if (key !== ghostKey || ghostCfg !== ctx.config) {
      ghostKey = key;
      ghostCfg = ctx.config; // (o motor guarda uma cópia nova a cada mudança do bolo: a resposta antiga deixa de valer)
      let res = { ok: false, why: 'desconhecida' };
      let near = null;
      try {
        res = canPlace(ctx.config, p);
        if (!res.ok && res.why === 'ocupado') near = nearestFree(ctx.config, p, { reach: 0.6 });
      } catch (err) {
        res = { ok: false, why: 'desconhecida' };
      }
      ghostResult = { ok: Boolean(res.ok), why: res.why || '', near };
    }
    if (!marker) {
      marker = new THREE.Group();
      const ringMesh = new THREE.Mesh(new THREE.RingGeometry(0.86, 1, 40), new THREE.MeshBasicMaterial({ color: 0x2fbf71, transparent: true, opacity: 0.95, depthTest: false, toneMapped: false, side: THREE.DoubleSide }));
      const fillMesh = new THREE.Mesh(new THREE.CircleGeometry(0.86, 32), new THREE.MeshBasicMaterial({ color: 0x2fbf71, transparent: true, opacity: 0.26, depthTest: false, toneMapped: false, side: THREE.DoubleSide }));
      ringMesh.renderOrder = fillMesh.renderOrder = 20;
      marker.add(fillMesh, ringMesh);
      ctx.groups.cakeGroup.add(marker);
    }
    const m = ctx.m;
    const color = ghostResult.ok ? 0x2fbf71 : 0xe5484d;
    marker.children.forEach((ch) => ch.material.color.set(color));
    const r = pieceRadius(p.id, p.scale);
    marker.scale.setScalar(r);
    if (p.face === 'lateral') {
      // na lateral: de pé, de costas para o eixo
      const t = m.stack[Math.min(hit?.tier ?? 0, m.stack.length - 1)];
      const dx = p.x - t.center.x;
      const dz = p.z - t.center.z;
      const l = Math.hypot(dx, dz) || 1;
      const y = p.y ?? t.y0 + (t.Ht - t.rf) * 0.5;
      const reach = hit ? l : t.bounds.maxR;
      marker.position.set(t.center.x + (dx / l) * (reach + 0.006), y, t.center.z + (dz / l) * (reach + 0.006));
      marker.rotation.set(0, Math.atan2(dx, dz), 0);
    } else {
      marker.position.set(p.x, (ctx.layout?.topY ?? m.Htot) + 0.006, p.z);
      marker.rotation.set(-Math.PI / 2, 0, 0);
    }
    marker.visible = true;
    ctx.invalidate();
    return ghostResult;
  }

  function dripAt(hit) {
    if (!enabled || !ctx.config?.drip.on || !hit) return false;
    const def = anims.dripOne(hit);
    if (!def) return false;
    if (ctx.reduceMotion) {
      def.cues.forEach((c) => cue(c, 0));
      return true;
    }
    endGroup('gota');
    run(def, { name: 'gota' });
    return true;
  }

  /* ───────── replay: o bolo é refeito do prato vazio até a decoração ───────── */
  function replay({ seconds = 10 } = {}) {
    if (!ctx.m || disposed) return Promise.resolve(false);
    skip();
    if (ctx.reduceMotion) {
      cue({ name: 'tada', kind: 'hit' }, 0);
      return Promise.resolve(true);
    }
    const wasOpen = ctx.wedge.span > 0.002 ? ctx.wedge.span : 0;
    if (wasOpen) ctx.openWedge(0);
    const steps = ctx.assembly();
    const counts = {};
    if (ctx.pipingPart) counts.bico = ctx.pipingPart.batches.reduce((n, b) => n + b.items.length, 0);
    ctx.decorParts.forEach((part, id) => (counts[`decor:${id}`] = Math.max(1, Math.round(part.batches.reduce((n, b) => n + b.items.length, 0) / 2) + part.objects.length)));
    const rp = replayPlan(steps, { seconds, counts });
    montage.ensure();
    // tudo sai de cena; cada parte volta quando chega a vez dela
    const G = ctx.groups;
    const hidden = [];
    const hide = (o) => {
      if (!o) return;
      hidden.push([o, o.visible]);
      o.visible = false;
    };
    ctx.named.forEach((entry) => entry.kind !== 'base' && entry.kind !== 'corte' && entry.objects.forEach(hide));
    hide(G.cutGroup);
    if (ctx.pipingPart) hide(ctx.pipingPart.group);
    ctx.decorParts.forEach((part) => hide(part.group));
    montage.show(false);
    ctx.shadows.plateShade.visible = false; // a sombra do bolo no prato só volta quando a cobertura chega
    const show = (name) => ctx.named.get(name)?.objects.forEach((o) => (o.visible = true));
    let aborted = false;
    let t = 0;
    let next = 0;
    let finish;
    const done = new Promise((resolve) => (finish = resolve));
    const restore = () => {
      hidden.forEach(([o, was]) => (o.visible = was));
      ctx.shadows.plateShade.visible = true;
      if (wasOpen) ctx.openWedge(wasOpen);
      montage.show(false);
      replaying = null;
      refreshBusy();
      ctx.invalidate();
    };
    const fire = (step) => {
      const p = step.params;
      const speed = rp.speed;
      if (step.name === 'intro') return run(anims.intro({ only: 'base', speed }), { name: 'replay' });
      if (step.name === 'layer' || step.name === 'filling') {
        // a peça de verdade (naked) ou a da montagem (coberto)
        ctx.named.get(p.id)?.objects.forEach((o) => (o.visible = true));
        const piece = montage.get(p.id);
        if (piece) piece.mesh.visible = true;
        return run(anims.stackPiece({ id: p.id, dur: step.dur }), { name: 'replay' });
      }
      if (step.name === 'cover') {
        ctx.shadows.plateShade.visible = true;
        ctx.m.stack.forEach((_, ti) => [`cobertura:${ti}`, `cobertura:${ti}:rosetas`, `cobertura:${ti}:veu`].forEach(show));
        return run(anims.cover({ mode: 'full', speed }), { name: 'replay' });
      }
      if (step.name === 'drip') {
        ctx.m.stack.forEach((_, ti) => show(`calda:${ti}`));
        return run(anims.drip({ speed }), { name: 'replay' });
      }
      if (step.name === 'piping' && ctx.pipingPart) {
        ctx.pipingPart.group.visible = true;
        return run(anims.piping({ speed }), { name: 'replay' });
      }
      if (step.name === 'decor') {
        const part = ctx.decorParts.get(p.id);
        if (!part) return null;
        part.group.visible = true;
        return run(anims.decor({ id: p.id, speed, style: p.style }), { name: 'replay', key: p.id });
      }
      return null;
    };
    replaying = {
      abort() {
        aborted = true;
        restore();
        finish(false);
      },
      tick(dt) {
        if (aborted) return;
        t += dt;
        while (next < rp.steps.length && rp.steps[next].at <= t) {
          try {
            fire(rp.steps[next]);
          } catch (err) {
            console.error('[ateliê] replay', rp.steps[next].name, err);
          }
          next++;
        }
        if (next >= rp.steps.length && t >= rp.total && !clips.some((c) => c.name === 'replay')) {
          restore();
          cue({ name: 'tada', kind: 'hit' }, 0);
          finish(true);
        }
      },
    };
    refreshBusy();
    ctx.invalidate();
    return done;
  }

  /* ───────── gravação do canvas ───────── */
  const captureSupported = () => typeof MediaRecorder !== 'undefined' && typeof ctx.canvas.captureStream === 'function';
  async function video({ seconds = 10, fps = 30, width = 720, replay: withReplay = false } = {}) {
    if (!captureSupported() || recording || disposed) return null;
    let rec = null;
    try {
      const src = ctx.canvas;
      const w = Math.max(160, Math.min(1280, Math.round(width / 2) * 2));
      const h = Math.max(2, Math.round((w * src.height) / Math.max(1, src.width) / 2) * 2);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const g = canvas.getContext('2d');
      const type = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'].find((t) => MediaRecorder.isTypeSupported(t));
      if (!type) return null;
      const stream = canvas.captureStream(Math.max(5, Math.min(60, fps)));
      const mr = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: Math.round(w * h * 5) });
      const chunks = [];
      mr.ondataavailable = (ev) => ev.data && ev.data.size && chunks.push(ev.data);
      const stopped = new Promise((resolve, reject) => {
        mr.onstop = resolve;
        mr.onerror = (ev) => reject(ev.error || new Error('gravação'));
      });
      rec = { g, w, h, mr };
      recording = rec;
      mr.start(200);
      ctx.invalidate();
      const run1 = withReplay ? replay({ seconds: Math.max(4, seconds - 1) }) : null;
      await new Promise((resolve) => setTimeout(resolve, Math.max(0.5, Math.min(60, seconds)) * 1000));
      if (run1) await Promise.race([run1, new Promise((resolve) => setTimeout(resolve, 1500))]);
      recording = null;
      if (mr.state !== 'inactive') mr.stop();
      await stopped;
      stream.getTracks().forEach((tr) => tr.stop());
      return chunks.length ? new Blob(chunks, { type: type.split(';')[0] }) : null;
    } catch (err) {
      if (recording === rec) recording = null;
      try {
        if (rec?.mr.state !== 'inactive') rec.mr.stop();
      } catch {
        // já parado
      }
      return null;
    }
  }
  function afterDraw() {
    if (!recording) return;
    const { g, w, h } = recording;
    // sem a cozinha o canvas é transparente: o vídeo leva o fundo do palco por baixo
    if (!sets.visible && ctx.backdrop) paintBackdrop(g, w, h, ctx.backdrop);
    g.drawImage(ctx.canvas, 0, 0, w, h);
  }

  /* ───────── laço ───────── */
  function tick(dt) {
    if (disposed) return false;
    let active = false;
    if (sets.tick(dt, ctx.getSpherical(_cam).az)) active = true;
    if (replaying) {
      replaying.tick(dt);
      active = true;
    }
    if (manual) {
      tickManual(dt);
      active = true;
    }
    if (later.length) active = true;
    if (clips.length) {
      active = true;
      [...clips].forEach((clip) => {
        clip.t += dt;
        if (clip.t < 0) {
          clip.def.pending?.();
          return;
        }
        if (!clip.started) begin(clip);
        const list = clip.def.cues || [];
        while (clip.at < list.length && list[clip.at].at <= clip.t + LOOKAHEAD) {
          const c = list[clip.at++];
          if (c.kind === 'start') clip.open.add(c.name);
          else if (c.kind === 'stop') clip.open.delete(c.name);
          cue(c, c.at - clip.t);
        }
        if (clip.t >= clip.def.dur) end(clip, false);
        else {
          try {
            clip.def.update(clip.t);
          } catch (err) {
            console.error('[ateliê] animação', clip.name, err);
            end(clip, true);
          }
        }
      });
    }
    if (smoke.tick(dt)) active = true;
    if (sparkles.tick(dt)) active = true;
    if (confetti && confetti.tick(dt)) active = true;
    if (recording) active = true;
    return active;
  }

  return {
    names: ANIMS,
    scenes: SCENES,
    get enabled() {
      return enabled;
    },
    get busy() {
      return busy;
    },
    get sets() {
      return sets;
    },
    setEnabled(on) {
      on = Boolean(on);
      if (on === enabled) return;
      enabled = on;
      if (!on) {
        skip();
        const off = anims.revealOff();
        off?.finish();
        montage.xray(0);
        directing = false;
        ghost(null);
      }
      sets.setVisible(on);
      ctx.invalidate();
    },
    setScene(id) {
      sets.setScene(id);
      ctx.invalidate();
    },
    setBackdrop(b, opts) {
      sets.setBackdrop(b, opts);
    },
    standChanged() {
      sets.layout();
    },
    play,
    skip,
    replay,
    pick,
    ghost,
    dripAt,
    candles: {
      get lit() {
        return S.candleState.lit;
      },
      get count() {
        return ctx.decorParts.get('velas')?.flames.length || 0;
      },
      light: () => play('candles.light'),
      blow: (strength = 1) => play('candles.blow', { strength }),
    },
    spread,
    reveal: (opts) => play('reveal', opts || {}),
    capture: {
      get supported() {
        return captureSupported();
      },
      video,
    },
    before,
    after,
    adopt,
    tick,
    afterDraw,
    /** Foto de catálogo: esconde a cozinha (true) e traz de volta (false). Devolve se havia o que esconder. */
    shot(hideIt) {
      if (hideIt) {
        if (!sets.visible) return false;
        sets.setVisible(false, { quiet: true });
        return true;
      }
      sets.setVisible(enabled, { quiet: true });
      return true;
    },
    /** Só para a bancada de testes e medições. */
    debug: { clips, timeline, decorStyle, montage, tools, anims },
    dispose() {
      if (disposed) return;
      skip();
      disposed = true;
      offBuild();
      clearTimeout(busyTimer);
      anims.revealOff()?.finish();
      anims.dispose();
      montage.dispose();
      sets.dispose();
      tools.dispose();
      smoke.dispose();
      sparkles.dispose();
      confetti?.dispose();
      if (sparkSprite) {
        ctx.scene.remove(sparkSprite);
        sparkSprite.material.dispose();
      }
      if (marker) {
        ctx.groups.cakeGroup.remove(marker);
        marker.children.forEach((ch) => {
          ch.geometry.dispose();
          ch.material.dispose();
        });
      }
      dotTex.dispose();
      sparkTex.dispose();
    },
  };
}
