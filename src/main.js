import './style.css'
import { calculate, getMaterial } from './calculator.js'
import { packParts, getPackStats } from './packing.js'
import { drawAssembly, drawProjections, drawPartSketch, drawCuttingSheet } from './draw.js'

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
  rotate: 0
}

let lastResult = null
let lastPack = null

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
    // толщина и лист — из справочника выбранного материала
    const m=getMaterial(state.materialKey)
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
      const inp=$('#'+inpId)
      let v=Number(inp.value)
      if(action==='inc') v=Math.min(v+1, Number(inp.max)||12)
      else v=Math.max(v-1, Number(inp.min)||0)
      inp.value=v
      state[target]=v
      saveState(); recalc()
    })
  })

  // прямой ввод в поля степперов (с клавиатуры)
  Object.entries({inpShelves:'shelves', inpDoors:'doors', inpDrawers:'drawers', inpPartitions:'partitions'}).forEach(([id,key])=>{
    $('#'+id).addEventListener('change', e=>{
      const inp=e.target
      let v=Math.round(Number(inp.value))
      if(!Number.isFinite(v)) v=state[key]
      v=Math.max(Number(inp.min)||0, Math.min(Number(inp.max)||12, v))
      inp.value=v
      state[key]=v
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
    saveState()
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
  $('#btnExportPDF').addEventListener('click', ()=>window.print())
  $('#btnCopyList').addEventListener('click', copyList)
  $('#btnPrint').addEventListener('click', ()=>window.print())
  $('#btnSave').addEventListener('click', ()=>{
    saveState()
    toast('Проект сохранён в браузере')
  })

  // mobile nav
  $$('.mnav-btn').forEach(b=>{
    b.addEventListener('click', ()=>{
      const tab=b.dataset.tab
      switchTab(tab)
    })
  })
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
  syncHint()
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
  updateExtraOptions()
  syncHint()
}

function recalc(){
  syncHint()
  lastResult = calculate(state)
  lastPack = packParts(lastResult.parts, state.sheetW, state.sheetH)
  renderAll()
  saveState()
}

function renderAll(){
  renderAssembly()
  renderProjections()
  renderParts()
  renderCutting()
  renderEstimate()
  renderSummaryMini()
  // badges
  $('#tabPartsCount').textContent = `${lastResult.parts.reduce((s,p)=>s+p.count,0)} дет.`
  $('#tabSheetsCount').textContent = `${lastPack.totalSheets} лист.`
  $('#viewDims').textContent = `${state.W} × ${state.H} × ${state.D} мм`
}

function renderAssembly(){
  const el=$('#assemblyCanvas')
  drawAssembly(el, lastResult.parts, {...state, materialLabel:getMaterial(state.materialKey, state.t).label}, state.viewMode, state.exploded)
  // legend
  const legend=$('#assemblyLegend')
  legend.innerHTML=`<div class="legend-item"><span class="legend-dot" style="background:#f2c14e"></span> Полка / Крыша</div>
    <div class="legend-item"><span class="legend-dot" style="background:#1e3a2f"></span> Боковина / Корпус</div>
    <div class="legend-item"><span class="legend-dot" style="background:#e7e5e4; border:1px solid #999"></span> ДВП / Задняя</div>
    <div class="legend-item"><span class="legend-dot" style="background:#a16207"></span> Кромка ПВХ</div>`
}

function renderProjections(){
  const el=$('#projectionsGrid')
  drawProjections(el, lastResult.parts, state)
}

function renderParts(){
  const tbody=$('#partsTable tbody')
  tbody.innerHTML=''
  let idx=1
  lastResult.parts.forEach(p=>{
    const tr=document.createElement('tr')
    const totalArea=(p.w*p.h*p.count/1e6).toFixed(3)
    tr.innerHTML=`<td>${idx++}</td>
      <td><b>${p.name}</b><div style="font-size:.6875rem;color:#64748b">${p.note||''}</div></td>
      <td>${p.material}</td>
      <td class="mono">${p.w} × ${p.h} <span style="color:#64748b">мм</span></td>
      <td class="mono">${p.thickness}</td>
      <td><span class="badge-count">${p.count}</span></td>
      <td style="font-size:.6875rem">${p.edge||'-'}</td>
      <td class="mono">${totalArea} м²</td>`
    tbody.appendChild(tr)
  })
  $('#partsStats').innerHTML=`<span class="stat-pill">Деталей: <strong>${lastResult.parts.reduce((s,p)=>s+p.count,0)}</strong></span>
    <span class="stat-pill">Позиций: <strong>${lastResult.parts.length}</strong></span>
    <span class="stat-pill">Площадь: <strong>${lastResult.totalArea.toFixed(2)} м²</strong></span>
    <span class="stat-pill">Кромка: <strong>${lastResult.edgeM.toFixed(1)} м.п.</strong></span>`

  // sketches
  const sketches=$('#partsSketches')
  sketches.innerHTML=''
  lastResult.parts.forEach(p=>{
    const card=document.createElement('div')
    card.className='part-sketch'
    card.innerHTML=`<div class="part-sketch-header"><span class="part-sketch-title">${p.name} <span style="color:#64748b;font-weight:600">×${p.count}</span></span><span class="part-sketch-dims">${p.w}×${p.h}</span></div><div class="part-sketch-body"></div><div style="padding:6px 10px;background:#fffbeb;border-top:1px solid #e7e5e4;font-size:.6875rem;display:flex;justify-content:space-between;gap:6px;flex-wrap:wrap"><span>${p.material} ${p.thickness}мм</span><span style="font-weight:700">${p.edge||'без кромки'}</span></div>`
    const body=card.querySelector('.part-sketch-body')
    drawPartSketch(body, p)
    sketches.appendChild(card)
  })
}

function renderCutting(){
  const summary=$('#cuttingSummary')
  const container=$('#sheetsContainer')
  container.innerHTML=''

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
    groupTitle.style.cssText='font-weight:800;font-size:.75rem;letter-spacing:.08em;text-transform:uppercase;color:#1e3a2f;margin:8px 0 4px;opacity:.7'
    groupTitle.textContent=title
    container.appendChild(groupTitle)
    sheets.forEach(sh=>{
      const card=document.createElement('div')
      card.className='sheet-card'
      const waste=(sh.area - sh.usedArea)/1e6
      card.innerHTML=`<div class="sheet-header"><span class="sheet-title">Лист #${sh.index} — ${sh.label}</span><span class="sheet-meta"><span>Занято <b>${sh.efficiency.toFixed(1)}%</b></span><span>Деталей <b>${sh.items.length}</b></span><span>Обрезь <b>${waste.toFixed(2)} м²</b></span></span></div><div class="sheet-body"></div><div class="sheet-legend"><span><i style="width:14px;height:14px;background:#f2c14e;border:1px solid #1e3a2f;display:inline-block;border-radius:3px"></i> Основной материал</span><span><i style="width:14px;height:1px;background:#ef4444;display:inline-block;border-top:1px dashed #ef4444"></i> Линия реза (пропил 3мм)</span><span>↻ поворот 90° — штриховка</span></div>`
      const body=card.querySelector('.sheet-body')
      drawCuttingSheet(body, sh, sheetW, sheetH)
      container.appendChild(card)
    })
  }

  renderSheetGroup(lastPack.sheetsMain, `Раскрой основного материала • ${getMaterial(state.materialKey, state.t).label}`, state.sheetW, state.sheetH)
  if(lastPack.sheetsDvp.length){
    renderSheetGroup(lastPack.sheetsDvp, 'Раскрой ДВП 3.2 мм (задние стенки, дно ящиков)', state.sheetW, state.sheetH)
  }

  if(totalSheets===0){
    container.innerHTML='<div style="padding:24px;text-align:center;color:#64748b">Нет деталей для раскроя</div>'
  }
}

function renderEstimate(){
  const el=$('#estimateGrid')
  const m=getMaterial(state.materialKey, state.t)
  const sheetArea = state.sheetW*state.sheetH/1e6
  const priceSheet = sheetArea * m.priceM2
  const sheets = lastPack.totalSheets
  const sheetsMain = lastPack.sheetsMain.length
  // листы ДВП считаются отдельно (фикс. цена задней стенки), по цене основного материала — только он
  const matCost = sheetsMain * priceSheet
  const edgeCost = lastResult.edgeM * 1.2 // $ per meter
  const fittings = estimateFittings()

  el.innerHTML=`
    <div class="est-card">
      <h3>📦 Материалы</h3>
      <div class="est-row"><span>${m.label} • ${sheetsMain} лист. × ${priceSheet.toFixed(1)}$</span><b>${matCost.toFixed(1)} $</b></div>
      <div class="est-row"><span>Кромка ПВХ ${lastResult.edgeM.toFixed(1)} м × 1.2$</span><b>${edgeCost.toFixed(1)} $</b></div>
      <div class="est-row"><span>ДВП задняя стенка ${state.rear?'есть':'нет'}</span><b>${state.rear? '8.0 $':'0.0 $'}</b></div>
      <div class="est-row"><span>Плёнка / упаковка</span><b>3.5 $</b></div>
      <div class="est-total"><span>Итого материалы</span><strong>${(matCost+edgeCost + (state.rear?8:0)+3.5).toFixed(1)} $</strong></div>
      <div style="margin-top:10px;font-size:.6875rem;color:#64748b">Цена листа ${sheetArea.toFixed(2)}м² × ${m.priceM2}$/м² = ${priceSheet.toFixed(1)}$ • Без доставки и распила на стороне</div>
    </div>
    <div class="est-card">
      <h3>🔩 Фурнитура</h3>
      ${fittings.map(f=> `<div class="est-row"><span>${f.name} × ${f.qty}</span><b>${f.cost.toFixed(1)} $</b></div>`).join('')}
      <div class="est-total"><span>Итого фурнитура</span><strong>${fittings.reduce((s,f)=>s+f.cost,0).toFixed(1)} $</strong></div>
      <div style="margin-top:10px;font-size:.6875rem;color:#64748b">Петли 35мм, направляющие шариковые 450мм, ручки, конфирматы 7×50, шканты, полкодержатели</div>
    </div>
    <div class="est-card">
      <h3>📐 Раскрой и обработка</h3>
      <div class="est-row"><span>Распил на форматно-раскроечном</span><b>${(sheets*6).toFixed(1)} $</b></div>
      <div class="est-row"><span>Кромление (погонаж) ${lastResult.edgeM.toFixed(1)}м</span><b>${(lastResult.edgeM*0.8).toFixed(1)} $</b></div>
      <div class="est-row"><span>Присадка отверстий</span><b>7.0 $</b></div>
      <div class="est-row"><span>Упаковка</span><b>4.0 $</b></div>
      <div class="est-total"><span>Работа</span><strong>${(sheets*6 + lastResult.edgeM*0.8 + 11).toFixed(1)} $</strong></div>
    </div>
    <div class="est-card" style="background:linear-gradient(135deg,#1e3a2f,#2a5a45);color:#fff;border:none">
      <h3 style="color:#f2c14e">💰 Итоговая смета</h3>
      <div class="est-row" style="color:#fff;border-color:rgba(255,255,255,.2)"><span>Материалы</span><b>${(matCost+edgeCost + (state.rear?8:0)+3.5).toFixed(1)} $</b></div>
      <div class="est-row" style="color:#fff;border-color:rgba(255,255,255,.2)"><span>Фурнитура</span><b>${fittings.reduce((s,f)=>s+f.cost,0).toFixed(1)} $</b></div>
      <div class="est-row" style="color:#fff;border-color:rgba(255,255,255,.2)"><span>Работа</span><b>${(sheets*6 + lastResult.edgeM*0.8 + 11).toFixed(1)} $</b></div>
      <div style="background:#f2c14e;color:#1e3a2f;border-radius:12px;padding:14px;display:flex;justify-content:space-between;gap:8px;align-items:center;margin-top:10px"><span style="font-weight:800">ВСЕГО</span><strong style="font-size:1.375rem">${(matCost+edgeCost+ (state.rear?8:0)+3.5 + fittings.reduce((s,f)=>s+f.cost,0) + sheets*6 + lastResult.edgeM*0.8 + 11).toFixed(1)} $</strong></div>
      <div style="margin-top:10px;font-size:.6875rem;opacity:.8">Расчёт ориентировочный • Цены на ${new Date().toLocaleDateString('ru-RU')} • Курс уточняйте у поставщика</div>
      <button class="btn btn-primary" style="margin-top:12px;background:#f2c14e;color:#1e3a2f" onclick="window.print()">🖨️ Печать сметы и чертежей</button>
    </div>
  `
}

function estimateFittings(){
  const out=[]
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
  out.push({name:'Конфирмат 7×50', qty: 20 + state.shelves*4 + state.doors*4, cost: (20 + state.shelves*4 + state.doors*4)*0.12})
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
    <div style="font-size:.6875rem;color:#475569">Изделие: <b>${typeLabel(state.type)}</b> • ${state.W}×${state.H}×${state.D} мм • ${getMaterial(state.materialKey, state.t).label}</div>
    <div class="mini-grid">
      <div class="mini-card"><strong>${cnt}</strong><span>деталей</span></div>
      <div class="mini-card"><strong>${lastPack.totalSheets}</strong><span>листов</span></div>
      <div class="mini-card"><strong>${totalArea} м²</strong><span>площадь</span></div>
      <div class="mini-card"><strong>${eff}%</strong><span>эконом</span></div>
    </div>
    <div style="margin-top:8px;font-size:.6875rem;display:flex;justify-content:space-between;gap:6px;flex-wrap:wrap;color:#64748b"><span>Кромка ${lastResult.edgeM.toFixed(1)} м</span><span>${state.rear?'ДВП есть':'без ДВП'}</span><span>${state.base?'цоколь 80':'без цоколя'}</span></div>`
}
function typeLabel(t){
  return {shkaf:'Шкаф', tumba:'Тумба', stoyka:'Стойка', stol:'Стол', polka:'Полка'}[t]||t
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
  // на мобильном контент выше навигации — прокручиваем к нему, чтобы была видна смена вкладки
  if(window.innerWidth<980){
    const main=document.querySelector('.main')
    if(main && main.scrollIntoView) main.scrollIntoView({behavior:'smooth', block:'start'})
  }else{
    document.querySelector('.main-content').scrollTop=0
  }
}

function exportCSV(){
  let csv='№;Деталь;Материал;Ширина,мм;Высота,мм;Толщина,мм;Кол-во;Кромка;Площадь м2;Примечание\n'
  lastResult.parts.forEach((p,i)=>{
    csv+=`${i+1};${p.name};${p.material};${p.w};${p.h};${p.thickness};${p.count};${p.edge};${(p.w*p.h*p.count/1e6).toFixed(3)};${p.note}\n`
  })
  csv+=`;;;;;;;ИТОГО;${lastResult.totalArea.toFixed(3)};\n`
  csv+=`Листы;${lastPack.totalSheets};${state.sheetW}x${state.sheetH};;;;;;;\n`
  const blob=new Blob([`\uFEFF${csv}`],{type:'text/csv;charset=utf-8;'})
  const url=URL.createObjectURL(blob)
  const a=document.createElement('a')
  a.href=url
  a.download=`raskroy_${state.type}_${state.W}x${state.H}_${new Date().toISOString().slice(0,10)}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
  toast('CSV сохранён')
}
function copyList(){
  let txt=`CONSTRUCTION • ${typeLabel(state.type)} ${state.W}×${state.H}×${state.D} мм • ${getMaterial(state.materialKey, state.t).label}\n`
  txt+=`Лист ${state.sheetW}×${state.sheetH} • Листов: ${lastPack.totalSheets} • Площадь: ${lastResult.totalArea.toFixed(2)} м² • Кромка: ${lastResult.edgeM.toFixed(1)} м\n\n`
  txt+=`№  Деталь | Размер | Кол-во | Кромка\n`
  txt+=`—`.repeat(50)+`\n`
  lastResult.parts.forEach((p,i)=>{
    txt+=`${i+1}. ${p.name} — ${p.w}×${p.h}×${p.thickness} ×${p.count}  [${p.edge||'-'}]  ${p.material}\n`
  })
  const done=()=> toast('Список скопирован в буфер')
  const fallback=()=>{
    // file:// (Android WebView) и старые браузеры без Clipboard API
    const ta=document.createElement('textarea')
    ta.value=txt
    ta.style.cssText='position:fixed;opacity:0;left:-9999px'
    document.body.appendChild(ta)
    ta.select()
    let ok=false
    try{ ok=document.execCommand('copy') }catch(e){ ok=false }
    ta.remove()
    ok ? done() : toast('Не удалось скопировать')
  }
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(txt).then(done).catch(fallback)
  }else{
    fallback()
  }
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
