import './style.css'
import { calculate, getMaterial, MATERIALS, METAL_PROFILES } from './calculator.js'
import { packParts, getPackStats } from './packing.js'
import { drawAssembly, drawProjections, drawPartSketch, drawCuttingSheet, drawPartFlat, drawMiniPos } from './draw.js'
import { buildLayout, fastenerTotals, jointsForPart, FAST_TYPES } from './joinery.js'

const $ = s=> document.querySelector(s)
const $$ = s=> [...document.querySelectorAll(s)]

let state = {
  type: 'shkaf',
  H: 2000,
  W: 800,
  D: 520,
  t: 16,
  materialKey: 'ldsp16',
  sheetW: 2800,
  sheetH: 2070,
  rear: true,
  base: false,
  construction: 'inset',
  shelfMount: 'inner',
  shelves: 3,
  doors: 2,
  drawers: 0,
  partitions: 0,
  gapFacade: 3,
  shelfInset: 20,
  edge: 1,
  tableSupport: 'panels',
  polkaType: 'simple',
  viewMode: 'iso',
  exploded: false,
  rotate: 0,
  // металлическая рама
  metalProfile: '40x20',
  metalWall: 0,
  metalLevels: 3,
  metalDividers: 0,
  metalShelves: true,
  metalRear: false,
  showFasteners: false
}

let lastResult = null
let lastPack = null
let lastLayout = null
let selectedKey = null // выбранная деталь (ключ из layout)

function init(){
  loadState()
  bindUI()
  syncUIFromState()
  recalc()
  setupTabs()
}

function bindUI(){
  // type cards
  $$('.type-card').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      $$('.type-card').forEach(b=>b.classList.remove('active'))
      btn.classList.add('active')
      state.type = btn.dataset.type
      updateExtraOptions()
      applyTypeVisibility()
      syncDependentDefaults()
      saveState()
      recalc()
    })
  })

  // inputs
  const linkNumRange = (inpId, rngId, key) =>{
    const inp=$(`#${inpId}`), rng=$(`#${rngId}`)
    if(!inp||!rng) return
    inp.addEventListener('input', e=>{
      state[key]=Number(e.target.value)
      rng.value=e.target.value
      onDimChange()
    })
    rng.addEventListener('input', e=>{
      state[key]=Number(e.target.value)
      inp.value=e.target.value
      onDimChange()
    })
  }
  linkNumRange('inpH','rngH','H')
  linkNumRange('inpW','rngW','W')
  linkNumRange('inpD','rngD','D')

  $('#inpT').addEventListener('input', e=>{ state.t=Number(e.target.value); saveState(); recalc() })
  $('#selMaterial').addEventListener('change', e=>{
    state.materialKey=e.target.value
    const m=getMaterial(state.materialKey, state.t)
    state.t=m.t
    $('#inpT').value=m.t
    state.sheetW=m.sheet[0]
    state.sheetH=m.sheet[1]
    $('#inpSheetW').value=m.sheet[0]
    $('#inpSheetH').value=m.sheet[1]
    saveState(); recalc()
  })
  $$('#materialPresets button').forEach(b=>{
    b.addEventListener('click', ()=>{
      const mat=b.dataset.mat, sheet=b.dataset.sheet, t=b.dataset.t
      state.materialKey=mat
      state.t=Number(t)
      const [w,h]=sheet.split('x').map(Number)
      state.sheetW=w; state.sheetH=h
      $('#selMaterial').value=mat
      $('#inpT').value=t
      $('#inpSheetW').value=w
      $('#inpSheetH').value=h
      saveState(); recalc()
    })
  })
  $('#inpSheetW').addEventListener('input', e=>{ state.sheetW=Number(e.target.value); saveState(); recalc() })
  $('#inpSheetH').addEventListener('input', e=>{ state.sheetH=Number(e.target.value); saveState(); recalc() })
  $('#selEdge').addEventListener('change', e=>{ state.edge=Number(e.target.value); saveState(); recalc() })
  $('#chkRear').addEventListener('change', e=>{ state.rear=e.target.checked; saveState(); recalc() })
  $('#chkBase').addEventListener('change', e=>{ state.base=e.target.checked; saveState(); recalc() })
  $('#selConstr').addEventListener('change', e=>{ state.construction=e.target.value; saveState(); recalc() })
  $('#selShelfMount').addEventListener('change', e=>{ state.shelfMount=e.target.value; saveState(); recalc() })
  $('#inpGapFacade').addEventListener('input', e=>{ state.gapFacade=Number(e.target.value); saveState(); recalc() })
  $('#inpShelfInset').addEventListener('input', e=>{ state.shelfInset=Number(e.target.value); saveState(); recalc() })

  // steppers
  $$('.stepper-ctrl button').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const action=btn.dataset.action
      const target=btn.dataset.target
      const map={shelves:'inpShelves', doors:'inpDoors', drawers:'inpDrawers', partitions:'inpPartitions'}
      const inpId=map[target]
      if(!inpId) return // не наш стейпер (например, металлической рамы)
      const inp=$('#'+inpId)
      let v=Number(inp.value)
      if(action==='inc') v=Math.min(v+1, Number(inp.max)||12)
      else v=Math.max(v-1, Number(inp.min)||0)
      inp.value=v
      state[target]=v
      saveState(); recalc()
    })
  })

  // extra dynamic options (tableSupport, polkaType)
  document.addEventListener('change', e=>{
    if(e.target.id==='selTableSupport'){ state.tableSupport=e.target.value; saveState(); recalc() }
    if(e.target.id==='selPolkaType'){ state.polkaType=e.target.value; saveState(); recalc() }
  })

  $('#btnCalc').addEventListener('click', recalc)
  $('#btnRotate').addEventListener('click', ()=>{
    state.rotate = (state.rotate+1)%4
    renderAssembly()
  })
  $('#btnExplode').addEventListener('click', ()=>{
    state.exploded=!state.exploded
    $('#btnExplode').textContent = state.exploded ? '✧ Собрать' : '✧ В разнос'
    $('#btnExplode').style.background = state.exploded ? '#f2c14e' : ''
    renderAssembly()
  })
  $('#selView').addEventListener('change', e=>{
    state.viewMode=e.target.value
    renderAssembly()
  })

  // export
  $('#btnExportCSV').addEventListener('click', exportCSV)
  $('#btnExportPDF').addEventListener('click', doPrint)
  $('#btnCopyList').addEventListener('click', copyList)
  $('#btnPrint').addEventListener('click', doPrint)
  $('#btnSave').addEventListener('click', ()=>{
    localStorage.setItem('construction_project', JSON.stringify({state, result:lastResult}))
    toast('Проект сохранён в браузере')
  })

  // металлическая рама
  const onMetal = ()=>{ saveState(); recalc() }
  $('#selMetalProfile').addEventListener('change', e=>{
    state.metalProfile=e.target.value
    const pr = METAL_PROFILES[e.target.value]
    if(pr && !state.metalWall) state.metalWall = pr.wall
    $('#selMetalWall').value = String(pr.wall)
    onMetal()
  })
  $('#selMetalWall').addEventListener('change', e=>{ state.metalWall=Number(e.target.value); onMetal() })
  $('#inpMetalLevels').addEventListener('input', e=>{
    state.metalLevels = Math.max(2, Math.min(6, Number(e.target.value)||2))
    e.target.value = state.metalLevels
    onMetal()
  })
  $('#inpMetalDividers').addEventListener('input', e=>{
    state.metalDividers = Math.max(0, Math.min(4, Number(e.target.value)||0))
    e.target.value = state.metalDividers
    onMetal()
  })
  $('#chkMetalShelves').addEventListener('change', e=>{ state.metalShelves=e.target.checked; onMetal() })
  $('#chkMetalRear').addEventListener('change', e=>{ state.metalRear=e.target.checked; onMetal() })
  $$('#metalSection .stepper-ctrl button').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const isLevels = btn.dataset.target==='levels'
      const inp = $('#'+(isLevels ? 'inpMetalLevels' : 'inpMetalDividers'))
      let v = Number(inp.value)
      const min = isLevels ? 2 : 0
      const max = isLevels ? 6 : 4
      v = btn.dataset.action==='inc' ? Math.min(v+1, max) : Math.max(v-1, min)
      inp.value = v
      if(isLevels) state.metalLevels = v
      else state.metalDividers = v
      onMetal()
    })
  })

  // крепёж: переключатель отверстий в сборке
  $('#btnFasteners').addEventListener('click', ()=>{
    state.showFasteners = !state.showFasteners
    syncFastenerBtn()
    renderAssembly()
  })

  // клик по детали в сборке
  $('#assemblyCanvas').addEventListener('click', e=>{
    const el = e.target.closest('[data-key]')
    if(!el) return
    const key = el.dataset.key
    resolveKey(key).then(item=>{
      if(!item) return
      if(selectedKey === item.key){
        openPartCard(item.key)
      }else{
        selectPart(item.key)
      }
    })
  })

  // модалка детали
  $('#pmClose').addEventListener('click', closePartCard)
  $('#pmLocate').addEventListener('click', ()=>{
    closePartCard()
    selectPart(selectedKey, {gotoAssembly:true})
  })
  $('#partModal').addEventListener('click', e=>{ if(e.target.id==='partModal') closePartCard() })
  document.addEventListener('keydown', e=>{ if(e.key==='Escape') closePartCard() })

  // mobile nav
  $$('.mnav-btn').forEach(b=>{
    b.addEventListener('click', ()=>{
      const tab=b.dataset.tab
      switchTab(tab)
    })
  })

  // mobile: переключатель «Параметры / Результат» (виден при ширине ≤980px)
  const viewSwitch = $('#viewSwitch')
  if(viewSwitch){
    viewSwitch.addEventListener('click', e=>{
      const b = e.target.closest('button[data-view]')
      if(!b) return
      document.body.classList.toggle('view-params', b.dataset.view==='params')
      viewSwitch.querySelectorAll('button').forEach(x=> x.classList.toggle('active', x===b))
    })
  }
}

function syncFastenerBtn(){
  const b = $('#btnFasteners')
  if(!b) return
  b.style.background = state.showFasteners ? '#f2c14e' : ''
  b.style.borderColor = state.showFasteners ? '#a16207' : ''
}

/** ключ может быть «shelf-2» (ряд на эскизе) → ищем деталь с этим префиксом */
async function resolveKey(key){
  if(!lastLayout) return null
  let item = lastLayout.items.find(i=> i.key === key)
  if(!item) item = lastLayout.items.find(i=> i.key.startsWith(key + '-'))
  return item
}

/** Выбрать деталь: подсветка в сборке + info-строка */
async function selectPart(key, opts={}){
  const item = lastLayout ? (lastLayout.items.find(i=> i.key===key) || lastLayout.items.find(i=> i.key.startsWith(key+'-'))) : null
  if(!item) return
  selectedKey = item.key
  // подсветка в списке деталей
  $$('#partsTable tbody tr[data-key]').forEach(tr=> tr.classList.toggle('row-selected', tr.dataset.key === selectedKey))
  $$('#partsSketches .part-sketch[data-key]').forEach(c=> c.classList.toggle('sketch-selected', c.dataset.key === selectedKey))
  renderAssembly()
  renderAssemblyInfo(item)
  if(opts.gotoAssembly) switchTab('assembly')
}

function deselectPart(){
  selectedKey = null
  $$('#partsTable tbody tr[data-key]').forEach(tr=> tr.classList.remove('row-selected'))
  $$('#partsSketches .part-sketch[data-key]').forEach(c=> c.classList.remove('sketch-selected'))
  renderAssembly()
  const info = $('#assemblyInfo')
  if(info) info.innerHTML=''
}

function renderAssemblyInfo(item){
  const info = $('#assemblyInfo')
  if(!info) return
  const holes = item.holes.length
  info.innerHTML = `<div class="asm-info-item">
    <span class="asm-info-dot"></span>
    <span class="asm-info-name">${item.name}</span>
    <span class="asm-info-dims">${item.metal ? `${Math.round(item.plateW)} мм • ${item.section||''}` : `${item.plateW}×${item.plateH}×${item.thick} мм`}</span>
    <span class="asm-info-holes">${item.note ? '• ' : ''}${holes? holes+' отв.' : 'без отверстий'}${item.note? ' • '+item.note : ''}</span>
    <button class="btn btn-small asm-info-open">📋 Карточка</button>
    <button class="btn btn-small asm-info-x" title="Сбросить">✕</button>
  </div>`
  info.querySelector('.asm-info-open').addEventListener('click', ()=> openPartCard(item.key))
  info.querySelector('.asm-info-x').addEventListener('click', deselectPart)
}

// ==================== Карточка детали (развёртка + крепёж + позиция) ====================
// ===== Полноэкранный просмотр эскиза: pinch-zoom / pan / double-tap / wheel =====
let ZOOM = null
function openZoomViewer(svgEl, title){
  let ov = document.getElementById('zoomOverlay')
  if(!ov){
    ov = document.createElement('div')
    ov.id = 'zoomOverlay'
    ov.className = 'zoom-overlay'
    ov.innerHTML = `
      <div class="zoom-top">
        <span class="zoom-title"></span>
        <span class="zoom-btns">
          <button type="button" class="zoom-btn" data-z="out" title="Меньше">−</button>
          <button type="button" class="zoom-btn" data-z="in" title="Больше">＋</button>
          <button type="button" class="zoom-btn" data-z="reset" title="Сбросить масштаб">⤢</button>
          <button type="button" class="zoom-btn zoom-close" data-z="close" title="Закрыть">✕</button>
        </span>
      </div>
      <div class="zoom-stage"><div class="zoom-box"></div></div>
      <div class="zoom-hint">щипок — масштаб · двойной тап — приблизить · перетаскивание — сдвиг</div>`
    document.body.appendChild(ov)

    const stage = ov.querySelector('.zoom-stage')
    const box = ov.querySelector('.zoom-box')
    const state = { S: 1, tx: 0, ty: 0 }
    ZOOM = { ov, stage, box, state }

    const apply = () => {
      box.style.transform = `translate(${state.tx}px, ${state.ty}px) scale(${state.S})`
      ov.querySelector('.zoom-hint').style.opacity = state.S > 1 ? 0 : 1
    }

    // зум, зафиксированный в точке p (client-координаты)
    const zoomAt = (p, newS) => {
      newS = Math.round(Math.min(6, Math.max(1, newS)) * 1000) / 1000
      if(newS === state.S) return
      const sr = stage.getBoundingClientRect()
      const br = box.getBoundingClientRect()
      const Cx = br.left + br.width/2 - sr.left
      const Cy = br.top + br.height/2 - sr.top
      const dx = p.x - sr.left - Cx
      const dy = p.y - sr.top - Cy
      const f = newS / state.S
      state.tx += (1 - f) * dx
      state.ty += (1 - f) * dy
      state.S = newS
      if(state.S === 1){ state.tx = 0; state.ty = 0 }
      apply()
    }

    ov.querySelectorAll('.zoom-btn').forEach(b=>{
      b.addEventListener('click', e=>{
        e.stopPropagation()
        const z = b.dataset.z
        if(z === 'close') closeZoomViewer()
        else if(z === 'in') zoomAt({x: innerWidth/2, y: innerHeight/2}, state.S * 1.4)
        else if(z === 'out') zoomAt({x: innerWidth/2, y: innerHeight/2}, state.S / 1.4)
        else { state.S = 1; state.tx = 0; state.ty = 0; apply() }
      })
    })

    // --- touch: pinch / pan / double-tap ---
    const touches = new Map()
    let pinch = null, pan = null, lastTap = {t:0, x:0, y:0}

    stage.addEventListener('touchstart', e=>{
      e.preventDefault()
      for(const t of e.changedTouches) touches.set(t.identifier, {x: t.clientX, y: t.clientY})
      if(touches.size === 1){
        const t = e.changedTouches[0]
        const now = Date.now()
        if(now - lastTap.t < 300 && Math.hypot(t.clientX - lastTap.x, t.clientY - lastTap.y) < 40){
          zoomAt({x: t.clientX, y: t.clientY}, state.S > 1.2 ? 1 : 2.5)
          lastTap.t = 0
        } else {
          lastTap = {t: now, x: t.clientX, y: t.clientY}
          if(state.S > 1) pan = {x: t.clientX, y: t.clientY, tx: state.tx, ty: state.ty}
        }
      } else if(touches.size === 2){
        pan = null
        const [a, b] = [...touches.values()]
        pinch = {d: Math.max(20, Math.hypot(a.x - b.x, a.y - b.y)), s: state.S}
      }
    }, {passive: false})

    stage.addEventListener('touchmove', e=>{
      e.preventDefault()
      for(const t of e.changedTouches) if(touches.has(t.identifier)) touches.set(t.identifier, {x: t.clientX, y: t.clientY})
      if(touches.size === 2 && pinch){
        const [a, b] = [...touches.values()]
        const d = Math.max(20, Math.hypot(a.x - b.x, a.y - b.y))
        zoomAt({x: (a.x + b.x)/2, y: (a.y + b.y)/2}, pinch.s * d / pinch.d)
      } else if(touches.size === 1 && pan){
        const t = [...touches.values()][0]
        state.tx = pan.tx + (t.x - pan.x)
        state.ty = pan.ty + (t.y - pan.y)
        apply()
      }
    }, {passive: false})

    const touchEnd = e=>{
      for(const t of e.changedTouches) touches.delete(t.identifier)
      if(touches.size < 2) pinch = null
      if(!touches.size) pan = null
    }
    stage.addEventListener('touchend', touchEnd)
    stage.addEventListener('touchcancel', touchEnd)

    // --- mouse: wheel / drag / dblclick (десктоп) ---
    stage.addEventListener('wheel', e=>{
      e.preventDefault()
      zoomAt({x: e.clientX, y: e.clientY}, state.S * (e.deltaY < 0 ? 1.12 : 1/1.12))
    }, {passive: false})
    let mdown = null
    stage.addEventListener('mousedown', e=>{
      if(state.S > 1){ mdown = {x: e.clientX, y: e.clientY, tx: state.tx, ty: state.ty}; e.preventDefault() }
    })
    window.addEventListener('mousemove', e=>{
      if(mdown){ state.tx = mdown.tx + (e.clientX - mdown.x); state.ty = mdown.ty + (e.clientY - mdown.y); apply() }
    })
    window.addEventListener('mouseup', ()=> mdown = null)
    stage.addEventListener('dblclick', e=> zoomAt({x: e.clientX, y: e.clientY}, state.S > 1.2 ? 1 : 2.5))
    stage.addEventListener('click', e=>{ if(e.target === stage && state.S === 1) closeZoomViewer() })
  }

  ZOOM.box.innerHTML = ''
  const svg = svgEl.cloneNode(true)
  svg.removeAttribute('width')
  svg.removeAttribute('height')
  ZOOM.box.appendChild(svg)
  ZOOM.ov.querySelector('.zoom-title').textContent = title
  ZOOM.state.S = 1; ZOOM.state.tx = 0; ZOOM.state.ty = 0
  ZOOM.box.style.transform = 'none'
  ZOOM.ov.classList.add('open')
}
function closeZoomViewer(){
  const ov = document.getElementById('zoomOverlay')
  if(ov) ov.classList.remove('open')
}
document.addEventListener('keydown', e=>{ if(e.key === 'Escape') closeZoomViewer() })
function makeZoomable(el, title){
  if(!el) return
  el.addEventListener('click', ()=>{
    const svg = el.querySelector('svg')
    if(svg) openZoomViewer(svg, title)
  })
}

function openPartCard(key){
  if(!lastLayout) return
  const item = lastLayout.items.find(i=> i.key===key) || lastLayout.items.find(i=> i.key.startsWith(key+'-'))
  if(!item) return
  selectedKey = item.key
  const modal = $('#partModal')
  const body = $('#partModalBody')
  const p = item.part

  // таблица отверстий
  const FACE_NAMES = { M:'осн. грань', top:'верхний торец', bottom:'нижний торец', left:'левый торец', right:'правый торец' }
  let holeRows = ''
  item.holes.forEach((h,i)=>{
    const ft = FAST_TYPES[h.t] || {}
    const posTxt = h.f==='M' ? `u ${h.u} / v ${h.v}` : `торец: ${h.u} / ${h.v} мм`
    holeRows += `<tr>
      <td class="mono">${i+1}</td>
      <td><span class="hole-chip" style="border-color:${ft.color||'#64748b'};color:${ft.color||'#64748b'}">${ft.icon||'•'} ${ft.label||h.t}</span></td>
      <td class="mono">${h.d} мм</td>
      <td class="mono">${h.depth} мм</td>
      <td style="font-size:11px">${FACE_NAMES[h.f]||h.f}</td>
      <td class="mono" style="font-size:11px">${posTxt}</td>
    </tr>`
  })

  // соединения с этой деталью
  const js = jointsForPart(item.name, lastLayout.joints)
  const jointRows = js.map(j=>{
    const other = j.a === item.name || j.a.startsWith(prefixOf(item.name)) ? (j.b) : j.a
    const fast = j.fasteners.filter(f=>f.qty>0).map(f=>`${f.name} ×${f.qty}`).join(', ')
    return `<div class="pm-joint">
      <div class="pm-joint-title">${j.label}</div>
      <div class="pm-joint-sub">Крепится к: <b>${other}</b></div>
      <div class="pm-joint-fast">${fast || '—'}</div>
      ${j.note? `<div class="pm-joint-note">📌 ${j.note}</div>` : ''}
    </div>`
  }).join('')

  body.innerHTML = `
    <div class="pm-head">
      <div>
        <div class="pm-title">${item.name} <span class="pm-count">×${p.count||1}</span></div>
        <div class="pm-sub">
          ${p.material} • ${item.metal ? `длина ${Math.round(item.plateW)} мм • сечение ${item.section||''}` : `${item.plateW} × ${item.plateH} × ${item.thick} мм`}
          ${p.edge && p.edge!=='-' ? ` • кромка: ${p.edge}` : ''}
        </div>
      </div>
      <button class="btn btn-ghost" id="pmCloseX" style="color:#fff;background:rgba(255,255,255,.12)">✕</button>
    </div>
    <div class="pm-grid">
      <div class="pm-block">
        <div class="pm-block-title">📍 Позиция в изделии</div>
        <div class="pm-pos zoomable" id="pmPos"></div>
      </div>
      <div class="pm-block">
        <div class="pm-block-title">✂️ Развёртка (раскрой) с разметкой отверстий</div>
        <div class="pm-flat zoomable" id="pmFlat"></div>
      </div>
      <div class="pm-block pm-block-wide">
        <div class="pm-block-title">🕳️ Разметка отверстий (${item.holes.length})</div>
        ${item.holes.length? `<div class="pm-table-wrap"><table class="pm-table"><thead><tr><th>№</th><th>Крепёж</th><th>Ø</th><th>Глуб.</th><th>Грань</th><th>Позиция</th></tr></thead><tbody>${holeRows}</tbody></table></div>` : '<div class="pm-empty">Отверстий нет — деталь крепится кромкой / пазом / гвоздями</div>'}
      </div>
      <div class="pm-block pm-block-wide">
        <div class="pm-block-title">🔩 Крепления (как соединяется с другими деталями)</div>
        ${jointRows || '<div class="pm-empty">Отдельная деталь без соединений</div>'}
      </div>
    </div>`
  $('#pmCloseX').addEventListener('click', closePartCard)

  drawMiniPos($('#pmPos'), item, lastLayout, lastResult.params)
  drawPartFlat($('#pmFlat'), item, lastResult.params)
  makeZoomable($('#pmPos'), 'Позиция в изделии')
  makeZoomable($('#pmFlat'), 'Развёртка (раскрой) с разметкой отверстий')

  modal.classList.add('open')
  modal.scrollTop = 0
}
function prefixOf(name){
  const P = ['Полка','Боковина','Дверь','Царга','Стойка','Рама','Перегородка','Дно ящика','Перед/зад ящика','Боковина ящика','Ножка','Столешница','Цоколь','Крыша','Дно','Ребро']
  return P.find(pf=> name.startsWith(pf)) || name
}
function closePartCard(){
  const modal = $('#partModal')
  if(modal) modal.classList.remove('open')
}

function onDimChange(){
  syncHint()
  saveState()
  recalc()
}
function syncHint(){
  const vol = (state.W*state.H*state.D/1e9).toFixed(2)
  $('#dimHint').textContent=`Корпус: ${state.W}×${state.H}×${state.D} мм • Объём ${vol} м³ • Площадь полок ${(state.W*state.D/1e6).toFixed(2)} м²`
}
function syncDependentDefaults(){
  // adjust defaults per type for better UX
  if(state.type==='stol'){
    if(state.H>900) { state.H=750; $('#inpH').value=750; $('#rngH').value=750 }
    if(state.W<800) { state.W=1200; $('#inpW').value=1200; $('#rngW').value=1200 }
  }
  if(state.type==='polka'){
    if(state.H>600) { state.H=300; $('#inpH').value=300; $('#rngH').value=300 }
  }
  if(state.type==='tumba'){
    if(state.H>900) { state.H=600; $('#inpH').value=600; $('#rngH').value=600 }
  }
  if(state.type==='shkaf'){
    if(state.H<1500) { state.H=2000; $('#inpH').value=2000; $('#rngH').value=2000 }
  }
  if(state.type==='metal'){
    if(state.H<1200) { state.H=2000; $('#inpH').value=2000; $('#rngH').value=2000 }
  }
  syncHint()
}

function applyTypeVisibility(){
  const isMetal = state.type === 'metal'
  const ms = $('#metalSection')
  if(ms) ms.style.display = isMetal ? '' : 'none'
  const cs = $('#constrSection')
  if(cs) cs.style.display = isMetal ? 'none' : ''
  ;['chkRearRow','chkBaseRow'].forEach(id=>{
    const el = document.getElementById(id)
    if(el) el.style.display = isMetal ? 'none' : ''
  })
  const matLabel = document.querySelector('#materialSection .section-label')
  if(matLabel) matLabel.textContent = isMetal ? 'МАТЕРИАЛ ПОЛОК / ЗАДНЕЙ' : 'МАТЕРИАЛ КОРПУСА'
}

function updateExtraOptions(){
  const c=$('#extraOptions')
  c.innerHTML=''
  if(state.type==='stol'){
    c.innerHTML=`<label class="field" style="margin-top:8px"><span>Опоры стола</span>
      <select id="selTableSupport"><option value="panels" ${state.tableSupport==='panels'?'selected':''}>Боковины ЛДСП (2 опоры)</option><option value="legs" ${state.tableSupport==='legs'?'selected':''}>Металл ножки (царги только)</option></select></label>`
  }
  if(state.type==='polka'){
    c.innerHTML=`<label class="field" style="margin-top:8px"><span>Тип полки</span>
      <select id="selPolkaType"><option value="simple" ${state.polkaType==='simple'?'selected':''}>Простая доска (на кронштейнах)</option><option value="box" ${state.polkaType==='box'?'selected':''}>Короб с боковинами (навесной шкаф)</option></select></label>`
  }
}

function syncUIFromState(){
  // type
  $$('.type-card').forEach(b=> b.classList.toggle('active', b.dataset.type===state.type))
  $('#inpH').value=state.H; $('#rngH').value=state.H
  $('#inpW').value=state.W; $('#rngW').value=state.W
  $('#inpD').value=state.D; $('#rngD').value=state.D
  $('#inpT').value=state.t
  $('#selMaterial').value=state.materialKey
  $('#inpSheetW').value=state.sheetW
  $('#inpSheetH').value=state.sheetH
  $('#selEdge').value=String(state.edge)
  $('#chkRear').checked=state.rear
  $('#chkBase').checked=state.base
  $('#selConstr').value=state.construction
  $('#selShelfMount').value=state.shelfMount
  $('#inpShelves').value=state.shelves
  $('#inpDoors').value=state.doors
  $('#inpDrawers').value=state.drawers
  $('#inpPartitions').value=state.partitions
  $('#inpGapFacade').value=state.gapFacade
  $('#inpShelfInset').value=state.shelfInset
  $('#selView').value=state.viewMode
  // металл
  const pr = METAL_PROFILES[state.metalProfile]
  $('#selMetalProfile').value=state.metalProfile
  $('#selMetalWall').value=String(state.metalWall || (pr? pr.wall:2))
  $('#inpMetalLevels').value=state.metalLevels
  $('#inpMetalDividers').value=state.metalDividers
  $('#chkMetalShelves').checked=state.metalShelves
  $('#chkMetalRear').checked=state.metalRear
  updateExtraOptions()
  applyTypeVisibility()
  syncHint()
}

function recalc(){
  syncHint()
  lastResult = calculate(state)
  lastPack = packParts(lastResult.parts, state.sheetW, state.sheetH)
  lastLayout = buildLayout(lastResult, lastResult.params)
  // если выбранная деталь пропала — сброс
  if(selectedKey && !lastLayout.items.some(i=> i.key===selectedKey)) selectedKey = null
  renderAll()
  saveState()
}

function renderAll(){
  renderAssembly()
  renderProjections()
  renderParts()
  renderCutting()
  renderEstimate()
  renderJoints()
  renderSummaryMini()
  // badges
  $('#tabPartsCount').textContent = `${lastResult.parts.reduce((s,p)=>s+p.count,0)} дет.`
  $('#tabSheetsCount').textContent = lastPack.hasMetal ? `${lastPack.metalTotals.meters.toFixed(1)} м` : `${lastPack.totalSheets} лист.`
  $('#viewDims').textContent = `${state.W} × ${state.H} × ${state.D} мм`
  syncFastenerBtn()
}

// ==================== Вкладка «Крепёж» ====================
function itemForJointName(name){
  if(!lastLayout) return null
  let it = lastLayout.items.find(i=> i.name === name)
  if(it) return it
  const pfx = prefixOf(name)
  it = lastLayout.items.find(i=> prefixOf(i.name) === pfx && pfx !== i.name)
  if(it) return it
  it = lastLayout.items.find(i=> i.name.startsWith(pfx))
  return it || null
}

function renderJoints(){
  const wrap = $('#jointsPanel')
  if(!wrap) return
  const joints = lastLayout.joints
  const totals = fastenerTotals(joints)

  const totalsHtml = totals.length? totals.map(t=>`
    <div class="cut-stat">
      <div class="cut-stat-label">${t.label}</div>
      <div class="cut-stat-value" style="color:${t.color}">${t.qty}</div>
      <div class="cut-stat-sub">штук</div>
    </div>`).join('') : '<div class="cut-stat"><div class="cut-stat-label">Крепёж</div><div class="cut-stat-value">—</div></div>'

  const rows = joints.map(j=>{
    const item = itemForJointName(j.a)
    const fast = j.fasteners.filter(f=>f.qty>0).map(f=>{
      const ft = FAST_TYPES[f.type]||{}
      return `<span class="hole-chip" style="border-color:${ft.color||'#64748b'};color:${ft.color||'#334155'}">${ft.icon||'•'} ${f.name} ×${f.qty}</span>`
    }).join(' ')
    return `<tr class="joint-row" data-name="${j.a}">
      <td><b>${j.label}</b></td>
      <td style="font-size:12px">${j.a} ↔ ${j.b}</td>
      <td>${fast||'—'}</td>
      <td style="font-size:11px;color:#475569">${j.note||''}</td>
      <td>${item? '<button class="part-open-btn" title="Открыть карточку">📋</button>' : ''}</td>
    </tr>`
  }).join('')

  // детали с разметкой отверстий
  const holeParts = lastLayout.items.filter(i=> i.holes.length>0)
  const holeRows = holeParts.map(i=>`
    <tr class="joint-row" data-key="${i.key}">
      <td><b>${i.name}</b><div style="font-size:11px;color:#64748b">${i.group}</div></td>
      <td class="mono">${i.metal? i.plateW+' мм' : i.plateW+'×'+i.plateH+'×'+i.thick}</td>
      <td><span class="badge-count">${i.holes.length} отв.</span></td>
      <td style="font-size:11px;color:#475569">${i.note||''}</td>
      <td><button class="part-open-btn" title="Развёртка с разметкой">📋</button></td>
    </tr>`).join('')

  wrap.innerHTML = `
    <div class="joints-totals">${totalsHtml}</div>
    <div class="joints-section-title">Соединения конструкции (как детали крепятся между собой)</div>
    <div class="table-wrap">
      <table class="parts-table">
        <thead><tr><th>Соединение</th><th>Детали</th><th>Крепёж</th><th>Разметка / примечание</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div class="joints-section-title" style="margin-top:16px">Детали с разметкой отверстий</div>
    <div class="table-wrap">
      <table class="parts-table">
        <thead><tr><th>Деталь</th><th>Размер</th><th>Отверстия</th><th>Примечание</th><th></th></tr></thead>
        <tbody>${holeRows || '<tr><td colspan="5" style="text-align:center;color:#64748b;padding:16px">Нет деталей с отверстиями</td></tr>'}</tbody>
      </table>
    </div>
    <div class="cutting-tips" style="margin-top:12px">
      <b>Как читать разметку:</b> в карточке детали (📋) — развёртка с номерами отверстий: Ø, глубина, грань и координаты от краёв.
      В сборке включите кнопку <b>«🔩 Отверстия»</b> — точки на гранях покажут положение крепёжа.
    </div>`

  // клики
  wrap.querySelectorAll('tr.joint-row').forEach(tr=>{
    tr.addEventListener('click', ()=>{
      if(tr.dataset.key){ openPartCard(tr.dataset.key); return }
      const name = tr.dataset.name
      if(!name) return
      const item = itemForJointName(name)
      if(item) openPartCard(item.key)
    })
  })
}

function renderAssembly(){
  const el=$('#assemblyCanvas')
  const params = {...state, materialLabel:getMaterial(state.materialKey, state.t).label, _profile: lastResult.params._profile}
  drawAssembly(el, lastLayout, params, state.viewMode, state.exploded, selectedKey, state.showFasteners)
  // legend
  const legend=$('#assemblyLegend')
  if(lastLayout && lastLayout.metal){
    legend.innerHTML=`<div class="legend-item"><span class="legend-dot" style="background:#9fb0bf"></span> Профиль ${lastResult.params._profile.a}×${lastResult.params._profile.b}</div>
    <div class="legend-item"><span class="legend-dot" style="background:#f2c14e"></span> Полка (лист)</div>
    <div class="legend-item"><span class="legend-dot" style="background:#e7e5e4; border:1px solid #999"></span> ДВП / Задняя</div>
    <div class="legend-item"><span class="legend-dot" style="background:#0f172a"></span> Болты M6 (⬅ включите «Отверстия»)</div>`
  }else{
    legend.innerHTML=`<div class="legend-item"><span class="legend-dot" style="background:#f2c14e"></span> Полка / Крыша</div>
    <div class="legend-item"><span class="legend-dot" style="background:#1e3a2f"></span> Боковина / Корпус</div>
    <div class="legend-item"><span class="legend-dot" style="background:#e7e5e4; border:1px solid #999"></span> ДВП / Задняя</div>
    <div class="legend-item"><span class="legend-dot" style="background:#a16207"></span> Кромка ПВХ</div>`
  }
  // info о выбранной детали
  const info = $('#assemblyInfo')
  if(info){
    if(selectedKey && lastLayout){
      const item = lastLayout.items.find(i=> i.key===selectedKey)
      if(item) renderAssemblyInfo(item)
    }else info.innerHTML=''
  }
}

function renderProjections(){
  const el=$('#projectionsGrid')
  drawProjections(el, lastResult.parts, state)
}

function partKeyById(id){
  if(!lastLayout) return null
  const it = lastLayout.items.find(i=> i.partId === id)
  return it ? it.key : null
}

function renderParts(){
  const tbody=$('#partsTable tbody')
  tbody.innerHTML=''
  let idx=1
  lastResult.parts.forEach(p=>{
    const tr=document.createElement('tr')
    const area=(p.w*p.h/1e6).toFixed(3)
    const totalArea=(p.w*p.h*p.count/1e6).toFixed(3)
    const sizeTxt = p.kind==='metal' ? `${p.w} <span style="color:#64748b">мм • ${p.section||''}</span>` : `${p.w} × ${p.h} <span style="color:#64748b">мм</span>`
    const key = partKeyById(p.id)
    tr.innerHTML=`<td>${idx++}</td>
      <td><b>${p.name}</b><div style="font-size:11px;color:#64748b">${p.note||''}</div></td>
      <td>${p.material}</td>
      <td class="mono">${sizeTxt}</td>
      <td class="mono">${p.thickness}</td>
      <td><span class="badge-count">${p.count}</span></td>
      <td style="font-size:11px">${p.edge||'-'}</td>
      <td class="mono">${totalArea} м²</td>
      <td class="part-open-cell">${key? '<button class="part-open-btn" title="Карточка детали: позиция, развёртка, крепёж">📋</button>' : ''}</td>`
    if(key){
      tr.dataset.key = key
      tr.classList.add('row-clickable')
      tr.addEventListener('click', e=>{
        if(e.target.closest('.part-open-btn')) openPartCard(key)
        else selectPart(key)
      })
    }
    tbody.appendChild(tr)
  })
  $('#partsStats').innerHTML=`<span class="stat-pill">Деталей: <strong>${lastResult.parts.reduce((s,p)=>s+p.count,0)}</strong></span>
    <span class="stat-pill">Позиций: <strong>${lastResult.parts.length}</strong></span>
    <span class="stat-pill">Площадь: <strong>${lastResult.totalArea.toFixed(2)} м²</strong></span>
    <span class="stat-pill">Кромка: <strong>${lastResult.edgeM.toFixed(1)} м.п.</strong></span>`
  const hint=$('#partsHint')
  if(hint) hint.textContent = 'Клик по строке — позиция детали в сборке • иконка 📋 — карточка с развёрткой и разметкой отверстий'

  // sketches
  const sketches=$('#partsSketches')
  sketches.innerHTML=''
  lastResult.parts.forEach(p=>{
    const key = partKeyById(p.id)
    const card=document.createElement('div')
    card.className='part-sketch'
    if(key){ card.dataset.key = key; card.classList.add('sketch-clickable') }
    card.innerHTML=`<div class="part-sketch-header"><span class="part-sketch-title">${p.name} <span style="color:#64748b;font-weight:600">×${p.count}</span></span><span class="part-sketch-dims">${p.kind==='metal' ? p.w+' мм' : p.w+'×'+p.h}</span></div><div class="part-sketch-body"></div><div style="padding:6px 10px;background:#fffbeb;border-top:1px solid #e7e5e4;font-size:11px;display:flex;justify-content:space-between"><span>${p.material} ${p.thickness}мм</span><span style="font-weight:700">${key? '📋 карточка' : (p.edge||'без кромки')}</span></div>`
    const body=card.querySelector('.part-sketch-body')
    drawPartSketch(body, p)
    if(key) card.addEventListener('click', ()=> openPartCard(key))
    sketches.appendChild(card)
  })
}

function renderCutting(){
  const summary=$('#cuttingSummary')
  const container=$('#sheetsContainer')
  container.innerHTML=''

  // ===== Раскрой металлического профиля =====
  if(lastPack.hasMetal){
    const mt = lastPack.metalTotals
    const prof = lastResult.params._profile
    const priceM = prof.price
    const cost = mt.meters * priceM
    const rows = lastPack.metalCut.map(g=>`
      <tr>
        <td class="mono"><b>${g.section} мм</b></td>
        <td>${g.items.map(it=>`${it.name} <span class="mono">${it.len} мм</span> ×${it.count}`).join('<br>')}</td>
        <td class="mono">${g.total}</td>
        <td class="mono">${g.meters.toFixed(2)} м</td>
        <td class="mono">${g.weight.toFixed(1)} кг</td>
        <td class="mono">${(g.meters*priceM).toFixed(1)} $</td>
      </tr>`).join('')
    container.innerHTML += `
      <div class="metal-cut-card">
        <div class="sheet-header"><span class="sheet-title">🔩 Раскрой металлического профиля • ${prof.a}×${prof.b}×${prof.wall} мм</span>
          <span class="sheet-meta"><span>Длина <b>${mt.meters.toFixed(2)} м</b></span><span>Вес <b>${mt.weight.toFixed(1)} кг</b></span><span>Деталей <b>${mt.count}</b></span><span>Стоимость <b>${cost.toFixed(1)} $</b></span></span></div>
        <div class="table-wrap" style="border:none;box-shadow:none">
          <table class="parts-table metal-cut-table">
            <thead><tr><th>Сечение</th><th>Наименование / длина</th><th>Кол-во</th><th>Метраж</th><th>Вес</th><th>Стоимость</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        <div class="metal-cut-note">
          <b>Рекомендация:</b> резать профиль на отрезную пилу / гильотину под 90°, заусенцы снять. Длина заготовки 6 м (6000 мм) — отрезайте с учётом ширины реза 2–3 мм.
          Отверстия под болты M6 (Ø6.6) разметить по карточке детали (вкладка «Крепёж»).
        </div>
      </div>`
  }

  const statsMain = getPackStats(lastPack.sheetsMain)
  const statsDvp = lastPack.sheetsDvp.length? getPackStats(lastPack.sheetsDvp): null

  const totalSheets = lastPack.totalSheets
  const totalArea = lastResult.totalAreaCut
  const sheetArea = state.sheetW*state.sheetH/1e6
  const eff = sheetArea*totalSheets ? (totalArea/(sheetArea*totalSheets)*100).toFixed(1) : 0

  summary.innerHTML=`
    <div class="cut-stat"><div class="cut-stat-label">Листов всего</div><div class="cut-stat-value">${totalSheets}</div><div class="cut-stat-sub">${state.sheetW}×${state.sheetH} мм • ${sheetArea.toFixed(2)} м²/лист</div></div>
    <div class="cut-stat"><div class="cut-stat-label">Основной материал</div><div class="cut-stat-value">${lastPack.sheetsMain.length} лист.</div><div class="cut-stat-sub">${statsMain.eff}% заполнение • ${statsMain.usedArea} / ${statsMain.totalArea} м²</div></div>
    <div class="cut-stat"><div class="cut-stat-label">ДВП / дно ящиков</div><div class="cut-stat-value">${lastPack.sheetsDvp.length||0} лист.</div><div class="cut-stat-sub">${statsDvp? statsDvp.eff+'%':'—'} ${statsDvp? statsDvp.usedArea+' м²':''}</div></div>
    <div class="cut-stat"><div class="cut-stat-label">Эффективность раскроя</div><div class="cut-stat-value">${eff}%</div><div class="cut-stat-sub">Обрезь ${(sheetArea*totalSheets - totalArea).toFixed(2)} м² • пропил 3мм учтён</div></div>
  `

  const renderSheetGroup = (sheets, title, sheetW, sheetH)=>{
    if(!sheets.length) return
    const groupTitle=document.createElement('div')
    groupTitle.style.cssText='font-weight:800;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#1e3a2f;margin:8px 0 4px;opacity:.7'
    groupTitle.textContent=title
    container.appendChild(groupTitle)
    sheets.forEach(sh=>{
      const card=document.createElement('div')
      card.className='sheet-card'
      const waste=(sh.area - sh.usedArea)/1e6
      card.innerHTML=`<div class="sheet-header"><span class="sheet-title">Лист #${sh.index} — ${sh.label}</span><span class="sheet-meta"><span>Занято <b>${sh.efficiency.toFixed(1)}%</b></span><span>Деталей <b>${sh.items.length}</b></span><span>Обрезь <b>${waste.toFixed(2)} м²</b></span></span></div><div class="sheet-body"></div><div class="sheet-legend"><span><i style="width:14px;height:14px;background:#f2c14e;border:1px solid #1e3a2f;display:inline-block;border-radius:3px"></i> Основной материал</span><span><i style="width:14px;height:1px;background:#ef4444;display:inline-block;border-top:1px dashed #ef4444"></i> Линия реза (пропи 3мм)</span><span>↻ поворот 90° — штриховка</span></div>`
      const body=card.querySelector('.sheet-body')
      drawCuttingSheet(body, sh, sheetW, sheetH)
      container.appendChild(card)
    })
  }

  renderSheetGroup(lastPack.sheetsMain, `Раскрой основного материала • ${getMaterial(state.materialKey, state.t).label}`, state.sheetW, state.sheetH)
  if(lastPack.sheetsDvp.length){
    renderSheetGroup(lastPack.sheetsDvp, 'Раскрой ДВП 3.2 мм (задние стенки, дно ящиков)', state.sheetW, state.sheetH)
  }

  if(totalSheets===0 && !lastPack.hasMetal){
    container.innerHTML='<div style="padding:24px;text-align:center;color:#64748b">Нет деталей для раскроя</div>'
  }
}

function renderEstimate(){
  const el=$('#estimateGrid')
  const m=getMaterial(state.materialKey, state.t)
  const sheetArea = state.sheetW*state.sheetH/1e6
  const priceSheet = sheetArea * m.priceM2
  const sheets = lastPack.sheetsMain.length + (lastPack.sheetsDvp.length? lastPack.sheetsDvp.length:0)
  const matCost = sheets * priceSheet
  const edgeCost = lastResult.edgeM * 1.2 // $ per meter
  const fittings = estimateFittings()
  const work = 25 // base
  // металл
  const hasMetal = lastPack.hasMetal
  const prof = lastResult.params._profile
  const metalCost = hasMetal ? lastPack.metalTotals.meters * prof.price : 0
  const metalRows = hasMetal ? `
    <div class="est-row"><span>Профиль ${prof.a}×${prof.b}×${prof.wall} мм • ${lastPack.metalTotals.meters.toFixed(2)} м × ${prof.price}$</span><b>${metalCost.toFixed(1)} $</b></div>
    <div class="est-row"><span>Вес профиля (≈)</span><b>${lastPack.metalTotals.weight.toFixed(1)} кг</b></div>` : ''

  const rearOn = state.type==='metal' ? state.metalRear : state.rear
  const matTotal = matCost + edgeCost + (rearOn?8:0) + 3.5 + metalCost

  el.innerHTML=`
    <div class="est-card">
      <h3>📦 Материалы</h3>
      ${metalRows}
      ${sheets>0? `<div class="est-row"><span>${m.label} • ${sheets} лист. × ${priceSheet.toFixed(1)}$</span><b>${matCost.toFixed(1)} $</b></div>` : ''}
      <div class="est-row"><span>Кромка ПВХ ${lastResult.edgeM.toFixed(1)} м × 1.2$</span><b>${edgeCost.toFixed(1)} $</b></div>
      <div class="est-row"><span>ДВП задняя стенка ${rearOn?'есть':'нет'}</span><b>${rearOn? '8.0 $':'0.0 $'}</b></div>
      <div class="est-row"><span>Плёнка / упаковка</span><b>3.5 $</b></div>
      <div class="est-total"><span>Итого материалы</span><strong>${matTotal.toFixed(1)} $</strong></div>
      <div style="margin-top:10px;font-size:11px;color:#64748b">${hasMetal? `Профиль ${prof.a}×${prof.b}×${prof.wall}: ${lastPack.metalTotals.meters.toFixed(2)} м × ${prof.price}$/м • вес ≈ ${lastPack.metalTotals.weight.toFixed(1)} кг` : `Цена листа ${sheetArea.toFixed(2)}м² × ${m.priceM2}$/м² = ${priceSheet.toFixed(1)}$ • Без доставки и распила на стороне`}</div>
    </div>
    <div class="est-card">
      <h3>🔩 Фурнитура</h3>
      ${fittings.map(f=> `<div class="est-row"><span>${f.name} × ${f.qty}</span><b>${f.cost.toFixed(1)} $</b></div>`).join('')}
      <div class="est-total"><span>Итого фурнитура</span><strong>${fittings.reduce((s,f)=>s+f.cost,0).toFixed(1)} $</strong></div>
      <div style="margin-top:10px;font-size:11px;color:#64748b">Петли 35мм, направляющие шариковые 450мм, ручки, конфирматы 7×50, шканты, полкодержатели</div>
    </div>
    <div class="est-card">
      <h3>📐 Раскрой и обработка</h3>
      ${sheets>0? `<div class="est-row"><span>Распил на форматно-раскроечном</span><b>${(sheets*6).toFixed(1)} $</b></div>` : ''}
      ${hasMetal? `<div class="est-row"><span>Распил профиля (отрезная) ${lastPack.metalTotals.meters.toFixed(1)} м</span><b>${(lastPack.metalTotals.meters*2).toFixed(1)} $</b></div>
      <div class="est-row"><span>Сверление отверстий Ø6.6 (болты)</span><b>12.0 $</b></div>` : ''}
      <div class="est-row"><span>Кромление (погонаж) ${lastResult.edgeM.toFixed(1)}м</span><b>${(lastResult.edgeM*0.8).toFixed(1)} $</b></div>
      <div class="est-row"><span>Присадка отверстий</span><b>7.0 $</b></div>
      <div class="est-row"><span>Упаковка</span><b>4.0 $</b></div>
      <div class="est-total"><span>Работа</span><strong>${(sheets*6 + lastResult.edgeM*0.8 + 11 + (hasMetal? lastPack.metalTotals.meters*2 + 12 : 0)).toFixed(1)} $</strong></div>
    </div>
    <div class="est-card" style="background:linear-gradient(135deg,#1e3a2f,#2a5a45);color:#fff;border:none">
      <h3 style="color:#f2c14e">💰 Итоговая смета</h3>
      <div class="est-row" style="color:#fff;border-color:rgba(255,255,255,.2)"><span>Материалы</span><b>${matTotal.toFixed(1)} $</b></div>
      <div class="est-row" style="color:#fff;border-color:rgba(255,255,255,.2)"><span>Фурнитура</span><b>${fittings.reduce((s,f)=>s+f.cost,0).toFixed(1)} $</b></div>
      <div class="est-row" style="color:#fff;border-color:rgba(255,255,255,.2)"><span>Работа</span><b>${(sheets*6 + lastResult.edgeM*0.8 + 11 + (hasMetal? lastPack.metalTotals.meters*2 + 12 : 0)).toFixed(1)} $</b></div>
      <div style="background:#f2c14e;color:#1e3a2f;border-radius:12px;padding:14px;display:flex;justify-content:space-between;align-items:center;margin-top:10px"><span style="font-weight:800">ВСЕГО</span><strong style="font-size:22px">${(matTotal + fittings.reduce((s,f)=>s+f.cost,0) + sheets*6 + lastResult.edgeM*0.8 + 11 + (hasMetal? lastPack.metalTotals.meters*2 + 12 : 0)).toFixed(1)} $</strong></div>
      <div style="margin-top:10px;font-size:11px;opacity:.8">Расчёт ориентировочный • Цены на ${new Date().toLocaleDateString('ru-RU')} • Курс уточняйте у поставщика</div>
      <button class="btn btn-primary" style="margin-top:12px;background:#f2c14e;color:#1e3a2f" onclick="doPrint()">🖨️ Печать сметы и чертежей</button>
    </div>
  `
}

function estimateFittings(){
  const out=[]
  // ===== Металлическая рама: крепёж рамы =====
  if(state.type==='metal'){
    const L = state.metalLevels, nDiv = state.metalDividers
    const bolts = 4*(4*L) + 2*(4*L) + 4*L*nDiv // фронт/бэк 4 на угол + боковые 2 на угол + перегородки
    const brackets = 4*L
    out.push({name:'Болт M6×20 + гайка + шайба', qty: bolts, cost: bolts*0.35})
    out.push({name:'Угольник 30×30×2 (усиление угла)', qty: brackets, cost: brackets*1.2})
    out.push({name:'Саморез по металлу Ø4×13', qty: state.metalShelves? 4*(L-1)*(nDiv+1):0, cost: state.metalShelves? 4*(L-1)*(nDiv+1)*0.08:0})
    if(state.metalRear) out.push({name:'Саморез по металлу Ø4×13 (задняя)', qty: 8, cost: 1.0})
    return out
  }
  if(state.doors>0){
    out.push({name:'Петля накладная 35мм (4шарн., с доводчиком)', qty: state.doors*2, cost: state.doors*2*1.8})
    out.push({name:'Ручка мебельная', qty: state.doors, cost: state.doors*2.5})
  }
  if(state.drawers>0){
    out.push({name:'Направляющие шариковые 450мм (пара)', qty: state.drawers, cost: state.drawers*4.5})
    out.push({name:'Ручка ящика', qty: state.drawers, cost: state.drawers*2.5})
  }
  if(state.shelves>0){
    const shelvesCount = state.shelves * (state.partitions+1)
    out.push({name:'Полкодержатель (4шт/полка)', qty: shelvesCount*4, cost: shelvesCount*4*0.25})
  }
  out.push({name:'Конфирмат 7×50', qty: 20 + state.shelves*4 + state.doors*4, cost: (20 + state.shelves*4)*0.12})
  out.push({name:'Шкант 8×30 + клей', qty: 16, cost: 2.0})
  out.push({name:'Заглушка конфирмата', qty: 20, cost: 1.2})
  out.push({name:'Уголок / эксцентрик', qty: 8, cost: 3.2})
  if(state.rear) out.push({name:'Гвозди / саморезы для ДВП', qty: 40, cost: 2.5})
  return out
}

function renderSummaryMini(){
  const el=$('#summaryMini')
  const cnt=lastResult.parts.reduce((s,p)=>s+p.count,0)
  const totalArea=lastResult.totalArea.toFixed(2)
  const eff = (lastResult.totalAreaCut / (state.sheetW*state.sheetH/1e6 * Math.max(1,lastPack.totalSheets)) *100).toFixed(0)
  el.innerHTML=`<div style="font-weight:800;color:#1e3a2f;margin-bottom:6px">📋 Спецификация</div>
    <div style="font-size:11px;color:#475569">Изделие: <b>${typeLabel(state.type)}</b> • ${state.W}×${state.H}×${state.D} мм • ${getMaterial(state.materialKey, state.t).label}</div>
    <div class="mini-grid">
      <div class="mini-card"><strong>${cnt}</strong><span>деталей</span></div>
      <div class="mini-card"><strong>${lastPack.totalSheets}</strong><span>листов</span></div>
      <div class="mini-card"><strong>${totalArea} м²</strong><span>площадь</span></div>
      <div class="mini-card"><strong>${eff}%</strong><span>эконом</span></div>
    </div>
    <div style="margin-top:8px;font-size:11px;display:flex;justify-content:space-between;color:#64748b"><span>Кромка ${lastResult.edgeM.toFixed(1)} м</span><span>${state.rear?'ДВП есть':'без ДВП'}</span><span>${state.base?'цоколь 80':'без цоколя'}</span></div>`
}
function typeLabel(t){
  return {shkaf:'Шкаф', tumba:'Тумба', stoyka:'Стойка', stol:'Стол', polka:'Полка', metal:'Металлическая рама'}[t]||t
}

function setupTabs(){
  $$('.tab').forEach(btn=>{
    btn.addEventListener('click', ()=> switchTab(btn.dataset.tab))
  })
}
function switchTab(name){
  $$('.tab').forEach(b=> b.classList.toggle('active', b.dataset.tab===name))
  $$('.tab-panel').forEach(p=> p.classList.toggle('active', p.id===`panel-${name}`))
  $$('.mnav-btn').forEach(b=> b.classList.toggle('active', b.dataset.tab===name))
  // scroll into view on mobile
  if(window.innerWidth<980){
    document.querySelector('.main-content').scrollTop=0
  }
  if(name==='cutting'){
    // trigger resize?
  }
}

function doPrint(){
  // APK (WebView): window.print() без нативного хука молчит —
  // вызываем мост ConstructionAndroid.print() (printToPdf → системный диалог).
  if(window.ConstructionAndroid && typeof window.ConstructionAndroid.print === 'function'){
    try{ window.ConstructionAndroid.print(); return }catch(e){/* fall through */}
  }
  window.print()
}
window.doPrint = doPrint // для inline onclick в разметке

function exportCSV(){
  let csv='№;Деталь;Материал;Ширина,мм;Высота,мм;Толщина,мм;Кол-во;Кромка;Площадь м2;Примечание\n'
  lastResult.parts.forEach((p,i)=>{
    const w = p.kind==='metal' ? p.w : p.w
    const h = p.kind==='metal' ? (p.section||'') : p.h
    csv+=`${i+1};${p.name};${p.material};${w};${h};${p.thickness};${p.count};${p.edge};${(p.w*p.h*p.count/1e6).toFixed(3)};${p.note}\n`
  })
  if(lastPack.hasMetal){
    lastPack.metalCut.forEach(g=>{
      csv+=`Профиль;${g.section};длина ${g.items.map(it=>it.len+'×'+it.count).join(', ')};;${g.meters} м;;;;${g.weight} кг\n`
    })
  }
  csv+=`;;;;;;;ИТОГО;${lastResult.totalArea.toFixed(3)};\n`
  csv+=`Листы;${lastPack.totalSheets};${state.sheetW}x${state.sheetH};;;;;;;\n`
  const blob=new Blob([`\uFEFF${csv}`],{type:'text/csv;charset=utf-8;'})
  const url=URL.createObjectURL(blob)
  const a=document.createElement('a')
  a.href=url
  a.download=`raskroy_${state.type}_${state.W}x${state.H}_${new Date().toISOString().slice(0,10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
  toast('CSV сохранён')
}
function copyList(){
  let txt=`CONSTRUCTION • ${typeLabel(state.type)} ${state.W}×${state.H}×${state.D} мм • ${getMaterial(state.materialKey, state.t).label}\n`
  if(lastPack.hasMetal){
    txt+=`Профиль ${lastResult.params._profile.a}×${lastResult.params._profile.b}×${lastResult.params._profile.wall} • Длина: ${lastPack.metalTotals.meters.toFixed(2)} м • Вес ≈ ${lastPack.metalTotals.weight.toFixed(1)} кг\n`
  }
  txt+=`Лист ${state.sheetW}×${state.sheetH} • Листов: ${lastPack.totalSheets} • Площадь: ${lastResult.totalArea.toFixed(2)} м² • Кромка: ${lastResult.edgeM.toFixed(1)} м\n\n`
  txt+=`№  Деталь | Размер | Кол-во | Кромка\n`
  txt+=`—`.repeat(50)+`\n`
  lastResult.parts.forEach((p,i)=>{
    const size = p.kind==='metal' ? `${p.w} мм (${p.section||''})` : `${p.w}×${p.h}×${p.thickness}`
    txt+=`${i+1}. ${p.name} — ${size} ×${p.count}  [${p.edge||'-'}]  ${p.material}\n`
  })
  navigator.clipboard.writeText(txt).then(()=> toast('Список скопирован в буфер'))
}

function toast(msg){
  const el=$('#toast')
  el.textContent=msg
  el.classList.add('show')
  setTimeout(()=> el.classList.remove('show'), 2500)
}

function saveState(){
  localStorage.setItem('construction_state', JSON.stringify(state))
}
function loadState(){
  try{
    const s=JSON.parse(localStorage.getItem('construction_state'))
    if(s) state={...state, ...s}
  }catch(e){}
}

init()

// expose for debugging
window._state=state
window._calc=calculate
