/**
 * Отрисовка эскизов — SVG
 * - Изометрия сборки
 * - 4 проекции
 * - Эскиз детали
 * - Карта раскроя
 */

/**
 * model = { items, ghosts, joints, metal } — из joinery.buildLayout()
 */
export function drawAssembly(container, model, params, mode='iso', exploded=false, selectedKey=null, showFasteners=false){
  container.innerHTML = ''
  const parts = model ? model.items : []
  const W = params.W, H = params.H, D = params.D
  const t = params.t

  // Выбираем SVG размеры
  const svgNS = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(svgNS,'svg')
  // viewBox будет адаптивным
  svg.setAttribute('viewBox', '0 0 640 480')
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet')
  svg.style.width='100%'
  svg.style.maxHeight='460px'
  svg.style.background = '#fafaf9'
  svg.style.borderRadius = '12px'

  // helper to create element
  const g = (tag, attrs={})=>{
    const e=document.createElementNS(svgNS, tag)
    for(const k in attrs) e.setAttribute(k, attrs[k])
    return e
  }

  const bg = g('rect',{x:0,y:0,width:640,height:480,rx:12,fill:'#fafaf9',stroke:'#e7e5e4'})
  svg.appendChild(bg)

  // сетка
  for(let i=0;i<640;i+=40){
    svg.appendChild(g('line',{x1:i,y1:0,x2:i,y2:480,stroke:'#f1f5f9','stroke-width':1,opacity:0.6}))
  }
  for(let i=0;i<480;i+=40){
    svg.appendChild(g('line',{x1:0,y1:i,x2:640,y2:i,stroke:'#f1f5f9','stroke-width':1,opacity:0.6}))
  }

  if(model && model.metal){
    drawIsoMetal(svg, g, model, params, exploded, selectedKey, showFasteners)
  }else if(mode==='front'){
    drawFront(svg, W,H,D,t, parts, params, exploded)
  }else if(mode==='side'){
    drawSide(svg, W,H,D,t, parts, params)
  }else{
    drawIso(svg, W,H,D,t, parts, params, exploded, model, selectedKey, showFasteners)
  }

  // подпись
  const label = g('text',{x:12,y:18,'font-size':11,'font-weight':800,fill:'#1e3a2f','letter-spacing':'0.06em'})
  label.textContent = (model && model.metal) ? 'МЕТАЛЛИЧЕСКАЯ РАМА • ИЗОМЕТРИЯ' : mode==='iso' ? 'ИЗОМЕТРИЯ • М 1:10' : mode==='front' ? 'ВИД СПЕРЕДИ • ФАСАД' : 'ВИД СБОКУ'
  svg.appendChild(label)

  const dims = g('text',{x:12,y:34,'font-size':10,'font-family':'JetBrains Mono, monospace',fill:'#64748b'})
  const matLabel = (model && model.metal) ? (params._profile ? `Профиль ${params._profile.a}×${params._profile.b}×${params._profile.wall}` : 'Профиль') : `${params.materialLabel} ${t}мм`
  dims.textContent = `${W} × ${H} × ${D} мм  •  ${matLabel}  •  ${parts.length} дет.`
  svg.appendChild(dims)

  container.appendChild(svg)
}

// ==================== Металлическая рама (изометрия) ====================
function isoBoxCorners(iso, x0,y0,z0, x1,y1,z1){
  return {
    top:  [iso(x0,y1,z0), iso(x1,y1,z0), iso(x1,y1,z1), iso(x0,y1,z1)],
    right:[iso(x1,y0,z0), iso(x1,y0,z1), iso(x1,y1,z1), iso(x1,y1,z0)],
    front:[iso(x0,y0,z0), iso(x1,y0,z0), iso(x1,y1,z0), iso(x0,y1,z0)]
  }
}

function drawIsoMetal(svg, g, model, params, exploded, selectedKey, showFasteners){
  const W = params.W, H = params.H, D = params.D
  const cos30 = Math.cos(30*Math.PI/180), sin30 = Math.sin(30*Math.PI/180)
  const scale = Math.min(260 / W, 220 / H, 260 / D) * 0.85
  const cx=320, cy=300
  function iso(x,y,z){
    return { X: cx + (x - z)*cos30*scale, Y: cy + (x + z)*sin30*scale - y*scale }
  }
  function face(pts, fill, stroke, sw=1, opacity=1, extra={}){
    const d = pts.map((p,i)=> `${i===0?'M':'L'} ${p.X} ${p.Y}`).join(' ') + ' Z'
    const el=g('path',{d,fill,stroke,'stroke-width':sw,opacity,...extra})
    svg.appendChild(el)
    return el
  }

  const exp = exploded ? 14 : 0
  // разнес: полки/рамы выше — смещаем по уровню y
  const all = [...(model.ghosts||[]), ...model.items]
  const sorted = all.slice().sort((a,b)=>{
    const za = (a.z + a.d/2), zb = (b.z + b.d/2)
    if(Math.abs(za-zb) > 1) return zb - za          // дальние (задние) сначала
    if(Math.abs((a.x+a.w/2)-(b.x+b.w/2)) > 1) return (a.x+a.w/2) - (b.x+b.w/2) // левые сначала
    return (a.y+a.h/2) - (b.y+b.h/2)
  })

  const selected = model.items.find(i=> i.key === selectedKey)
  const selIdx = selected ? all.indexOf(selected) : -1

  sorted.forEach(it=>{
    const isSel = it === selected
    const dimmed = selected && !isSel
    const dy = exploded ? -exp * (it.y / Math.max(1,H)) : 0
    const c = isoBoxCorners(iso, it.x, it.y+dy, it.z, it.x+it.w, it.y+it.h+dy, it.z+it.d)
    let topF, rightF, frontF, strokeC, sw
    if(isSel){
      topF='#f2c14e'; rightF='#e0a93a'; frontF='#f7d489'; strokeC='#7c4a03'; sw=2
    }else if(it.metal){
      topF='#dbe2ea'; rightF='#9fb0bf'; frontF='#c3ced9'; strokeC='#475569'; sw=1
    }else if(it.part && it.part.material && it.part.material.includes('ДВП')){
      topF='#e2e8f0'; rightF='#cbd5e1'; frontF='#e8edf2'; strokeC='#94a3b8'; sw=0.8
    }else{
      topF='#fde68a'; rightF='#f2c14e'; frontF='#fef3c7'; strokeC='#a16207'; sw=0.9
    }
    const op = dimmed ? 0.35 : 1
    face(c.front, frontF, strokeC, sw, op, isSel?{class:'hl-pulse'}:{})
    face(c.right, rightF, strokeC, sw, op, isSel?{class:'hl-pulse'}:{})
    face(c.top,   topF,   strokeC, sw, op, isSel?{class:'hl-pulse'}:{})
    if(isSel){
      // контур пунктиром
      const outline = [c.top[1], c.top[2], c.right[3], c.right[2]]
      svg.appendChild(g('path',{d: outline.map((p,i)=>`${i===0?'M':'L'} ${p.X} ${p.Y}`).join(' ') + ' L '+c.front[0].X+' '+c.front[0].Y+' Z', fill:'none', stroke:'#b45309','stroke-width':1.6,'stroke-dasharray':'5 3',class:'hl-pulse'}))
      // подпись
      const mid = iso(it.x + it.w/2, it.y + it.h + dy, it.z + it.d/2)
      const lbl = it.name.length > 26 ? it.name.slice(0,25)+'…' : it.name
      const bw = lbl.length * 6.2 + 14
      svg.appendChild(g('line',{x1:mid.X,y1:mid.Y,x2:mid.X,y2:mid.Y-26,stroke:'#b45309','stroke-width':1,'stroke-dasharray':'3 2'}))
      svg.appendChild(g('rect',{x:mid.X-bw/2,y:mid.Y-44,width:bw,height:20,rx:9,fill:'#1e3a2f',opacity:0.95}))
      const tx=g('text',{x:mid.X,y:mid.Y-30,'text-anchor':'middle','font-size':10,'font-weight':800,fill:'#f2c14e'})
      tx.textContent = lbl
      svg.appendChild(tx)
    }
  })

  // отверстия (крепёж)
  if(showFasteners){
    drawIsoFasteners(svg, g, iso, model.items, selectedKey)
  }
}

// Точки отверстий на видимых гранях (x+, z-, y+)
export function drawIsoFasteners(svg, g, iso, items, selectedKey){
  const visible = f => f==='x+' || f==='z-' || f==='y+'
  items.forEach(it=>{
    const isSel = it.key === selectedKey
    ;(it.worldHoles||[]).forEach(hl=>{
      if(!hl.face || !visible(hl.face)) return
      const p = iso(hl.x, hl.y, hl.z)
      const r = Math.max(2.2, hl.d * 0.16)
      const color = FAST_COLORS[hl.t] || '#0f172a'
      svg.appendChild(g('circle',{cx:p.X,cy:p.Y,r,fill:'none',stroke:color,'stroke-width':isSel?1.8:1.2,opacity:isSel?1:0.85}))
      svg.appendChild(g('circle',{cx:p.X,cy:p.Y,r:0.9,fill:color,opacity:isSel?1:0.85}))
    })
  })
}
const FAST_COLORS = { dowel:'#1e3a2f', minifix:'#dc2626', screw:'#64748b', hinge:'#0284c7', pin:'#d97706', bolt:'#0f172a', selft:'#7c3aed' }

function drawFront(svg, W,H,D,t, parts, params, exploded){
  const svgNS='http://www.w3.org/2000/svg'
  const g=(tag,a={})=>{const e=document.createElementNS(svgNS,tag);for(const k in a)e.setAttribute(k,a[k]);return e}
  const cx=320, cy=250
  const scale = Math.min(380 / W, 340 / H) * 0.9
  // корпус
  const w = W*scale, h = H*scale
  const x = cx - w/2, y = cy - h/2

  // тень
  svg.appendChild(g('rect',{x:x+4,y:y+4,width:w,height:h,rx:4,fill:'#000',opacity:0.06}))

  // боковины
  svg.appendChild(g('rect',{x,y,width:w,height:h,rx:3,fill:'#ffffff',stroke:'#1e3a2f','stroke-width':2.2}))
  // толщина боковин линии
  svg.appendChild(g('rect',{x:x+1,y:y+1,width:t*scale,height:h-2,fill:'#e7e5e4',opacity:0.9}))
  svg.appendChild(g('rect',{x:x+w - t*scale -1,y:y+1,width:t*scale,height:h-2,fill:'#e7e5e4',opacity:0.9}))

  // крыша/дно
  const topY = y + (params.construction==='inset'? 0 : 0)
  const innerW = W - 2*t
  // полки
  const shelves = params.shelves
  if(shelves>0){
    const step = (h - 40) / (shelves+1)
    for(let i=1;i<=shelves;i++){
      const sy = y + step*i
      // полка
      svg.appendChild(g('rect',{x:x + t*scale + 2, y:sy, width: innerW*scale -4, height: t*scale, rx:1, fill:'#f2c14e',stroke:'#a16207','stroke-width':1,opacity:0.95}))
      // пунктир
      svg.appendChild(g('line',{x1:x+8,y1:sy+ t*scale/2,x2:x+w-8,y2:sy+ t*scale/2,stroke:'#fff', 'stroke-width':0.8, 'stroke-dasharray':'4 4',opacity:0.8}))
    }
  }

  // двери
  if(params.doors>0){
    const gap = 3*scale
    const doorW = (w - gap*(params.doors+1))/params.doors
    const doorH = h - gap*2 - (params.base? 80*scale:0)
    const doorY = y + gap
    for(let i=0;i<params.doors;i++){
      const dx = x + gap + i*(doorW+gap)
      // дверь
      const isEven = i%2===0
      svg.appendChild(g('rect',{x:dx,y:doorY,width:doorW,height:doorH,rx:3,fill: isEven? '#1e3a2f':'#2a5a45',stroke:'#0f1e18','stroke-width':1.2}))
      // филенка
      svg.appendChild(g('rect',{x:dx+8,y:doorY+8,width:doorW-16,height:doorH-16,rx:2,fill:'none',stroke:'#f2c14e','stroke-width':1,opacity:0.9}))
      // ручка
      const hx = isEven? dx+doorW-14 : dx+6
      svg.appendChild(g('rect',{x:hx,y:doorY+doorH/2-14,width:4,height:28,rx:2,fill:'#f2c14e',stroke:'#a16207','stroke-width':0.8}))
      // петли
      svg.appendChild(g('circle',{cx:dx+6,cy:doorY+18,r:3,fill:'#cbd5e1',stroke:'#64748b'}))
      svg.appendChild(g('circle',{cx:dx+6,cy:doorY+doorH-18,r:3,fill:'#cbd5e1',stroke:'#64748b'}))
    }
  }

  // ящики
  if(params.drawers>0 && params.doors===0){
    const gap=3*scale
    const drawH = (h - gap*(params.drawers+1) - (params.base?0:0))/params.drawers
    // if doors exist, drawers would be separate; simplify: drawers occupy lower part
    let startY = y + h - drawH*params.drawers - gap*params.drawers
    if(params.doors>0) startY = y + h - drawH*params.drawers - gap*(params.drawers+1)
    for(let i=0;i<params.drawers;i++){
      const dy = startY + i*(drawH+gap)
      const dx = x+ gap
      const dw = w - 2*gap
      svg.appendChild(g('rect',{x:dx,y:dy,width:dw,height:drawH,rx:2,fill:'#f8fafc',stroke:'#1e3a2f','stroke-width':1.2}))
      svg.appendChild(g('rect',{x:dx+2,y:dy+2,width:dw-4,height:drawH-4,rx:1,fill:'#ffffff',stroke:'#e7e5e4'}))
      // ручка
      svg.appendChild(g('rect',{x:cx-16,y:dy+drawH/2-3,width:32,height:6,rx:3,fill:'#1e3a2f'}))
      // направляющие намёк
      svg.appendChild(g('line',{x1:dx+10,y1:dy+drawH-6,x2:dx+dw-10,y2:dy+drawH-6,stroke:'#e7e5e4','stroke-width':1}))
    }
  }

  // цоколь
  if(params.base){
    svg.appendChild(g('rect',{x:x+1,y:y+h-80*scale,width:w-2,height:80*scale,rx:2,fill:'#44403c',stroke:'#1c1917','stroke-width':1,opacity:0.95}))
    svg.appendChild(g('line',{x1:x+20,y1:y+h-80*scale+14,x2:x+w-20,y2:y+h-80*scale+14,stroke:'#f2c14e','stroke-width':1,opacity:0.6}))
  }

  // размеры
  // ширина
  svg.appendChild(g('line',{x1:x,y1:y+h+16,x2:x+w,y2:y+h+16,stroke:'#1e3a2f','stroke-width':1}))
  svg.appendChild(g('line',{x1:x,y1:y+h+12,x2:x,y2:y+h+20,stroke:'#1e3a2f','stroke-width':1}))
  svg.appendChild(g('line',{x1:x+w,y1:y+h+12,x2:x+w,y2:y+h+20,stroke:'#1e3a2f','stroke-width':1}))
  const t1=g('text',{x:cx,y:y+h+28,'text-anchor':'middle','font-size':11,'font-family':'JetBrains Mono, monospace','font-weight':700,fill:'#1e3a2f'})
  t1.textContent = `W ${W}`
  svg.appendChild(t1)
  // высота
  svg.appendChild(g('line',{x1:x+w+16,y1:y,x2:x+w+16,y2:y+h,stroke:'#1e3a2f','stroke-width':1}))
  svg.appendChild(g('line',{x1:x+w+12,y1:y,x2:x+w+20,y2:y,stroke:'#1e3a2f','stroke-width':1}))
  svg.appendChild(g('line',{x1:x+w+12,y1:y+h,x2:x+w+20,y2:y+h,stroke:'#1e3a2f','stroke-width':1}))
  const t2=g('text',{x:x+w+28,y:cy,'text-anchor':'middle','font-size':11,'font-family':'JetBrains Mono, monospace','font-weight':700,fill:'#1e3a2f',transform:`rotate(90 ${x+w+28} ${cy})`})
  t2.textContent=`H ${H}`
  svg.appendChild(t2)

  // глубина намёк
  const dd = g('text',{x:x+w-6,y:y+14,'font-size':8,'font-weight':800,fill:'#fff',opacity:0.9})
  // leave
}

function drawSide(svg, W,H,D,t, parts, params){
  const svgNS='http://www.w3.org/2000/svg'
  const g=(tag,a={})=>{const e=document.createElementNS(svgNS,tag);for(const k in a)e.setAttribute(k,a[k]);return e}
  const cx=320, cy=250
  const scale = Math.min(380 / D, 340 / H) * 0.9
  const w = D*scale, h = H*scale
  const x = cx - w/2, y = cy - h/2
  svg.appendChild(g('rect',{x:x+4,y:y+4,width:w,height:h,rx:4,fill:'#000',opacity:0.06}))
  svg.appendChild(g('rect',{x,y,width:w,height:h,rx:3,fill:'#fff',stroke:'#1e3a2f','stroke-width':2.2}))
  // толщина
  svg.appendChild(g('rect',{x,y,width:w,height:t*scale,fill:'#f2c14e',opacity:0.9}))
  svg.appendChild(g('rect',{x,y:y+h - t*scale,width:w,height:t*scale,fill:'#f2c14e',opacity:0.9}))
  // полки боком
  if(params.shelves>0){
    const step=(h-40)/(params.shelves+1)
    for(let i=1;i<=params.shelves;i++){
      const sy=y+step*i
      svg.appendChild(g('rect',{x:x+2,y:sy,width:w-4,height:t*scale,rx:1,fill:'#e7e5e4',stroke:'#a8a29e'}))
    }
  }
  // задняя стенка
  if(params.rear){
    svg.appendChild(g('rect',{x:x+w-4,y:y+6,width:3,height:h-12,rx:1,fill:'#94a3b8',stroke:'#64748b'}))
  }
  // размеры
  const t1=g('text',{x:cx,y:y+h+28,'text-anchor':'middle','font-size':11,'font-family':'JetBrains Mono, monospace','font-weight':700,fill:'#1e3a2f'})
  t1.textContent=`D ${D}`
  svg.appendChild(t1)
  const t2=g('text',{x:x+w+28,y:cy,'text-anchor':'middle','font-size':11,'font-family':'JetBrains Mono, monospace','font-weight':700,fill:'#1e3a2f',transform:`rotate(90 ${x+w+28} ${cy})`})
  t2.textContent=`H ${H}`
  svg.appendChild(t2)
}

function drawIso(svg, W,H,D,t, parts, params, exploded, model=null, selectedKey=null, showFasteners=false){
  const svgNS='http://www.w3.org/2000/svg'
  const g=(tag,a={})=>{const e=document.createElementNS(svgNS,tag);for(const k in a)e.setAttribute(k,a[k]);return e}

  // изометрическая проекция: используем диметрию 30°
  const scale = Math.min(260 / W, 220 / H, 260 / D) * 0.85
  const cx=320, cy=300

  // углы для изометрии
  const cos30 = Math.cos(30*Math.PI/180) // 0.866
  const sin30 = Math.sin(30*Math.PI/180) // 0.5

  // 3D box corners: (x,y,z) -> (X,Y) iso: X = cx + (x - z)*cos30*scale , Y = cy + (x+z)*sin30*scale - y*scale
  // где x = ширина (W), z = глубина (D), y = высота (H) вверх
  function iso(x,y,z){
    return {
      X: cx + (x - z)*cos30*scale,
      Y: cy + (x + z)*sin30*scale - y*scale
    }
  }

  const exp = exploded ? 18 : 0

  // helper to draw face
  function face(points, fill, stroke, sw=1, opacity=1, key=null){
    const d = points.map((p,i)=> `${i===0?'M':'L'} ${p.X} ${p.Y}`).join(' ') + ' Z'
    const el=g('path',{d,fill,stroke,'stroke-width':sw,opacity})
    if(key){
      el.setAttribute('data-key', key)
      el.setAttribute('class', 'asm-click')
      el.style.cursor='pointer'
    }
    svg.appendChild(el)
    return el
  }

  // корпус box
  // 8 corners
  // bottom: y=0, top: y=H
  const c000 = iso(0,0,0)
  const cW00 = iso(W,0,0)
  const cW0D = iso(W,0,D)
  const c00D = iso(0,0,D)
  const c00H = iso(0,H,0)
  const cW0H = iso(W,H,0)
  const cWHD = iso(W,H,D)
  const c0HD = iso(0,H,D)

  // exploded shift: смещаем верхнюю часть вверх
  if(exploded){
    // shift top face up
    c00H.Y -= exp
    cW0H.Y -= exp
    cWHD.Y -= exp
    c0HD.Y -= exp
  }

  // тень на полу
  const shadow = [c000, cW00, cW0D, c00D]
  face(shadow, '#000', 'none',0,0.06)

  // порядок отрисовки: задние грани, затем передние

  // нижняя грань (дно)
  face([c000,cW00,cW0D,c00D], '#f1f5f9','#cbd5e1',1)

  // задняя стенка
  if(params.rear){
    face([c00D,cW0D,cWHD,c0HD], '#e2e8f0','#94a3b8',1.2, 1, 'rear')
    // крепёж задней
    svg.appendChild(g('circle',{cx: (c00D.X + c0HD.X)/2, cy:(c00D.Y + c0HD.Y)/2, r:2, fill:'#64748b'}))
  }

  // левая боковина
  face([c000,c00D,c0HD,c00H], '#ffffff','#1e3a2f',1.8, 1, 'side-L')
  // толщина кромки левой
  // правая боковина
  face([cW00,cW0D,cWHD,cW0H], '#e7e5e4','#1e3a2f',1.8, 1, 'side-R')
  // передняя?? Actually боковины уже есть

  // крыша
  face([c00H,cW0H,cWHD,c0HD], '#f2c14e','#a16207',1.4, 1, 'top')
  // фаска крыши
  face([c00H,cW0H,cW00,c000], '#fef9e7','#a16207',1) // no, this is front face

  // front face (фасад)
  const front = [c000,cW00,cW0H,c00H]
  face(front, 'rgba(255,255,255,0.0)','#1e3a2f',2.2)

  // полки внутри (3 линии)
  if(params.shelves>0){
    const step = H/(params.shelves+1)
    for(let i=1;i<=params.shelves;i++){
      const y = step*i
      const p1 = iso(t, y, 4)
      const p2 = iso(W-t, y, 4)
      const p3 = iso(W-t, y, D-12)
      const p4 = iso(t, y, D-12)
      if(exploded){ p1.Y-=exp*0.2*i; p2.Y-=exp*0.2*i; p3.Y-=exp*0.2*i; p4.Y-=exp*0.2*i }
      face([p1,p2,p3,p4], '#fde68a','#a16207',1,0.95, `shelf-${i}`)
      // торец полки
      const p1b = iso(t, y-t, 4)
      const p2b = iso(W-t, y-t, 4)
      face([p1,p2,p2b,p1b], '#facc15','#a16207',0.8,1, `shelf-${i}`)
    }
  }

  // двери
  if(params.doors>0){
    const gap = 3
    const doorW = (W - gap*(params.doors+1))/params.doors
    const doorH = H - gap*2 - (params.base?80:0)
    const doorY0 = gap + (params.base?0:0)
    for(let i=0;i<params.doors;i++){
      const x0 = gap + i*(doorW+gap)
      const x1 = x0 + doorW
      const y0 = doorY0
      const y1 = doorY0 + doorH
      // door as front face slightly offset outward
      const off = 6
      const dA = iso(x0, y0, -off)
      const dB = iso(x1, y0, -off)
      const dC = iso(x1, y1, -off)
      const dD = iso(x0, y1, -off)
      if(exploded){ dA.X -= exp*0.6*(i - params.doors/2); dB.X -= exp*0.6*(i - params.doors/2); dC.X -= exp*0.6*(i - params.doors/2); dD.X -= exp*0.6*(i - params.doors/2); dA.Y-=exp*0.3; dB.Y-=exp*0.3; dC.Y-=exp*0.3; dD.Y-=exp*0.3 }
      const col = i%2===0 ? '#1e3a2f' : '#2a5a45'
      face([dA,dB,dC,dD], col,'#0f1e18',1.2, 1, `door-${i}`)
      // inset
      const inset=14
      const iA = iso(x0+inset, y0+inset, -off-0.5)
      const iB = iso(x1-inset, y0+inset, -off-0.5)
      const iC = iso(x1-inset, y1-inset, -off-0.5)
      const iD = iso(x0+inset, y1-inset, -off-0.5)
      if(exploded){ iA.X-=exp*0.6*(i - params.doors/2); iB.X-=exp*0.6*(i - params.doors/2); iC.X-=exp*0.6*(i - params.doors/2); iD.X-=exp*0.6*(i - params.doors/2); iA.Y-=exp*0.3; iB.Y-=exp*0.3; iC.Y-=exp*0.3; iD.Y-=exp*0.3 }
      face([iA,iB,iC,iD], 'none','#f2c14e',1.2)
      // ручка
      const hx = i%2===0 ? x1-8 : x0+4
      const hy = (y0+y1)/2
      const h1 = iso(hx, hy-14, -off-1)
      const h2 = iso(hx+3, hy-14, -off-1)
      const h3 = iso(hx+3, hy+14, -off-1)
      const h4 = iso(hx, hy+14, -off-1)
      if(exploded){ h1.X-=exp*0.6*(i - params.doors/2); h2.X-=exp*0.6*(i - params.doors/2); h3.X-=exp*0.6*(i - params.doors/2); h4.X-=exp*0.6*(i - params.doors/2); h1.Y-=exp*0.3; h2.Y-=exp*0.3; h3.Y-=exp*0.3; h4.Y-=exp*0.3}
      face([h1,h2,h3,h4], '#f2c14e','#a16207',0.8)
    }
  }

  // ящики
  if(params.drawers>0){
    const fH = (H - (params.doors>0? H*0.5:0) - (params.drawers+1)*3)/params.drawers
    const yStart = H - fH*params.drawers -3*params.drawers
    for(let i=0;i<params.drawers;i++){
      const y0 = yStart + i*(fH+3)
      const y1 = y0+fH
      const off=6
      const dA=iso(3,y0,-off), dB=iso(W-3,y0,-off), dC=iso(W-3,y1,-off), dD=iso(3,y1,-off)
      if(exploded){ dA.X-=exp*0.2; dB.X+=exp*0.2; dC.X+=exp*0.2; dD.X-=exp*0.2; dA.Y-=exp*0.2*i; dB.Y-=exp*0.2*i; dC.Y-=exp*0.2*i; dD.Y-=exp*0.2*i}
      face([dA,dB,dC,dD], '#ffffff','#1e3a2f',1.2)
      // handle
      const hx=W/2, hy=(y0+y1)/2
      const h1=iso(hx-16,hy-2,-off-1), h2=iso(hx+16,hy-2,-off-1), h3=iso(hx+16,hy+2,-off-1), h4=iso(hx-16,hy+2,-off-1)
      if(exploded){ h1.Y-=exp*0.2*i; h2.Y-=exp*0.2*i; h3.Y-=exp*0.2*i; h4.Y-=exp*0.2*i}
      face([h1,h2,h3,h4], '#1e3a2f','none',0)
    }
  }

  // цоколь
  if(params.base){
    const bh=80
    const bA=iso(0,bh,0), bB=iso(W,bh,0), bC=iso(W,0,0), bD=iso(0,0,0)
    face([bA,bB,bC,bD], '#44403c','#1c1917',1, 1, 'base')
    const b2A=iso(0,bh,D), b2B=iso(W,bh,D), b2C=iso(W,0,D), b2D=iso(0,0,D)
    face([bA,bB,b2B,b2A], '#57534e','#1c1917',1, 1, 'base')
  }

  // купные металлические ножки (призрак — не деталь раскроя)
  if(model && model.ghosts && model.ghosts.length){
    model.ghosts.forEach(it=>{
      const c = isoBoxCorners(iso, it.x, it.y, it.z, it.x+it.w, it.y+it.h, it.z+it.d)
      face([c.front[0],c.front[1],c.front[2],c.front[3]], '#cbd5e1','#64748b',1,0.92)
      face([c.right[0],c.right[1],c.right[2],c.right[3]], '#94a3b8','#64748b',1,0.92)
      face([c.top[0],c.top[1],c.top[2],c.top[3]], '#e2e8f0','#64748b',1,0.92)
    })
  }

  // крепёж (отверстия) — точки на видимых гранях
  if(showFasteners && model){
    drawIsoFasteners(svg, g, iso, model.items, selectedKey)
  }

  // подсветка выбранной детали (позиция в сборке)
  if(selectedKey && model){
    const it = model.items.find(i=> i.key === selectedKey)
      || model.items.find(i=> selectedKey.split('-').slice(0,-1).join('-') && i.key.startsWith(selectedKey + '-'))
    if(it) drawIsoHighlight(svg, g, iso, it)
  }

  // габариты стрелки
  // ширина
  const pW1 = iso(0,0,-28), pW2=iso(W,0,-28)
  svg.appendChild(g('line',{x1:pW1.X,y1:pW1.Y,x2:pW2.X,y2:pW2.Y,stroke:'#1e3a2f','stroke-width':1,'stroke-dasharray':'4 3'}))
  svg.appendChild(g('line',{x1:pW1.X,y1:pW1.Y-6,x2:pW1.X,y2:pW1.Y+6,stroke:'#1e3a2f','stroke-width':1}))
  svg.appendChild(g('line',{x1:pW2.X,y1:pW2.Y-6,x2:pW2.X,y2:pW2.Y+6,stroke:'#1e3a2f','stroke-width':1}))
  const midW = iso(W/2,0,-28)
  const tW=g('text',{x:midW.X,y:midW.Y+16,'text-anchor':'middle','font-size':11,'font-family':'JetBrains Mono, monospace','font-weight':700,fill:'#1e3a2f'})
  tW.textContent=`${W}`
  svg.appendChild(tW)

  // высота
  const pH1=iso(W+28,0,0), pH2=iso(W+28,H,0)
  svg.appendChild(g('line',{x1:pH1.X,y1:pH1.Y,x2:pH2.X,y2:pH2.Y,stroke:'#1e3a2f','stroke-width':1}))
  svg.appendChild(g('line',{x1:pH1.X-6,y1:pH1.Y,x2:pH1.X+6,y2:pH1.Y,stroke:'#1e3a2f','stroke-width':1}))
  svg.appendChild(g('line',{x1:pH2.X-6,y1:pH2.Y,x2:pH2.X+6,y2:pH2.Y,stroke:'#1e3a2f','stroke-width':1}))
  const midH=iso(W+28,H/2,0)
  const tH=g('text',{x:midH.X+14,y:midH.Y+4,'font-size':11,'font-family':'JetBrains Mono, monospace','font-weight':700,fill:'#1e3a2f'})
  tH.textContent=`${H}`
  svg.appendChild(tH)
}

export function drawProjections(container, parts, params){
  container.innerHTML=''
  const views = [
    {id:'front', title:'Вид спереди (фасад)', dims:`${params.W} × ${params.H}`},
    {id:'top', title:'Вид сверху', dims:`${params.W} × ${params.D}`},
    {id:'side', title:'Вид сбоку (левый)', dims:`${params.D} × ${params.H}`},
    {id:'rear', title:'Развёртка / задняя', dims:`${params.W} × ${params.H}`},
  ]
  views.forEach(v=>{
    const card=document.createElement('div')
    card.className='proj-card'
    card.innerHTML=`<div class="proj-header"><span class="proj-title">${v.title}</span><span class="proj-dims">${v.dims}</span></div><div class="proj-body" id="proj-${v.id}"></div>`
    container.appendChild(card)
  })
  // render each
  drawProjectionSVG(document.getElementById('proj-front'), params, 'front')
  drawProjectionSVG(document.getElementById('proj-top'), params, 'top')
  drawProjectionSVG(document.getElementById('proj-side'), params, 'side')
  drawProjectionSVG(document.getElementById('proj-rear'), params, 'rear')
}

function drawProjectionSVG(el, params, view){
  if(!el) return
  const W=params.W, H=params.H, D=params.D, t=params.t, gap=params.gapFacade
  const svgNS='http://www.w3.org/2000/svg'
  const svg=document.createElementNS(svgNS,'svg')
  svg.setAttribute('viewBox','0 0 300 220')
  svg.style.width='100%'
  svg.style.height='auto'
  const g=(tag,a={})=>{const e=document.createElementNS(svgNS,tag);for(const k in a)e.setAttribute(k,a[k]);return e}

  svg.appendChild(g('rect',{x:0,y:0,width:300,height:220,rx:10,fill:'#fafaf9',stroke:'#e7e5e4'}))

  if(view==='front'){
    const scale=Math.min(220 / W, 160 / H)*0.9
    const w=W*scale, h=H*scale
    const x=150 - w/2, y=110 - h/2
    svg.appendChild(g('rect',{x,y,width:w,height:h,rx:2,fill:'#fff',stroke:'#1e3a2f','stroke-width':1.6}))
    // internal lines
    svg.appendChild(g('rect',{x:x+1,y:y+1,width:t*scale,height:h-2,fill:'#f1f5f9',stroke:'#cbd5e1'}))
    svg.appendChild(g('rect',{x:x+w - t*scale -1,y:y+1,width:t*scale,height:h-2,fill:'#f1f5f9',stroke:'#cbd5e1'}))
    if(params.shelves>0){
      const step=(h-10)/(params.shelves+1)
      for(let i=1;i<=params.shelves;i++){
        const sy=y+step*i
        svg.appendChild(g('line',{x1:x+t*scale,y1:sy,x2:x+w - t*scale,y2:sy,stroke:'#a16207','stroke-width':1, 'stroke-dasharray':'4 2'}))
        svg.appendChild(g('rect',{x:x+t*scale,y:sy,width:w-2*t*scale,height:3,fill:'#f2c14e',opacity:0.9,rx:1}))
      }
    }
    if(params.doors>0){
      const dw=(w - gap*scale*(params.doors+1))/params.doors
      for(let i=0;i<params.doors;i++){
        const dx=x+ gap*scale + i*(dw+gap*scale)
        svg.appendChild(g('rect',{x:dx,y:y+4,width:dw,height:h-8,rx:2,fill: i%2? '#1e3a2f':'#2a5a45',stroke:'#0f172a',opacity:0.95}))
        svg.appendChild(g('rect',{x:dx+6,y:y+10,width:dw-12,height:h-20,rx:1,fill:'none',stroke:'#f2c14e','stroke-width':0.7}))
      }
    }
    if(params.drawers>0){
      const dh=(h-20)/Math.max(params.drawers,1)
      for(let i=0;i<params.drawers;i++){
        const dy=y+h - (i+1)*dh
        svg.appendChild(g('rect',{x:x+4,y:dy,width:w-8,height:dh-4,rx:2,fill:'#fff',stroke:'#1e3a2f'}))
      }
    }
    // dims
    const tx=g('text',{x:150,y:y+h+14,'text-anchor':'middle','font-size':8,'font-family':'JetBrains Mono, monospace',fill:'#64748b'})
    tx.textContent=`${W} мм`
    svg.appendChild(tx)
  }else if(view==='top'){
    const scale=Math.min(220 / W, 140 / D)*0.9
    const w=W*scale, d=D*scale
    const x=150 - w/2, y=110 - d/2
    svg.appendChild(g('rect',{x,y,width:w,height:d,rx:2,fill:'#fff',stroke:'#1e3a2f','stroke-width':1.6}))
    svg.appendChild(g('rect',{x:x+1,y:y+1,width:w-2,height:t*scale,fill:'#f2c14e',opacity:0.9}))
    svg.appendChild(g('rect',{x:x+1,y:y+d - t*scale -1,width:w-2,height:t*scale,fill:'#e7e5e4',opacity:0.7}))
    svg.appendChild(g('rect',{x:x+1,y:y+1,width:t*scale,height:d-2,fill:'#f1f5f9'}))
    svg.appendChild(g('rect',{x:x+w - t*scale -1,y:y+1,width:t*scale,height:d-2,fill:'#f1f5f9'}))
    // shelves dashed
    if(params.shelves>0){
      for(let i=0;i<params.shelves;i++){
        // not visible from top maybe line
      }
    }
    const tx=g('text',{x:150,y:y+d+14,'text-anchor':'middle','font-size':8,'font-family':'JetBrains Mono, monospace',fill:'#64748b'})
    tx.textContent=`${W} × ${D}`
    svg.appendChild(tx)
  }else if(view==='side'){
    const scale=Math.min(220 / D, 160 / H)*0.9
    const d=D*scale, h=H*scale
    const x=150 - d/2, y=110 - h/2
    svg.appendChild(g('rect',{x,y,width:d,height:h,rx:2,fill:'#fff',stroke:'#1e3a2f','stroke-width':1.6}))
    svg.appendChild(g('rect',{x:x+1,y:y+1,width:d-2,height:t*scale,fill:'#f2c14e'}))
    svg.appendChild(g('rect',{x:x+1,y:y+h - t*scale -1,width:d-2,height:t*scale,fill:'#e7e5e4'}))
    if(params.shelves>0){
      const step=(h-10)/(params.shelves+1)
      for(let i=1;i<=params.shelves;i++){
        const sy=y+step*i
        svg.appendChild(g('line',{x1:x,y1:sy,x2:x+d,y2:sy,stroke:'#a16207','stroke-width':1,'stroke-dasharray':'4 2'}))
      }
    }
    const tx=g('text',{x:150,y:y+h+14,'text-anchor':'middle','font-size':8,'font-family':'JetBrains Mono, monospace',fill:'#64748b'})
    tx.textContent=`${D} мм`
    svg.appendChild(tx)
  }else if(view==='rear'){
    const scale=Math.min(220 / W, 160 / H)*0.9
    const w=W*scale, h=H*scale
    const x=150 - w/2, y=110 - h/2
    svg.appendChild(g('rect',{x,y,width:w,height:h,rx:2,fill:'#f1f5f9',stroke:'#64748b','stroke-width':1.2,'stroke-dasharray':'6 4'}))
    // ДВП штриховка
    for(let i=0;i<w;i+=10){
      svg.appendChild(g('line',{x1:x+i,y1:y,x2:x+i - h*0.3,y2:y+h,stroke:'#cbd5e1','stroke-width':0.6,opacity:0.6}))
    }
    svg.appendChild(g('text',{x:150,y:y+h/2,'text-anchor':'middle','font-size':9,'font-weight':800,fill:'#475569'}).appendChild(document.createTextNode(params.rear?'ДВП 3.2 • накладная':'Без задней • 2 царги')) && g('text',{x:150,y:y+h/2,'text-anchor':'middle','font-size':9,'font-weight':800,fill:'#475569'}))
    // fix text
    const t=g('text',{x:150,y:y+h/2,'text-anchor':'middle','font-size':9,'font-weight':800,fill:'#475569'})
    t.textContent = params.rear? 'ДВП 3.2 • накладная' : 'Без задней • 2 царги'
    svg.appendChild(t)
    const sub=g('text',{x:150,y:y+h/2+12,'text-anchor':'middle','font-size':7,'font-family':'JetBrains Mono, monospace',fill:'#64748b'})
    sub.textContent = `${W-4} × ${H-4} мм`
    svg.appendChild(sub)
  }

  el.appendChild(svg)
}

export function drawPartSketch(container, part){
  const svgNS='http://www.w3.org/2000/svg'
  const svg=document.createElementNS(svgNS,'svg')
  // metal-профиль: рисуем полосу «длина × фаска»
  const isMetal = part.kind === 'metal'
  const hEff = isMetal ? 20 : part.h
  // viewBox adapts to part ratio
  const maxW = Math.max(part.w, hEff)
  const scale = isMetal ? Math.min(180 / part.w, 1.4) : Math.min(180 / part.w, 110 / hEff) * 0.9
  const w = part.w * scale
  const h = hEff * scale
  const pad = 24
  const vbW = w + pad*2
  const vbH = h + pad*2 + 20
  svg.setAttribute('viewBox',`0 0 ${vbW} ${vbH}`)
  svg.style.width='100%'
  svg.style.height='auto'
  const g=(tag,a={})=>{const e=document.createElementNS(svgNS,tag);for(const k in a)e.setAttribute(k,a[k]);return e}
  svg.appendChild(g('rect',{x:0,y:0,width:vbW,height:vbH,rx:10,fill:'#fafaf9',stroke:'#e7e5e4'}))
  const x = pad, y = pad
  // shadow
  svg.appendChild(g('rect',{x:x+2,y:y+2,width:w,height:h,rx:3,fill:'#000',opacity:0.05}))
  // part
  svg.appendChild(g('rect',{x,y,width:w,height:h,rx:2,fill:'#fff',stroke:'#1e3a2f','stroke-width':1.4}))
  // wood texture lines
  for(let i=0;i<h;i+=12){
    svg.appendChild(g('line',{x1:x,y1:y+i,x2:x+w,y2:y+i,stroke:'#f1f5f9','stroke-width':0.7,opacity:0.9}))
  }
  // edge highlight (кромка)
  if(part.edge && part.edge!=='-' && part.edge.includes('перед')){
    svg.appendChild(g('rect',{x,y,width:w,height:3,fill:'#f2c14e',stroke:'#a16207','stroke-width':0.6,rx:1}))
  }
  if(part.edge && part.edge.includes('по периметру')){
    svg.appendChild(g('rect',{x,y,width:w,height:h,rx:2,fill:'none',stroke:'#f2c14e','stroke-width':2,opacity:0.9}))
  }
  if(part.edge && part.edge.includes('2 длинных')){
    svg.appendChild(g('rect',{x,y,width:3,height:h,fill:'#f2c14e',stroke:'#a16207'}))
    svg.appendChild(g('rect',{x:x+w-3,y,width:3,height:h,fill:'#f2c14e',stroke:'#a16207'}))
  }

  // dims
  const tW=g('text',{x:x+w/2,y:y+h+14,'text-anchor':'middle','font-size':8,'font-family':'JetBrains Mono, monospace','font-weight':700,fill:'#1e3a2f'})
  tW.textContent = isMetal ? `${part.w} мм` : `${part.w}`
  svg.appendChild(tW)
  if(!isMetal){
    const tH=g('text',{x:x+w+8,y:y+h/2,'text-anchor':'middle','font-size':8,'font-family':'JetBrains Mono, monospace','font-weight':700,fill:'#1e3a2f',transform:`rotate(90 ${x+w+8} ${y+h/2})`})
    tH.textContent=`${part.h}`
    svg.appendChild(tH)
  }

  // thickness badge
  const badgeW= isMetal ? 64 : 46, badgeH=14
  svg.appendChild(g('rect',{x:x+w - badgeW,y:y-8,width:badgeW,height:badgeH,rx:7,fill:'#1e3a2f'}))
  const tb=g('text',{x:x+w - badgeW/2,y:y+3,'text-anchor':'middle','font-size':7,'font-weight':800,fill:'#f2c14e'})
  tb.textContent= isMetal ? `профиль ${part.section||''}` : `${part.thickness} мм`
  svg.appendChild(tb)

  container.appendChild(svg)
}

export function drawCuttingSheet(container, sheet, sheetW, sheetH){
  const svgNS='http://www.w3.org/2000/svg'
  const scale = Math.min(600 / sheetW, 380 / sheetH) * 0.92
  const w = sheetW*scale
  const h = sheetH*scale
  const pad = 20
  const vbW = w + pad*2
  const vbH = h + pad*2 + 24
  const svg=document.createElementNS(svgNS,'svg')
  svg.setAttribute('viewBox',`0 0 ${vbW} ${vbH}`)
  svg.style.width='100%'
  svg.style.height='auto'
  svg.style.background='#fff'
  const g=(tag,a={})=>{const e=document.createElementNS(svgNS,tag);for(const k in a)e.setAttribute(k,a[k]);return e}

  svg.appendChild(g('rect',{x:0,y:0,width:vbW,height:vbH,rx:12,fill:'#ffffff',stroke:'#e7e5e4'}))
  // sheet outline
  svg.appendChild(g('rect',{x:pad,y:pad,width:w,height:h,rx:4,fill:'#f8fafc',stroke:'#1e3a2f','stroke-width':2}))
  // grid 100mm
  for(let x=0;x<sheetW;x+=100){
    const xx = pad + x*scale
    svg.appendChild(g('line',{x1:xx,y1:pad,x2:xx,y2:pad+h,stroke:'#f1f5f9','stroke-width':0.6}))
  }
  for(let y=0;y<sheetH;y+=100){
    const yy=pad + y*scale
    svg.appendChild(g('line',{x1:pad,y1:yy,x2:pad+w,y2:yy,stroke:'#f1f5f9','stroke-width':0.6}))
  }

  // colors palette
  const colors=['#f2c14e','#86efac','#93c5fd','#fca5a5','#c4b5fd','#fdba74','#6ee7b7','#f9a8d4']
  let colorIdx=0
  const colorMap=new Map()

  sheet.items.forEach((it, idx)=>{
    const color = colorMap.get(it.name) || colors[colorIdx % colors.length]
    if(!colorMap.has(it.name)){ colorMap.set(it.name,color); colorIdx++ }
    const x = pad + it.x*scale
    const y = pad + it.y*scale
    const ww = it.w*scale
    const hh = it.h*scale
    // part rect
    svg.appendChild(g('rect',{x,y,width:ww,height:hh,rx:2,fill:color,stroke:'#1e3a2f','stroke-width':1.1,opacity:0.92}))
    // hatch for rotated
    if(it.rotated){
      svg.appendChild(g('line',{x1:x,y1:y,x2:x+ww,y2:y+hh,stroke:'#000','stroke-width':0.6,opacity:0.18}))
      svg.appendChild(g('line',{x1:x+ww,y1:y,x2:x,y2:y+hh,stroke:'#000','stroke-width':0.6,opacity:0.18}))
    }
    // label
    if(ww>36 && hh>18){
      const tx=g('text',{x:x+ww/2,y:y+hh/2 -4,'text-anchor':'middle','font-size':7,'font-weight':800,fill:'#0f172a'})
      // split label
      const short = it.name.replace(' накладная','').replace(' фронтальный','')
      tx.textContent = short.length>18 ? short.slice(0,18) : short
      svg.appendChild(tx)
      const td=g('text',{x:x+ww/2,y:y+hh/2+7,'text-anchor':'middle','font-size':6,'font-family':'JetBrains Mono, monospace','font-weight':700,fill:'#1e293b'})
      td.textContent = `${it.origW||it.w}×${it.origH||it.h}`
      svg.appendChild(td)
    }else if(ww>22 && hh>10){
      const td=g('text',{x:x+ww/2,y:y+hh/2+2,'text-anchor':'middle','font-size':5,'font-family':'JetBrains Mono, monospace','font-weight':700,fill:'#1e293b'})
      td.textContent = `${it.origW||it.w}`
      svg.appendChild(td)
    }
    // kerf dashed border (рез)
    svg.appendChild(g('rect',{x,y,width:ww,height:hh,rx:1,fill:'none',stroke:'#ef4444','stroke-width':0.7,'stroke-dasharray':'4 2',opacity:0.5}))
  })

  // dimensions outside
  const tW=g('text',{x:pad + w/2,y:pad+h+16,'text-anchor':'middle','font-size':8,'font-family':'JetBrains Mono, monospace','font-weight':700,fill:'#1e3a2f'})
  tW.textContent=`${sheetW} мм`
  svg.appendChild(tW)
  const tH=g('text',{x:pad+w+10,y:pad+h/2,'text-anchor':'middle','font-size':8,'font-family':'JetBrains Mono, monospace','font-weight':700,fill:'#1e3a2f',transform:`rotate(90 ${pad+w+10} ${pad+h/2})`})
  tH.textContent=`${sheetH} мм`
  svg.appendChild(tH)

  // efficiency badge
  const eff = sheet.efficiency.toFixed(1)
  svg.appendChild(g('rect',{x:pad+6,y:pad+6,width:72,height:18,rx:9,fill: eff>75 ? '#1e3a2f' : eff>60 ? '#a16207' : '#991b1b'}))
  const te=g('text',{x:pad+42,y:pad+18,'text-anchor':'middle','font-size':8,'font-weight':800,fill:'#fff'})
  te.textContent=`${eff}% занято`
  svg.appendChild(te)

  container.appendChild(svg)
}

// ==================== Подсветка выбранной детали в изометрии ====================
function drawIsoHighlight(svg, g, iso, item){
  const c = isoBoxCorners(iso, item.x, item.y, item.z, item.x+item.w, item.y+item.h, item.z+item.d)
  const accent = 'rgba(242,193,78,.4)'
  ;[c.front, c.right, c.top].forEach(f=>{
    const d = f.map((p,i)=> `${i===0?'M':'L'} ${p.X} ${p.Y}`).join(' ') + ' Z'
    svg.appendChild(g('path',{d, fill:accent, stroke:'#b45309','stroke-width':2,'stroke-dasharray':'6 3', class:'hl-pulse'}))
  })
  // подпись
  const mid = iso(item.x + item.w/2, item.y + item.h, item.z + item.d/2)
  const dims = item.metal ? `${Math.round(item.plateW)} мм • ${item.section||''}` : `${Math.round(item.plateW)} × ${Math.round(item.plateH)} × ${item.thick}`
  const lbl = `${item.name} • ${dims}`
  const bw = lbl.length * 6 + 16
  const bx = Math.max(8, Math.min(640 - bw - 8, mid.X - bw/2))
  const by = Math.max(40, mid.Y - 56)
  svg.appendChild(g('line',{x1:mid.X,y1:mid.Y,x2:mid.X,y2:by+20,stroke:'#b45309','stroke-width':1,'stroke-dasharray':'3 2'}))
  svg.appendChild(g('rect',{x:bx,y:by,width:bw,height:20,rx:9,fill:'#1e3a2f',opacity:0.96}))
  const tx=g('text',{x:bx+bw/2,y:by+13,'text-anchor':'middle','font-size':10,'font-weight':800,fill:'#f2c14e'})
  tx.textContent = lbl
  svg.appendChild(tx)
}

// ==================== Развёртка детали с разметкой отверстий ====================
const HOLE_STYLE = {
  dowel:   { fill:'#1e3a2f', stroke:'#1e3a2f' },
  minifix: { fill:'none',    stroke:'#dc2626' },
  screw:   { fill:'#ffffff', stroke:'#64748b' },
  hinge:   { fill:'#e0f2fe', stroke:'#0284c7' },
  pin:     { fill:'#d97706', stroke:'#d97706' },
  bolt:    { fill:'#0f172a', stroke:'#0f172a' },
  selft:   { fill:'#ffffff', stroke:'#7c3aed' },
}

/**
 * item — из buildLayout()
 * Рисует основную грань + торцевые «полоски» (развёртка) с отверстиями и размерами.
 */
export function drawPartFlat(container, item, params){
  const svgNS='http://www.w3.org/2000/svg'
  const svg=document.createElementNS(svgNS,'svg')
  const g=(tag,a={})=>{const e=document.createElementNS(svgNS,tag);for(const k in a)e.setAttribute(k,a[k]);return e}
  const PW = Math.max(1, item.plateW), PH = Math.max(1, item.plateH), T = Math.max(1, item.thick)
  const isMetal = !!item.metal

  const s = Math.min(300 / PW, 190 / PH, 2.2)
  const wS = PW * s, hS = PH * s
  const tS = Math.max(T * s, 10)
  const padL = tS + 34, padR = tS + 40, padT = tS + 16, padB = tS + 30
  const vbW = padL + wS + padR
  const vbH = padT + hS + padB
  svg.setAttribute('viewBox', `0 0 ${vbW} ${vbH}`)
  svg.style.width='100%'
  svg.style.height='auto'
  svg.style.background='#fff'

  svg.appendChild(g('rect',{x:0,y:0,width:vbW,height:vbH,rx:10,fill:'#ffffff',stroke:'#e7e5e4'}))

  const x0 = padL, y0 = padT

  // ---- торцевые полоски ----
  svg.appendChild(g('rect',{x:x0, y:y0-tS, width:wS, height:tS, fill:'#f1f5f9',stroke:'#94a3b8','stroke-width':0.8}))          // top
  svg.appendChild(g('rect',{x:x0, y:y0+hS, width:wS, height:tS, fill:'#f1f5f9',stroke:'#94a3b8','stroke-width':0.8}))          // bottom
  svg.appendChild(g('rect',{x:x0-tS, y:y0, width:tS, height:hS, fill:'#f1f5f9',stroke:'#94a3b8','stroke-width':0.8}))          // left
  svg.appendChild(g('rect',{x:x0+wS, y:y0, width:tS, height:hS, fill:'#f1f5f9',stroke:'#94a3b8','stroke-width':0.8}))          // right
  const stripLabel = (x,y,txt,rot)=>{
    const e=g('text',{x,y,'font-size':6.5,'font-family':'JetBrains Mono, monospace',fill:'#94a3b8','text-anchor':'middle'})
    if(rot) e.setAttribute('transform',`rotate(${rot} ${x} ${y})`)
    e.textContent = txt
    svg.appendChild(e)
  }
  if(wS > 40) stripLabel(x0 + wS/2, y0 - tS + tS/2 + 2, `торец ${T} мм`, 0)
  if(wS > 40) stripLabel(x0 + wS/2, y0 + hS + tS/2 + 2, `торец ${T} мм`, 0)
  if(hS > 40) stripLabel(x0 - tS/2, y0 + hS/2, `${T}`, -90)
  if(hS > 40) stripLabel(x0 + wS + tS/2, y0 + hS/2, `${T}`, 90)

  // ---- основная грань ----
  svg.appendChild(g('rect',{x:x0+2,y:y0+2,width:wS,height:hS,rx:3,fill:'#000',opacity:0.05}))
  svg.appendChild(g('rect',{x:x0,y:y0,width:wS,height:hS,rx:2,fill: isMetal? '#e8edf2':'#fff', stroke:'#1e3a2f','stroke-width':1.5}))
  if(!isMetal){
    // текстура
    for(let i=8;i<hS;i+=14){
      svg.appendChild(g('line',{x1:x0+3,y1:y0+i,x2:x0+wS-3,y2:y0+i,stroke:'#f1f5f9','stroke-width':0.7}))
    }
  }else{
    // металл: центральная линия (ось профиля)
    svg.appendChild(g('line',{x1:x0+4,y1:y0+hS/2,x2:x0+wS-4,y2:y0+hS/2,stroke:'#94a3b8','stroke-width':0.6,'stroke-dasharray':'6 4'}))
  }

  // ---- кромка ----
  const edge = item.part && item.part.edge
  if(edge && edge !== '-'){
    if(edge.includes('по периметру')){
      svg.appendChild(g('rect',{x:x0+1.5,y:y0+1.5,width:wS-3,height:hS-3,rx:2,fill:'none',stroke:'#f2c14e','stroke-width':2.6,opacity:0.95}))
    }else if(edge.includes('перед')){
      svg.appendChild(g('rect',{x:x0,y:y0+hS-3,width:wS,height:3,fill:'#f2c14e',stroke:'#a16207','stroke-width':0.5}))
    }else if(edge.includes('2 длинных')){
      svg.appendChild(g('rect',{x:x0,y:y0,width:3,height:hS,fill:'#f2c14e',stroke:'#a16207','stroke-width':0.5}))
      svg.appendChild(g('rect',{x:x0+wS-3,y:y0,width:3,height:hS,fill:'#f2c14e',stroke:'#a16207','stroke-width':0.5}))
    }
  }

  // ---- координаты отверстий на экране ----
  function holePos(hle){
    if(hle.f === 'M')    return { x: x0 + hle.u * s,          y: y0 + hS - hle.v * s }
    if(hle.f === 'top')  return { x: x0 + hle.u * s,          y: y0 - tS + (hle.v / T) * tS }
    if(hle.f === 'bottom') return { x: x0 + hle.u * s,        y: y0 + hS + (hle.v / T) * tS }
    if(hle.f === 'left') return { x: x0 - tS + (hle.u / T) * tS, y: y0 + hS - hle.v * s }
    if(hle.f === 'right') return { x: x0 + wS + (hle.u / T) * tS, y: y0 + hS - hle.v * s }
    return { x: x0, y: y0 }
  }

  let num = 0
  item.holes.forEach(hle=>{
    num++
    const pos = holePos(hle)
    const st = HOLE_STYLE[hle.t] || HOLE_STYLE.screw
    const r = Math.max(3, hle.d * s * 0.6)
    const cls = g('g',{})
    cls.setAttribute('class','hole-mark')
    if(hle.t === 'minifix'){
      cls.appendChild(g('circle',{cx:pos.x,cy:pos.y,r:r*1.5,fill:'none',stroke:st.stroke,'stroke-width':1.6}))
      cls.appendChild(g('circle',{cx:pos.x,cy:pos.y,r:r*0.55,fill:st.stroke}))
    }else if(hle.t === 'hinge'){
      cls.appendChild(g('circle',{cx:pos.x,cy:pos.y,r:r*1.5,fill:st.fill,stroke:st.stroke,'stroke-width':1.6}))
      cls.appendChild(g('line',{x1:pos.x-r*1.5,y1:pos.y,x2:pos.x+r*1.5,y2:pos.y,stroke:st.stroke,'stroke-width':0.8}))
      cls.appendChild(g('line',{x1:pos.x,y1:pos.y-r*1.5,x2:pos.x,y2:pos.y+r*1.5,stroke:st.stroke,'stroke-width':0.8}))
    }else if(hle.t === 'screw' || hle.t === 'selft'){
      cls.appendChild(g('circle',{cx:pos.x,cy:pos.y,r:r*0.85,fill:st.fill,stroke:st.stroke,'stroke-width':1.2}))
      cls.appendChild(g('line',{x1:pos.x-r*0.55,y1:pos.y,x2:pos.x+r*0.55,y2:pos.y,stroke:st.stroke,'stroke-width':0.9}))
      cls.appendChild(g('line',{x1:pos.x,y1:pos.y-r*0.55,x2:pos.x,y2:pos.y+r*0.55,stroke:st.stroke,'stroke-width':0.9}))
    }else if(hle.t === 'bolt'){
      cls.appendChild(g('circle',{cx:pos.x,cy:pos.y,r,fill:st.fill}))
      cls.appendChild(g('line',{x1:pos.x-r*0.6,y1:pos.y,x2:pos.x+r*0.6,y2:pos.y,stroke:'#fff','stroke-width':1}))
      cls.appendChild(g('line',{x1:pos.x,y1:pos.y-r*0.6,x2:pos.x,y2:pos.y+r*0.6,stroke:'#fff','stroke-width':1}))
    }else if(hle.t === 'dowel'){
      cls.appendChild(g('circle',{cx:pos.x,cy:pos.y,r,fill:st.fill}))
      cls.appendChild(g('circle',{cx:pos.x,cy:pos.y,r:r*0.3,fill:'#fff'}))
    }else{
      cls.appendChild(g('circle',{cx:pos.x,cy:pos.y,r:r*0.8,fill:st.fill}))
    }
    // номер
    const lb = g('text',{x:pos.x + r*1.2 + 3, y:pos.y - r*0.8 - 2,'font-size':7,'font-weight':800,fill:'#0f172a'})
    lb.textContent = num
    cls.appendChild(lb)
    svg.appendChild(cls)
  })

  // ---- размеры ----
  const dim = (x1,y1,x2,y2,txt,off,vertical=false)=>{
    svg.appendChild(g('line',{x1,y1,x2,y2,stroke:'#1e3a2f','stroke-width':0.8}))
    const o = off
    if(!vertical){
      svg.appendChild(g('line',{x1,y1:y1-3,x2:x1,y2:y1+3,stroke:'#1e3a2f','stroke-width':0.8}))
      svg.appendChild(g('line',{x1:x2,y1:y1-3,x2:x2,y2:y1+3,stroke:'#1e3a2f','stroke-width':0.8}))
      const t=g('text',{x:(x1+x2)/2,y:y1+o,'text-anchor':'middle','font-size':8,'font-family':'JetBrains Mono, monospace','font-weight':700,fill:'#1e3a2f'})
      t.textContent = txt
      svg.appendChild(t)
    }else{
      svg.appendChild(g('line',{x1:x1-3,y1,x2:x1+3,y2:y1,stroke:'#1e3a2f','stroke-width':0.8}))
      svg.appendChild(g('line',{x1:x2-3,y1:y2,x2:x2+3,y2,stroke:'#1e3a2f','stroke-width':0.8}))
      const t=g('text',{x:x1+o,y:(y1+y2)/2,'text-anchor':'middle','font-size':8,'font-family':'JetBrains Mono, monospace','font-weight':700,fill:'#1e3a2f',transform:`rotate(90 ${x1+o} ${(y1+y2)/2})`})
      t.textContent = txt
      svg.appendChild(t)
    }
  }
  dim(x0, y0 + hS + tS + 12, x0 + wS, y0 + hS + tS + 12, `${Math.round(PW)} мм`, 10)
  dim(x0 + wS + tS + 12, y0, x0 + wS + tS + 12, y0 + hS, `${Math.round(PH)} мм`, 10, true)

  // ---- сечение профиля (металл) ----
  if(isMetal){
    const sec = (item.section || '40×20').split('×').map(Number)
    const a = sec[0] || 40, b = sec[1] || 20, wall = item.thick
    const ds = 40 / Math.max(a, b)
    const dx = vbW - 66, dy = 12
    svg.appendChild(g('rect',{x:dx,y:dy,width:a*ds,height:b*ds,fill:'#dbe2ea',stroke:'#475569','stroke-width':1.2}))
    svg.appendChild(g('rect',{x:dx+wall*ds,y:dy+wall*ds,width:(a-2*wall)*ds,height:(b-2*wall)*ds,fill:'#fff',stroke:'#475569','stroke-width':0.8}))
    const t1=g('text',{x:dx+a*ds/2,y:dy+b*ds+10,'text-anchor':'middle','font-size':7.5,'font-family':'JetBrains Mono, monospace','font-weight':700,fill:'#1e3a2f'})
    t1.textContent = `сечение ${a}×${b}×${wall}`
    svg.appendChild(t1)
  }else{
    // бейдж толщины
    const bw2 = 52
    svg.appendChild(g('rect',{x:vbW-bw2-8,y:10,width:bw2,height:16,rx:8,fill:'#1e3a2f'}))
    const tb=g('text',{x:vbW-bw2/2-8,y:21,'text-anchor':'middle','font-size':8,'font-weight':800,fill:'#f2c14e'})
    tb.textContent = `${T} мм`
    svg.appendChild(tb)
  }

  // подпись грани
  const cap = g('text',{x:10,y:14,'font-size':8,'font-weight':800,fill:'#64748b','letter-spacing':'0.08em'})
  cap.textContent = isMetal ? 'РАЗВЁРТКА ПРОФИЛЯ • ФАСКА' : 'РАЗВЁРТКА ДЕТАЛИ • ГРАНЬ + ТОРЦЫ'
  svg.appendChild(cap)

  container.appendChild(svg)
}

// ==================== Мини-3D: позиция детали в изделии ====================
export function drawMiniPos(container, item, model, params){
  const svgNS='http://www.w3.org/2000/svg'
  const svg=document.createElementNS(svgNS,'svg')
  const g=(tag,a={})=>{const e=document.createElementNS(svgNS,tag);for(const k in a)e.setAttribute(k,a[k]);return e}
  const W=params.W, H=params.H, D=params.D
  svg.setAttribute('viewBox','0 0 340 260')
  svg.style.width='100%'
  svg.style.height='auto'
  svg.style.background='#fafaf9'

  const cos30 = Math.cos(30*Math.PI/180), sin30 = Math.sin(30*Math.PI/180)
  const scale = Math.min(160 / W, 150 / H, 160 / D) * 0.85
  const cx=170, cy=185
  function iso(x,y,z){
    return { X: cx + (x - z)*cos30*scale, Y: cy + (x + z)*sin30*scale - y*scale }
  }
  function face(pts, fill, stroke, sw=1, opacity=1){
    const d = pts.map((p,i)=> `${i===0?'M':'L'} ${p.X} ${p.Y}`).join(' ') + ' Z'
    svg.appendChild(g('path',{d,fill,stroke,'stroke-width':sw,opacity}))
  }

  const all = [...(model.ghosts||[]), ...model.items]
  const sorted = all.slice().sort((a,b)=>{
    const za = a.z + a.d/2, zb = b.z + b.d/2
    if(Math.abs(za-zb) > 1) return zb - za
    if(Math.abs((a.x+a.w/2)-(b.x+b.w/2)) > 1) return (a.x+a.w/2) - (b.x+b.w/2)
    return (a.y+a.h/2) - (b.y+b.h/2)
  })

  sorted.forEach(it=>{
    const isSel = it === item || it.key === item.key
    const c = isoBoxCorners(iso, it.x, it.y, it.z, it.x+it.w, it.y+it.h, it.z+it.d)
    let topF, rightF, frontF, strokeC, op
    if(isSel){
      topF='#f2c14e'; rightF='#e0a93a'; frontF='#f7d489'; strokeC='#7c4a03'; op=1
    }else if(it.metal){
      topF='#dbe2ea'; rightF='#9fb0bf'; frontF='#c3ced9'; strokeC='#64748b'; op=0.5
    }else if(it.part && it.part.material && it.part.material.includes('ДВП')){
      topF='#e2e8f0'; rightF='#cbd5e1'; frontF='#e8edf2'; strokeC='#94a3b8'; op=0.5
    }else if(it.ghost){
      topF='#e5e7eb'; rightF='#d1d5db'; frontF='#e5e7eb'; strokeC='#9ca3af'; op=0.55
    }else{
      topF='#eef2ee'; rightF='#d8ded9'; frontF='#e9ede9'; strokeC='#94a3b8'; op=0.5
    }
    face(c.front, frontF, strokeC, isSel?1.6:0.7, op)
    face(c.right, rightF, strokeC, isSel?1.6:0.7, op)
    face(c.top,   topF,   strokeC, isSel?1.6:0.7, op)
    if(isSel){
      const mid = iso(it.x + it.w/2, it.y + it.h, it.z + it.d/2)
      const bw2 = Math.min(300, it.name.length * 6.4 + 16)
      svg.appendChild(g('rect',{x:170-bw2/2,y:8,width:bw2,height:18,rx:9,fill:'#1e3a2f',opacity:0.95}))
      const tx=g('text',{x:170,y:20,'text-anchor':'middle','font-size':9.5,'font-weight':800,fill:'#f2c14e'})
      tx.textContent = it.name.length > 34 ? it.name.slice(0,33)+'…' : it.name
      svg.appendChild(tx)
      svg.appendChild(g('line',{x1:mid.X,y1:mid.Y,x2:mid.X,y2:26,stroke:'#b45309','stroke-width':1,'stroke-dasharray':'3 2'}))
    }
  })

  const dt=g('text',{x:10,y:250,'font-size':9,'font-family':'JetBrains Mono, monospace',fill:'#64748b'})
  dt.textContent = `${W} × ${H} × ${D} мм — позиция детали в сборке`
  svg.appendChild(dt)

  container.appendChild(svg)
}
