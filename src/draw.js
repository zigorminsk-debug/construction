/**
 * Отрисовка эскизов — SVG
 * - Изометрия сборки
 * - 4 проекции
 * - Эскиз детали
 * - Карта раскроя
 */

export function drawAssembly(container, parts, params, mode='iso', exploded=false){
  container.innerHTML = ''
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

  if(mode==='front'){
    drawFront(svg, W,H,D,t, parts, params, exploded)
  }else if(mode==='side'){
    drawSide(svg, W,H,D,t, parts, params)
  }else{
    drawIso(svg, W,H,D,t, parts, params, exploded)
  }

  // подпись
  const label = g('text',{x:12,y:18,'font-size':11,'font-weight':800,fill:'#1e3a2f','letter-spacing':'0.06em'})
  label.textContent = mode==='iso' ? 'ИЗОМЕТРИЯ • М 1:10' : mode==='front' ? 'ВИД СПЕРЕДИ • ФАСАД' : 'ВИД СБОКУ'
  svg.appendChild(label)

  const dims = g('text',{x:12,y:34,'font-size':10,'font-family':'JetBrains Mono, monospace',fill:'#64748b'})
  dims.textContent = `${W} × ${H} × ${D} мм  •  ${params.materialLabel} ${t}мм  •  ${parts.length} дет.`
  svg.appendChild(dims)

  container.appendChild(svg)
}

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

function drawIso(svg, W,H,D,t, parts, params, exploded){
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
  function face(points, fill, stroke, sw=1, opacity=1){
    const d = points.map((p,i)=> `${i===0?'M':'L'} ${p.X} ${p.Y}`).join(' ') + ' Z'
    const el=g('path',{d,fill,stroke,'stroke-width':sw,opacity})
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
    face([c00D,cW0D,cWHD,c0HD], '#e2e8f0','#94a3b8',1.2)
    // крепёж задней
    svg.appendChild(g('circle',{cx: (c00D.X + c0HD.X)/2, cy:(c00D.Y + c0HD.Y)/2, r:2, fill:'#64748b'}))
  }

  // левая боковина
  face([c000,c00D,c0HD,c00H], '#ffffff','#1e3a2f',1.8)
  // толщина кромки левой
  // правая боковина
  face([cW00,cW0D,cWHD,cW0H], '#e7e5e4','#1e3a2f',1.8)
  // передняя?? Actually боковины уже есть

  // крыша
  face([c00H,cW0H,cWHD,c0HD], '#f2c14e','#a16207',1.4)
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
      face([p1,p2,p3,p4], '#fde68a','#a16207',1,0.95)
      // торец полки
      const p1b = iso(t, y-t, 4)
      const p2b = iso(W-t, y-t, 4)
      face([p1,p2,p2b,p1b], '#facc15','#a16207',0.8,1)
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
      face([dA,dB,dC,dD], col,'#0f1e18',1.2)
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
    face([bA,bB,bC,bD], '#44403c','#1c1917',1)
    const b2A=iso(0,bh,D), b2B=iso(W,bh,D), b2C=iso(W,0,D), b2D=iso(0,0,D)
    face([bA,bB,b2B,b2A], '#57534e','#1c1917',1)
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
  // viewBox adapts to part ratio
  const maxW = Math.max(part.w, part.h)
  const scale = Math.min(180 / part.w, 110 / part.h) * 0.9
  const w = part.w * scale
  const h = part.h * scale
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
  tW.textContent = `${part.w}`
  svg.appendChild(tW)
  const tH=g('text',{x:x+w+8,y:y+h/2,'text-anchor':'middle','font-size':8,'font-family':'JetBrains Mono, monospace','font-weight':700,fill:'#1e3a2f',transform:`rotate(90 ${x+w+8} ${y+h/2})`})
  tH.textContent=`${part.h}`
  svg.appendChild(tH)

  // thickness badge
  const badgeW=46, badgeH=14
  svg.appendChild(g('rect',{x:x+w - badgeW,y:y-8,width:badgeW,height:badgeH,rx:7,fill:'#1e3a2f'}))
  const tb=g('text',{x:x+w - badgeW/2,y:y+3,'text-anchor':'middle','font-size':7,'font-weight':800,fill:'#f2c14e'})
  tb.textContent=`${part.thickness} мм`
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
