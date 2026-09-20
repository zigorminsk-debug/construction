/**
 * Крепления и раскладка деталей в 3D:
 *  - buildLayout(result, p)  → позиционирование каждой детали (мир. координаты) + отверстия на её гранях
 *  - getJoints — список соединений (какая деталь к какой крепится и чем)
 *
 * Мир. координаты (мм): x — 0..W (лево→право), y — 0..H (низ→верх), z — 0..D (фасад→зад)
 * Отверстие (для развёртки детали):
 *   f = 'M'      — основная грань (plateW × plateH)
 *   f = 'top'    — верхний торец (plateW × t)
 *   f = 'bottom' — нижний торец (plateW × t)
 *   f = 'left'   — левый торец (t × plateH)
 *   f = 'right'  — правый торец (t × plateH)
 *   u, v — мм от левого/нижнего угла грани, d — диаметр, depth — глубина, t — тип крепежа
 * worldHoles — те же отверстия в мир. координатах (для подсветки в 3D)
 */

export const FAST_TYPES = {
  dowel:   { label: 'Шкант Ø8',                     color: '#1e3a2f', icon: '●' },
  minifix: { label: 'Минификс (конфирмат-фиксатор) Ø15', color: '#dc2626', icon: '◎' },
  screw:   { label: 'Саморез мебельный Ø4',         color: '#64748b', icon: '✚' },
  hinge:   { label: 'Конфирмат под петлю 35 мм Ø35', color: '#0284c7', icon: '⊙' },
  pin:     { label: 'Полкодержатель (шкант) Ø5',    color: '#d97706', icon: '•' },
  bolt:    { label: 'Болт M6 (отверстие Ø6.6)',     color: '#0f172a', icon: '⬤' },
  selft:   { label: 'Саморез по металлу Ø4',        color: '#7c3aed', icon: '✚' },
}

const HOLE = (f, u, v, d, depth, t) => ({ f, u, v, d, depth, t })

/**
 * result — результат calculate()
 * p      — нормализованные параметры (нужен p._profile для metal)
 */
export function buildLayout(result, p){
  const items = []
  const ghosts = []
  const joints = []
  const t = p.t
  const W = p.W, Hh = p.H, D = p.D
  const inset = p.construction === 'inset'

  const byName = new Map()
  result.parts.forEach(pt=>{ if(!byName.has(pt.name)) byName.set(pt.name, pt) })

  // поиск детали по имени с учётом вариантов (L/R, стола и т.п.)
  function findPart(...candidates){
    for(const c of candidates){
      if(byName.has(c)) return byName.get(c)
    }
    return null
  }

  // деталь была разрезана под лист (splitMap) — «полная» псевдо-деталь для раскладки
  function findSplitBase(partName){
    const sm = (result.splitMap || {})[partName]
    if(!sm) return null
    const piece = result.parts.find(q=> q.splitInfo && q.splitInfo.baseName === partName)
    if(!piece) return null
    return {
      name: partName, w: sm.origW, h: sm.origH,
      thickness: piece.thickness, material: piece.material, edge: piece.edge || '',
      id: 0, note: piece.note || '', split: sm
    }
  }

  function add(key, partName, x, y, z, w, h, d, opts = {}){
    const part = opts.part || byName.get(partName) || findSplitBase(partName) || { name: partName, w, h, thickness: t, material: '', edge: '' }
    const item = {
      key, partId: part.id ?? 0, name: partName,
      x, y, z, w, h, d,
      group: opts.group || 'корпус',
      metal: !!opts.metal,
      section: opts.section || null,
      part,
      plateW: opts.plateW ?? part.w,
      plateH: opts.plateH ?? part.h,
      thick: opts.thick ?? part.thickness,
      holes: opts.holes || [],
      note: opts.note || part.note || '',
      ghost: !!opts.ghost
    }
    // мир. координаты отверстий (только M-грань, если задан origin)
    item.worldHoles = []
    const mFace = opts.normal ? `${opts.normal}${opts.normalDir > 0 ? '+' : '-'}` : null
    if(opts.origin){
      const [ox, oy, oz] = opts.origin
      for(const hle of item.holes){
        if(hle.f !== 'M') continue
        let wx = ox, wy = oy, wz = oz
        if(opts.uAxis === 'x') wx += hle.u; else if(opts.uAxis === 'y') wy += hle.u; else wz += hle.u
        if(opts.vAxis === 'x') wx += hle.v; else if(opts.vAxis === 'y') wy += hle.v; else wz += hle.v
        item.worldHoles.push({ x: wx, y: wy, z: wz, d: hle.d, t: hle.t, face: mFace })
      }
    }
    if(opts.worldHoles) item.worldHoles.push(...opts.worldHoles)
    ;(opts.ghost ? ghosts : items).push(item)
    return item
  }
  function joint(label, a, b, fasteners, note){
    joints.push({ label, a, b, fasteners, note })
  }

  // ================= ШКАФ / ТУМБА / СТОЙКА / ПОЛКА-КОРОБ =================
  function cabinetLike(type){
    const isTumba = type === 'tumba'
    const Hc = isTumba ? Math.min(p.H, 900) : p.H
    const baseHc = (type === 'shkaf' && p.base) ? 80 : (isTumba && p.base) ? 60 : 0
    const sideH = inset ? Hc : Hc - 2*t
    const sideY = inset ? 0 : t
    const innerW = W - 2*t

    // позиции полок (y их нижнего торца)
    const shelfYs = []
    for(let i = 1; i <= p.shelves; i++){
      shelfYs.push(sideY + 2*t + (Hc - 4*t) * i / (p.shelves + 1))
    }
    const sections = p.partitions + 1
    const shelfW = sections > 1 ? Math.floor((innerW - p.partitions * t) / sections) - 2 : innerW - 4
    const shelfH = D - p.shelfInset - (p.rear ? 4 : 0)

    // ---- Боковины (M = внутренняя грань D×sideH; u вдоль D от фасада, v вверх от низа) ----
    const mkSideHoles = ()=>{
      const holes = []
      if(inset){
        holes.push(HOLE('M', 30, sideH - 35, 8, 40, 'dowel'), HOLE('M', D - 30, sideH - 35, 8, 40, 'dowel'))
        holes.push(HOLE('M', 30, 35, 8, 40, 'dowel'), HOLE('M', D - 30, 35, 8, 40, 'dowel'))
      }else{
        holes.push(HOLE('top', 30, t / 2, 8, 30, 'dowel'), HOLE('top', D - 30, t / 2, 8, 30, 'dowel'))
      }
      if(baseHc){
        holes.push(HOLE('M', 30, 40, 4, 30, 'screw'), HOLE('M', D - 30, 40, 4, 30, 'screw'))
      }
      // каркас из профтрубы: болты M6 в стойки (фронт + бэк), 30 мм от пола/потолка
      if(p.metalFrame){
        const ph = p._frameProfile.b, pwf = p._frameProfile.a
        ;[30, sideH - 30].forEach(v=>{
          holes.push(HOLE('M', ph / 2, v, 6.6, pwf, 'bolt'), HOLE('M', D - ph / 2, v, 6.6, pwf, 'bolt'))
        })
      }
      // под полки
      shelfYs.forEach(sy=>{
        if(p.shelfMount === 'inner'){
          holes.push(HOLE('M', 40, Math.round(sy + t / 2), 8, 30, 'dowel'))
        }else{
          [40, Math.round(D / 2), D - 40].forEach(u=> holes.push(HOLE('M', u, Math.round(sy - 2), 5, 60, 'pin')))
        }
      })
      return holes
    }
    const sideName = type === 'stoyka' ? 'Стойка' : 'Боковина'
    add('side-L', `${sideName} левая`, 0, sideY, 0, t, sideH, D, {
      group: 'корпус', holes: mkSideHoles(),
      normal: 'x', normalDir: 1, uAxis: 'z', vAxis: 'y', origin: [t, sideY, 0]
    })
    add('side-R', `${sideName} правая`, W - t, sideY, 0, t, sideH, D, {
      group: 'корпус', holes: mkSideHoles(),
      normal: 'x', normalDir: -1, uAxis: 'z', vAxis: 'y', origin: [W - t, sideY, 0]
    })

    // ---- Полки (M = верхняя грань w×h; u вдоль X, v вдоль Z от фасада) ----
    for(let i=0;i<p.shelves;i++){
      const y0 = Math.round(shelfYs[i])
      const mk = (x0, nm, key)=>{
        add(key, nm, x0, y0, p.shelfInset, shelfW, t, shelfH, {
          group: 'наполнение',
          holes: p.shelfMount === 'inner'
            ? [HOLE('left', t / 2, 40, 15, 45, 'minifix'), HOLE('right', t / 2, 40, 15, 45, 'minifix')]
            : [],
          note: p.shelfMount === 'inner' ? 'минификс + шкант Ø8×30 в боковине, 40 мм от фасада' : 'опирается на полкодержатели Ø5',
          normal: 'y', normalDir: 1, uAxis: 'x', vAxis: 'z', origin: [x0, y0 + t, p.shelfInset]
        })
      }
      if(sections > 1){
        for(let s = 0; s < sections; s++){
          const x0 = t + s * (shelfW + t)
          mk(x0, `Полка ${i + 1}.${s + 1}`, `shelf-${i}-${s}`)
        }
      }else{
        mk(t, `Полка ${i + 1}`, `shelf-${i}`)
      }
    }

    // ---- Крыша / дно (M = верхняя/нижняя грань; u вдоль X, v вдоль Z от фасада) ----
    const topW = inset ? innerW : W
    const topX = inset ? t : 0
    const insetJointHoles = ()=> [
      HOLE('left', t / 2, 30, 8, 40, 'dowel'), HOLE('left', t / 2, D - 30, 8, 40, 'dowel'),
      HOLE('right', t / 2, 30, 8, 40, 'dowel'), HOLE('right', t / 2, D - 30, 8, 40, 'dowel')
    ]
    const overlayJointHoles = ()=> [
      HOLE('M', t / 2, 30, 4, 40, 'screw'), HOLE('M', W - t / 2, 30, 4, 40, 'screw'),
      HOLE('M', t / 2, D - 30, 4, 40, 'screw'), HOLE('M', W - t / 2, D - 30, 4, 40, 'screw')
    ]
    add('top', inset ? 'Крыша' : 'Крыша накладная', topX, Hc - t, 0, topW, t, D, {
      group: 'корпус', holes: inset ? insetJointHoles() : overlayJointHoles(),
      note: inset ? 'шканты Ø8×40 + клей в торцы' : 'саморезы Ø4×40 сверху в боковины',
      normal: 'y', normalDir: 1, uAxis: 'x', vAxis: 'z', origin: [topX, Hc, 0]
    })
    add('bottom', inset ? 'Дно' : 'Дно накладное', topX, 0, 0, topW, t, D, {
      group: 'корпус', holes: inset ? insetJointHoles() : overlayJointHoles(),
      note: inset ? 'шканты Ø8×40 + клей в торцы' : 'саморезы Ø4×40 снизу в боковины',
      normal: 'y', normalDir: -1, uAxis: 'x', vAxis: 'z', origin: [topX, 0, 0]
    })

    // ---- Цоколь (M = передняя грань) ----
    if(baseHc){
      const bw = inset ? innerW : W
      add('base', isTumba ? 'Цоколь' : 'Цоколь фронтальный', inset ? t : 0, 0, 0, bw, baseHc, 16, {
        group: 'корпус',
        holes: [HOLE('left', 8, 40, 4, 30, 'screw'), HOLE('right', 8, 40, 4, 30, 'screw')],
        note: 'саморезы Ø4×30 в боковины',
        normal: 'z', normalDir: -1, uAxis: 'x', vAxis: 'y', origin: [inset ? t : 0, 0, 0]
      })
    }

    // ---- Перегородки (M = передняя грань (D-10)×h; u вдоль Z от фасада, v вверх) ----
    for(let i = 0; i < p.partitions; i++){
      const x0 = t + Math.round((innerW / (p.partitions + 1)) * (i + 1)) - t / 2
      const pH = Hc - 2*t - baseHc
      add(`partition-${i}`, `Перегородка ${i + 1}`, x0, baseHc, 0, t, pH, D - 10, {
        group: 'корпус',
        holes: [HOLE('top', 30, t / 2, 8, 30, 'dowel'), HOLE('top', D - 40, t / 2, 8, 30, 'dowel'),
                HOLE('bottom', 30, t / 2, 8, 30, 'dowel'), HOLE('bottom', D - 40, t / 2, 8, 30, 'dowel')],
        note: 'шканты Ø8×30 в крышу и дно',
        normal: 'z', normalDir: -1, uAxis: 'z', vAxis: 'y', origin: [x0 + t, baseHc, 0]
      })
    }

    // ---- Задняя стенка (M = внутренняя грань; u вдоль X, v вверх) ----
    if(p.rear){
      const rW = W - 6, rH = Hc - baseHc - 6
      const rz0 = D - 6 - 3.2
      add('rear', 'Задняя стенка ДВП', (W - rW) / 2, baseHc, rz0, rW, rH, 3.2, {
        group: 'корпус',
        holes: [HOLE('left', 1.6, 60, 3.5, 40, 'selft'), HOLE('left', 1.6, rH / 2, 3.5, 40, 'selft'), HOLE('left', 1.6, rH - 60, 3.5, 40, 'selft'),
                HOLE('right', 1.6, 60, 3.5, 40, 'selft'), HOLE('right', 1.6, rH / 2, 3.5, 40, 'selft'), HOLE('right', 1.6, rH - 60, 3.5, 40, 'selft')],
        note: 'через торцы боковин: саморезы/гвозди Ø3.5×40 (по 3 на боковину)',
        normal: 'z', normalDir: -1, uAxis: 'x', vAxis: 'y', origin: [(W - rW) / 2, baseHc, rz0]
      })
    }

    // ---- Двери (M = лицевая грань; u от левого края, v от низа) ----
    if(p.doors > 0 && type !== 'stoyka'){
      const gap = p.gapFacade
      const doorW = (W - gap * (p.doors + 1)) / p.doors
      const doorH = Hc - baseHc - gap * 2
      for(let i = 0; i < p.doors; i++){
        const x0 = gap + i * (doorW + gap)
        const hingeLeft = i % 2 === 0
        const hu = hingeLeft ? 20 : doorW - 20
        add(`door-${i}`, `Дверь ${i + 1} фасад`, x0, baseHc + gap, -t, doorW, doorH, t, {
          group: 'фасады',
          holes: [HOLE('M', hu, doorH - 20, 35, 12, 'hinge'), HOLE('M', hu, 20, 35, 12, 'hinge')],
          note: 'петля накладная 35 мм, 2 конфирмата, зазор 3 мм',
          normal: 'z', normalDir: -1, uAxis: 'x', vAxis: 'y', origin: [x0, baseHc + gap, -t]
        })
      }
    }

    // ---- Ящики ----
    if(p.drawers > 0){
      const gap = p.gapFacade
      const availH = Math.min(p.drawers * 180 + (p.drawers + 1) * gap, Hc * 0.45)
      const fH = (availH - (p.drawers + 1) * gap) / p.drawers
      const fW = W - 2 * gap
      const boxW = fW - 40, boxD = D - 40, boxH = 120
      for(let i = 0; i < p.drawers; i++){
        const fy = baseHc + gap + i * (fH + gap)
        const by = fy + 10
        const bx = (W - boxW) / 2
        add(`drawer-facade-${i}`, `Фасад ящика ${i + 1}`, 3, fy, -t, fW, fH, t, {
          group: 'фасады', holes: [], note: 'зазор 3 мм, крепление — направляющие',
          part: findPart(`Фасад ящика ${i + 1}`, `Фасад ящика стола ${i + 1}`),
          normal: 'z', normalDir: -1, uAxis: 'x', vAxis: 'y', origin: [3, fy, -t]
        })
        ;[['L', bx], ['R', bx + boxW - t]].forEach(([sd, x0])=>{
          add(`drawer-side-${i}-${sd}`, `Боковина ящика ${i + 1} L/R`, x0, by, 30, t, boxH, boxD, {
          group: 'ящики',
          part: findPart(`Боковина ящика ${i + 1} L/R`, `Боковина ящика ${i + 1}`),
            holes: [HOLE('M', 50, boxH / 2, 3.5, 16, 'screw'), HOLE('M', 150, boxH / 2, 3.5, 16, 'screw'), HOLE('M', 250, boxH / 2, 3.5, 16, 'screw'),
                    HOLE('M', 15, 25, 4, 40, 'screw'), HOLE('M', boxD - 15, 25, 4, 40, 'screw'),
                    HOLE('M', 15, boxH - 25, 4, 40, 'screw'), HOLE('M', boxD - 15, boxH - 25, 4, 40, 'screw')],
            note: 'саморезы: направляющие (3) + перед/зад короба (4)',
            normal: sd === 'L' ? 'x' : 'x', normalDir: sd === 'L' ? 1 : -1,
            uAxis: 'z', vAxis: 'y', origin: [sd === 'L' ? x0 + t : x0, by, 30]
          })
        })
        ;[['front', 30], ['back', 30 + boxD - t]].forEach(([fb, z0])=>{
          add(`drawer-fb-${i}-${fb}`, `Перед/зад ящика ${i + 1}`, bx + t, by, z0, boxW - 2 * t, boxH, t, {
            group: 'ящики',
            holes: [HOLE('left', t / 2, 25, 4, 40, 'screw'), HOLE('left', t / 2, boxH - 25, 4, 40, 'screw'),
                    HOLE('right', t / 2, 25, 4, 40, 'screw'), HOLE('right', t / 2, boxH - 25, 4, 40, 'screw')],
            note: 'прикручивается к боковинам ящика (4 самореза)',
            normal: 'z', normalDir: fb === 'front' ? 1 : -1,
            uAxis: 'x', vAxis: 'y', origin: [bx + t, by, fb === 'front' ? z0 + t : z0]
          })
        })
        add(`drawer-bottom-${i}`, `Дно ящика ${i + 1} ДВП`, bx, by + 10, 30 + t, boxW, boxD - 2 * t, 3.2, {
          group: 'ящики', holes: [], note: 'в паз 6 мм, гвозди 10 мм',
          normal: 'y', normalDir: 1, uAxis: 'x', vAxis: 'z', origin: [bx, by + 13.2, 30 + t]
        })
      }
    }

    // ---- Металлический каркас (профтруба): 4 стойки + нижние рамы ----
    if(p.metalFrame){
      const prof = p._frameProfile
      const pw = prof.a, ph = prof.b
      const postH = Hc
      const frameLabel = `Профиль ${pw}×${ph}×${prof.wall}`
      ;[[0, 0, 'fl'], [W - pw, 0, 'fr'], [0, D - ph, 'bl'], [W - pw, D - ph, 'br']].forEach(([px, pz, tag], i)=>{
        const isLeft = tag === 'fl' || tag === 'bl'
        add(`frame-post-${i}`, 'Стойка каркаса', px, 0, pz, pw, postH, ph, {
          group: 'рама', metal: true, section: `${pw}×${ph}×${prof.wall}`,
          part: byName.get('Стойка каркаса') || { name: 'Стойка каркаса', w: postH, h: 0, thickness: prof.wall, material: frameLabel, edge: '', note: '' },
          plateW: postH, plateH: ph, thick: pw,
          holes: [HOLE('M', 30, ph / 2, 6.6, pw, 'bolt'), HOLE('M', postH - 30, ph / 2, 6.6, pw, 'bolt')],
          note: 'болты M6 к боковинам: 2 шт (30 мм от пола/потолка)',
          normal: 'x', normalDir: isLeft ? 1 : -1, uAxis: 'y', vAxis: 'z',
          origin: [isLeft ? pw : W - pw, 0, pz]
        })
      })
      ;[0, D - ph].forEach((zz, zi)=>{
        add(`frame-rail-${zi}`, 'Рама нижняя', pw, 0, zz, W - 2 * pw, pw, ph, {
          group: 'рама', metal: true, section: `${pw}×${ph}×${prof.wall}`,
          part: byName.get('Рама нижняя') || { name: 'Рама нижняя', w: W - 2 * pw, h: 0, thickness: prof.wall, material: frameLabel, edge: '', note: '' },
          plateW: W - 2 * pw, plateH: ph, thick: pw,
          holes: [HOLE('M', 10, ph / 2, 6.6, pw, 'bolt'), HOLE('M', W - 2 * pw - 10, ph / 2, 6.6, pw, 'bolt')],
          note: 'болты M6 к стойкам: по 1 на стойку',
          normal: 'z', normalDir: zi === 0 ? -1 : 1, uAxis: 'x', vAxis: 'z',
          origin: [pw, 0, zz]
        })
      })
    }

    // ---- Текстовые соединения ----
    if(inset){
      joint('Боковина ↔ Крыша', 'Боковина', 'Крыша', [{ type: 'dowel', qty: 4, name: 'Шкант Ø8×40 + клей' }], 'по 2 шканта, 30 мм от кромок, 35 мм от торца')
      joint('Боковина ↔ Дно', 'Боковина', 'Дно', [{ type: 'dowel', qty: 4, name: 'Шкант Ø8×40 + клей' }], 'по 2 шканта, 35 мм от торца')
    }else{
      joint('Боковина ↔ Крыша/Дно (накладные)', 'Боковина', 'Крыша, Дно', [
        { type: 'dowel', qty: 4, name: 'Шкант Ø8×30 + клей' },
        { type: 'screw', qty: 8, name: 'Саморез Ø4×40' }
      ], 'шканты из торца боковины + саморезы с торцевой стороны крышки/дна')
    }
    if(p.shelves > 0){
      if(p.shelfMount === 'inner'){
        joint('Полка ↔ Боковина', 'Полка', 'Боковина', [{ type: 'minifix', qty: 2 * p.shelves, name: 'Минификс (конфирмат + шкант)' }], 'Ø15 в торце полки, шкант Ø8×30 в боковине, 40 мм от фасада, по центру толщины')
      }else{
        joint('Полка ↔ Боковина', 'Полка', 'Боковина', [{ type: 'pin', qty: 6 * p.shelves, name: 'Полкодержатель Ø5×60' }], '3 полкодержателя на боковину, полка опирается на торец')
      }
    }
    if(p.partitions > 0) joint('Перегородка ↔ Крыша/Дно', 'Перегородка', 'Крыша, Дно', [{ type: 'dowel', qty: 4 * p.partitions, name: 'Шкант Ø8×30' }], 'по 2 шканта сверху и снизу')
    if(p.rear) joint('Задняя стенка ↔ Боковины', 'Задняя стенка ДВП', 'Боковина', [{ type: 'selft', qty: 12, name: 'Саморез/гвоздь Ø3.5×40' }], 'по 3 шт через торцы боковин в каждую стенку')
    if(baseHc) joint('Цоколь ↔ Боковины', 'Цоколь', 'Боковина', [{ type: 'screw', qty: 4, name: 'Саморез Ø4×30' }], 'по 2 шт на боковину, 40 мм от пола')
    if(p.doors > 0 && type !== 'stoyka') joint('Дверь ↔ Корпус', 'Дверь фасад', 'Боковина', [{ type: 'hinge', qty: 2 * p.doors, name: 'Петля накладная 35 мм' }], '2 конфирмата Ø35 на дверь: 20 мм от верхнего и нижнего края')
    if(p.drawers > 0){
      joint('Короб ящика: боковина ↔ перед/зад', 'Боковина ящика', 'Перед/зад ящика', [{ type: 'screw', qty: 8 * p.drawers, name: 'Саморез Ø4×40' }], 'по 4 шт на короб: 2 на перед, 2 на зад')
      joint('Боковина ящика ↔ Направляющая', 'Боковина ящика', 'Направляющая шариковая', [{ type: 'screw', qty: 6 * p.drawers, name: 'Саморез Ø3.5×16' }], '3 отверстия на каждую боковину (50/150/250 мм)')
      joint('Дно ящика ↔ Короб', 'Дно ящика ДВП', 'Боковина ящика', [{ type: 'dowel', qty: 1, name: 'Паз 6 мм + гвозди' }], 'дно садится в паз, гвозди 10 мм по периметру')
    }
    if(p.metalFrame){
      joint(`${sideName} ↔ Стойка каркаса`, sideName, 'Стойка каркаса', [{ type: 'bolt', qty: 8, name: 'Болт M6×30 + гайка + шайба' }], 'по 2 болта на стойку (фронт + бэк), 30 мм от пола и потолка, Ø6.6 — разметка в карточке боковины')
      joint('Стойка каркаса ↔ Рама нижняя', 'Стойка каркаса', 'Рама нижняя', [{ type: 'bolt', qty: 4, name: 'Болт M6×20 + гайка' }], 'по 1 болту на стойку, 10 мм от торца рамы')
    }
  }

  // ================= СТОЛ =================
  function tableLike(){
    const tableT = Math.max(t, 22)
    const legH = p.H - tableT
    const isLegs = p.tableSupport === 'legs'
    const fprof = p._frameProfile
    const fpw = fprof.a, fph = fprof.b
    // отверстия под болты каркаса в дне столешницы (2 на стойку)
    const frameTopHoles = (isLegs && p.metalFrame) ? [
      HOLE('bottom', fpw / 4, fph / 2, 6.6, tableT, 'bolt'), HOLE('bottom', fpw * 3 / 4, fph / 2, 6.6, tableT, 'bolt'),
      HOLE('bottom', p.W - fpw / 4, fph / 2, 6.6, tableT, 'bolt'), HOLE('bottom', p.W - fpw * 3 / 4, fph / 2, 6.6, tableT, 'bolt'),
      HOLE('bottom', fpw / 4, p.D - fph / 2, 6.6, tableT, 'bolt'), HOLE('bottom', fpw * 3 / 4, p.D - fph / 2, 6.6, tableT, 'bolt'),
      HOLE('bottom', p.W - fpw / 4, p.D - fph / 2, 6.6, tableT, 'bolt'), HOLE('bottom', p.W - fpw * 3 / 4, p.D - fph / 2, 6.6, tableT, 'bolt')
    ] : []
    add('top', 'Столешница', 0, p.H - tableT, 0, p.W, tableT, p.D, {
      group: 'корпус',
      holes: isLegs
        ? [HOLE('bottom', 30, 20, 4, 40, 'screw'), HOLE('bottom', 30, p.D - 20, 4, 40, 'screw'),
           HOLE('bottom', p.W - 30, 20, 4, 40, 'screw'), HOLE('bottom', p.W - 30, p.D - 20, 4, 40, 'screw'), ...frameTopHoles]
        : [HOLE('bottom', t / 2, 20, 8, 40, 'dowel'), HOLE('bottom', t / 2, p.D - 40, 8, 40, 'dowel'),
           HOLE('bottom', p.W - t / 2, 20, 8, 40, 'dowel'), HOLE('bottom', p.W - t / 2, p.D - 40, 8, 40, 'dowel')],
      note: isLegs ? (p.metalFrame ? 'каркас: болты M6 в стойки, разметка Ø6.6 на развёртке' : 'крепление ножек саморезами по металлу') : 'шканты Ø8×40 в опоры + клей',
      normal: 'y', normalDir: 1, uAxis: 'x', vAxis: 'z', origin: [0, p.H, 0]
    })
    if(!isLegs){
      ;[['L', 0, 1], ['R', p.W - t, -1]].forEach(([sd, x0, dir])=>{
        add(`leg-${sd}`, `${sd === 'L' ? 'Боковина-опора левая' : 'Боковина-опора правая'}`, x0, tableT, 0, t, legH, p.D - 20, {
          group: 'корпус',
          holes: [HOLE('top', 30, t / 2, 8, 40, 'dowel'), HOLE('top', p.D - 50, t / 2, 8, 40, 'dowel'),
                  HOLE('M', 20, 140, 4, 40, 'screw'), HOLE('M', p.D - 40, 140, 4, 40, 'screw')],
          note: 'шканты в столешницу + саморезы в царги',
          normal: 'x', normalDir: dir, uAxis: 'z', vAxis: 'y', origin: [dir === 1 ? t : p.W - t, tableT, 0]
        })
      })
      const stY = p.H - tableT - 120
      add('stretcher-f', 'Царга фронтальная', t, stY, 0, p.W - 2*t, 120, t, {
        group: 'корпус',
        holes: [HOLE('left', t / 2, 40, 4, 40, 'screw'), HOLE('left', t / 2, 80, 4, 40, 'screw'),
                HOLE('right', t / 2, 40, 4, 40, 'screw'), HOLE('right', t / 2, 80, 4, 40, 'screw')],
        note: 'саморезы Ø4×40 в опоры (2 на торец)',
        normal: 'z', normalDir: -1, uAxis: 'x', vAxis: 'y', origin: [t, stY, 0]
      })
      add('stretcher-b', 'Царга задняя', t, p.H - tableT - 100, p.D - t, p.W - 2*t, 100, t, {
        group: 'корпус',
        holes: [HOLE('left', t / 2, 35, 4, 40, 'screw'), HOLE('right', t / 2, 35, 4, 40, 'screw')],
        note: 'саморезы Ø4×40 в опоры',
        normal: 'z', normalDir: -1, uAxis: 'x', vAxis: 'y', origin: [t, p.H - tableT - 100, p.D - t]
      })
      ;[['L', 0, 1], ['R', p.W - t, -1]].forEach(([sd, x0, dir])=>{
        add(`stretcher-${sd.toLowerCase()}`, 'Царга боковая', x0, stY, 20, t, 120, p.D - 40, {
          group: 'корпус',
          holes: [HOLE('top', 40, t / 2, 4, 40, 'screw'), HOLE('top', p.D - 80, t / 2, 4, 40, 'screw')],
          note: 'саморезы в опоры и фронтальную царгу',
          normal: 'x', normalDir: dir, uAxis: 'z', vAxis: 'y', origin: [dir === 1 ? t : p.W - t, stY, 20]
        })
      })
      if(p.shelves > 0){
        const shY = 200, shW = p.W - 2*t - 10, shD = p.D - 80
        add('shelf-0', 'Полка подстольная', t, shY, 20, shW, t, shD, {
          group: 'наполнение',
          holes: [HOLE('left', t / 2, 40, 15, 45, 'minifix'), HOLE('right', t / 2, 40, 15, 45, 'minifix')],
          note: 'минификс в опоры, 40 мм от фасада',
          normal: 'y', normalDir: 1, uAxis: 'x', vAxis: 'z', origin: [t, shY + t, 20]
        })
      }
      joint('Опора ↔ Столешница', 'Боковина-опора', 'Столешница', [{ type: 'dowel', qty: 4, name: 'Шкант Ø8×40 + клей' }], 'по 2 шканта на опору, 20 мм от краёв')
      joint('Царги ↔ Опоры', 'Царга', 'Боковина-опора', [{ type: 'screw', qty: 12, name: 'Саморез Ø4×40' }], 'фронтальная: 2 на торец, боковые: 1 на торец')
    }else if(p.metalFrame){
      // каркас из профтрубы: 4 стойки под столешницей + нижние рамы
      const frameLabel = `Профиль ${fpw}×${fph}×${fprof.wall}`
      ;[[0, 0, 'fl'], [p.W - fpw, 0, 'fr'], [0, p.D - fph, 'bl'], [p.W - fpw, p.D - fph, 'br']].forEach(([px, pz, tag], i)=>{
        const isLeft = tag === 'fl' || tag === 'bl'
        add(`frame-post-${i}`, 'Стойка каркаса', px, 0, pz, fpw, legH, fph, {
          group: 'рама', metal: true, section: `${fpw}×${fph}×${fprof.wall}`,
          part: byName.get('Стойка каркаса') || { name: 'Стойка каркаса', w: legH, h: 0, thickness: fprof.wall, material: frameLabel, edge: '', note: '' },
          plateW: legH, plateH: fph, thick: fpw,
          holes: [HOLE('M', 20, fph / 2, 6.6, fpw, 'bolt'), HOLE('M', legH - 20, fph / 2, 6.6, fpw, 'bolt')],
          note: 'болты M6: столешница сверху, рама снизу',
          normal: 'x', normalDir: isLeft ? 1 : -1, uAxis: 'y', vAxis: 'z',
          origin: [isLeft ? fpw : p.W - fpw, 0, pz]
        })
      })
      ;[0, p.D - fph].forEach((zz, zi)=>{
        add(`frame-rail-${zi}`, 'Рама нижняя', fpw, 0, zz, p.W - 2 * fpw, fpw, fph, {
          group: 'рама', metal: true, section: `${fpw}×${fph}×${fprof.wall}`,
          part: byName.get('Рама нижняя') || { name: 'Рама нижняя', w: p.W - 2 * fpw, h: 0, thickness: fprof.wall, material: frameLabel, edge: '', note: '' },
          plateW: p.W - 2 * fpw, plateH: fph, thick: fpw,
          holes: [HOLE('M', 10, fph / 2, 6.6, fpw, 'bolt'), HOLE('M', p.W - 2 * fpw - 10, fph / 2, 6.6, fpw, 'bolt')],
          note: 'болты M6 к стойкам: по 1 на стойку',
          normal: 'z', normalDir: zi === 0 ? -1 : 1, uAxis: 'x', vAxis: 'z',
          origin: [fpw, 0, zz]
        })
      })
      joint('Столешница ↔ Стойка каркаса', 'Столешница', 'Стойка каркаса', [{ type: 'bolt', qty: 8, name: 'Болт M6×25 + гайка + шайба' }], 'по 2 болта на стойку через столешницу, разметка Ø6.6 на развёртке')
      joint('Стойка каркаса ↔ Рама нижняя', 'Стойка каркаса', 'Рама нижняя', [{ type: 'bolt', qty: 4, name: 'Болт M6×20 + гайка' }], 'по 1 болту на стойку, 10 мм от торца рамы')
    }else{
      ;[[15, 15], [p.W - 65, 15], [15, p.D - 65], [p.W - 65, p.D - 65]].forEach((pos, i)=>{
        add(`metal-leg-${i}`, `Ножка металлическая ${i + 1}`, pos[0], 0, pos[1], 50, p.H - tableT, 50, {
          group: 'корпус', metal: true, ghost: true, section: 'Ø50', holes: [], note: 'купная опора, не в раскрое',
          normal: 'y', normalDir: 1, uAxis: 'x', vAxis: 'z', origin: [pos[0], p.H - tableT, pos[1]]
        })
      })
      joint('Столешница ↔ Ножки', 'Столешница', 'Ножка металлическая', [{ type: 'screw', qty: 8, name: 'Саморез по металлу Ø4×40' }], 'по 2 шт на ножку в торец столешницы')
    }
  }

  // ================= НАСТЕННАЯ ПОЛКА =================
  function polkaLike(){
    if(p.polkaType === 'simple'){
      const boardY = 80
      add('shelf-0', 'Полка', 0, boardY, 0, p.W, t, p.D, {
        group: 'корпус',
        holes: [HOLE('M', 50, p.D - 20, 5, 40, 'screw'), HOLE('M', p.W - 50, p.D - 20, 5, 40, 'screw')],
        note: 'крепёж: полкодержатели / скрытый ментсолодержатель',
        normal: 'y', normalDir: -1, uAxis: 'x', vAxis: 'z', origin: [0, boardY, 0]
      })
      if(p.W > 800){
        add('rib', 'Ребро жесткости', 20, 0, p.D - 35 - t, p.W - 40, 80, t, {
          group: 'корпус',
          holes: [HOLE('M', 60, t / 2, 4, 30, 'screw'), HOLE('M', p.W - 40 - 60, t / 2, 4, 30, 'screw')],
          note: 'под полкой сзади, саморезы вверх в торец',
          normal: 'y', normalDir: 1, uAxis: 'x', vAxis: 'z', origin: [20, 80, p.D - 35 - t]
        })
        joint('Ребро жёсткости ↔ Полка', 'Ребро жесткости', 'Полка', [{ type: 'screw', qty: 2, name: 'Саморез Ø4×30' }], 'вверх в торец полки')
      }
      joint('Полка ↔ Стена', 'Полка', 'Стена', [{ type: 'screw', qty: 2, name: 'Полкодержатель + дюбель' }], '2 точки крепления сзади')
    }else{
      cabinetLike('polka')
    }
  }

  // ================= МЕТАЛЛИЧЕСКАЯ РАМА ИЗ ПРОФИЛЯ =================
  function metalFrame(){
    const prof = p._profile || { a: 40, b: 20 }
    const pw = prof.a, ph = prof.b
    const L = Math.max(2, p.metalLevels)
    const nDiv = p.metalDividers
    const wall = p.metalWall
    const matLabel = `Профиль ${pw}×${ph}×${wall}`

    // уровни рам (y нижнего края)
    const levels = []
    for(let i = 0; i < L; i++){
      levels.push(i === 0 ? 0 : i === L - 1 ? p.H - pw : pw + (p.H - 2 * pw) * i / (L - 1))
    }

    // позиции стоек: [x, z]
    const postPos = [[0, 0, 'fl'], [p.W - pw, 0, 'fr'], [0, p.D - ph, 'bl'], [p.W - pw, p.D - ph, 'br']]

    // ---- Стойки: M-развёртка H × ph (боковая грань); u вдоль H от низа, v вдоль ph ----
    postPos.forEach((pos, i)=>{
      const [px, pz, tag] = pos
      const isLeft = tag === 'fl' || tag === 'bl'
      const isFront = tag === 'fl' || tag === 'fr'
      const holes = []
      const worldHoles = []
      levels.forEach(lv=>{
        // боковые рамы (1 болт на уровень, грань X)
        holes.push(HOLE('M', lv + 10, ph / 2, 6.6, pw, 'bolt'))
        const bx = isLeft ? pw : p.W - pw
        worldHoles.push({ x: bx, y: lv + 10, z: isFront ? ph / 2 : p.D - ph / 2, d: 6.6, t: 'bolt', face: isLeft ? 'x+' : 'x-' })
        // фронт/бэк рамы (2 болта, внутренняя грань Z стойки)
        const zy = isFront ? ph : p.D - ph
        ;[lv + 10, lv + pw - 10].forEach(yy=>{
          worldHoles.push({ x: isLeft ? pw / 2 : p.W - pw / 2, y: yy, z: zy, d: 6.6, t: 'bolt', face: isFront ? 'z+' : 'z-' })
        })
      })
      add(`post-${i}`, `Стойка ${pw}×${ph}`, px, 0, pz, pw, p.H, ph, {
        group: 'рама', metal: true, section: `${pw}×${ph}×${wall}`,
        part: byName.get('Стойка') || { id: 0, name: 'Стойка', w: p.H, h: 0, thickness: wall, material: matLabel, edge: '', note: '' },
        plateW: p.H, plateH: ph, thick: pw,
        holes, worldHoles,
        note: 'болты M6 к рамам на каждом уровне (2 на раму фронт/бэк, 1 на боковую)',
        normal: 'x', normalDir: isLeft ? 1 : -1, uAxis: 'y', vAxis: 'z',
        origin: [isLeft ? pw : p.W - pw, 0, isFront ? 0 : p.D - ph]
      })
    })

    // ---- Рамы фронт/бэк: развёртка len × ph; u вдоль длины, v вдоль ph ----
    const lenX = W - 2 * pw
    // ---- Рамы боковые ----
    const lenZ = D - 2 * ph
    levels.forEach((lv, i)=>{
      ;[0, p.D - ph].forEach((zz, zi)=>{
        const isFront = zi === 0
        const worldHoles = []
        ;[10, pw - 10].forEach(off=>{
          worldHoles.push({ x: pw + 1, y: lv + off, z: ph / 2, d: 6.6, t: 'bolt', face: 'x+' })
          worldHoles.push({ x: p.W - pw - 1, y: lv + off, z: ph / 2, d: 6.6, t: 'bolt', face: 'x-' })
        })
        add(`rail-fb-${i}-${zi}`, `Рама ${pw}×${ph} (фронт/бэк)`, pw, lv, zz, lenX, pw, ph, {
          group: 'рама', metal: true, section: `${pw}×${ph}×${wall}`,
          part: byName.get('Рама фронт/бэк') || { id: 0, name: 'Рама фронт/бэк', w: lenX, h: 0, thickness: wall, material: matLabel, edge: '', note: '' },
          plateW: lenX, plateH: ph, thick: pw,
          holes: [HOLE('M', 10, ph / 2, 6.6, pw, 'bolt'), HOLE('M', pw - 10, ph / 2, 6.6, pw, 'bolt'),
                  HOLE('M', lenX - pw + 10, ph / 2, 6.6, pw, 'bolt'), HOLE('M', lenX - 10, ph / 2, 6.6, pw, 'bolt')],
          worldHoles,
          note: 'болты M6 к стойкам: по 2 на торец',
          normal: 'z', normalDir: isFront ? -1 : 1, uAxis: 'x', vAxis: 'y',
          origin: [pw, lv + (isFront ? 0 : pw), zz + (isFront ? 0 : 0)]
        })
      })
      ;[0, p.W - pw].forEach((xx, xi)=>{
        const isLeft = xi === 0
        const worldHoles = [
          { x: isLeft ? pw / 2 : p.W - pw / 2, y: lv + ph / 2, z: ph + 1, d: 6.6, t: 'bolt', face: 'z+' },
          { x: isLeft ? pw / 2 : p.W - pw / 2, y: lv + ph / 2, z: p.D - ph - 1, d: 6.6, t: 'bolt', face: 'z-' }
        ]
        add(`rail-lr-${i}-${xi}`, `Рама ${pw}×${ph} (боковая)`, xx, lv, ph, pw, ph, lenZ, {
          group: 'рама', metal: true, section: `${pw}×${ph}×${wall}`,
          part: byName.get('Рама боковая') || { id: 0, name: 'Рама боковая', w: lenZ, h: 0, thickness: wall, material: matLabel, edge: '', note: '' },
          plateW: lenZ, plateH: ph, thick: pw,
          holes: [HOLE('M', 10, ph / 2, 6.6, pw, 'bolt'), HOLE('M', lenZ - 10, ph / 2, 6.6, pw, 'bolt')],
          worldHoles,
          note: 'болты M6 к стойкам: по 1 на торец',
          normal: 'x', normalDir: isLeft ? -1 : 1, uAxis: 'z', vAxis: 'y',
          origin: [isLeft ? 0 : p.W - pw, lv, ph]
        })
      })
    })

    // ---- Перегородки (полной высоты между рамами) ----
    for(let i = 0; i < nDiv; i++){
      const xi = Math.round(p.W / (nDiv + 1) * (i + 1)) - ph / 2
      const dLen = p.H - 2 * pw
      const holes = []
      const worldHoles = []
      // отверстия по каждому уровню (фронт + бэк)
      levels.forEach(lv=>{
        const ys = lv === 0 ? [pw + 10] : lv === p.H - pw ? [p.H - pw - 10] : [lv + 10, lv + pw - 10]
        ys.forEach(yy=>{
          holes.push(HOLE('M', yy - pw, ph / 2, 6.6, pw, 'bolt'))
          worldHoles.push({ x: xi + ph / 2, y: yy, z: ph + 1, d: 6.6, t: 'bolt', face: 'z+' })
          worldHoles.push({ x: xi + ph / 2, y: yy, z: p.D - ph - 1, d: 6.6, t: 'bolt', face: 'z-' })
        })
      })
      add(`mdiv-${i}`, `Перегородка ${pw}×${ph}`, xi, pw, ph, ph, dLen, p.D - 2 * ph, {
        group: 'рама', metal: true, section: `${pw}×${ph}×${wall}`,
        part: byName.get('Перегородка') || { id: 0, name: 'Перегородка', w: dLen, h: 0, thickness: wall, material: matLabel, edge: '', note: '' },
        plateW: dLen, plateH: ph, thick: pw,
        holes, worldHoles,
        note: 'болты M6 к рамам фронт/бэк на каждом уровне',
        normal: 'z', normalDir: -1, uAxis: 'y', vAxis: 'x',
        origin: [xi, pw, 0]
      })
    }

    // ---- Полки листовые на уровнях (кроме верхнего) ----
    if(p.metalShelves){
      const cols = nDiv + 1
      const colW = Math.floor((p.W - 2 * pw - nDiv * ph) / cols)
      const cW = colW - 2
      const shH = D - 2 * ph - 2
      let shelfIdx = 0
      levels.forEach((lv, i)=>{
        if(i === L - 1) return
        for(let c = 0; c < cols; c++){
          shelfIdx++
          const x0 = pw + c * colW
          const nm = nDiv > 0 ? `Полка ${shelfIdx}.${c + 1}` : `Полка ${shelfIdx}`
          add(`mshelf-${i}-${c}`, nm, x0, lv + pw, ph, cW, t, shH, {
            group: 'наполнение',
            holes: [HOLE('M', 60, 10, 4, 13, 'selft'), HOLE('M', cW - 60, 10, 4, 13, 'selft'),
                    HOLE('M', 60, shH - 10, 4, 13, 'selft'), HOLE('M', cW - 60, shH - 10, 4, 13, 'selft')],
            note: 'саморезы по металлу Ø4×13 в рамы (4 шт)',
            normal: 'y', normalDir: 1, uAxis: 'x', vAxis: 'z', origin: [x0, lv + pw + t, ph]
          })
        }
      })
      joint('Полка ↔ Рама', 'Полка', 'Рама', [{ type: 'selft', qty: 4 * (L - 1) * cols, name: 'Саморез по металлу Ø4×13' }], 'по 4 шт на полку: перед и зад, 60 мм от торцов')
    }

    // ---- Задняя стенка ----
    if(p.metalRear){
      const rW = p.W - 2 * pw - 4, rH = p.H - 2 * pw - 4
      add('rear', 'Задняя стенка ДВП', pw, pw, p.D - ph - 4 - 3.2, rW, rH, 3.2, {
        group: 'корпус',
        holes: [HOLE('left', 1.6, 60, 4, 13, 'selft'), HOLE('left', 1.6, rH - 60, 4, 13, 'selft'),
                HOLE('right', 1.6, 60, 4, 13, 'selft'), HOLE('right', 1.6, rH - 60, 4, 13, 'selft')],
        note: 'саморезы по металлу в задние рамы',
        normal: 'z', normalDir: -1, uAxis: 'x', vAxis: 'y', origin: [pw, pw, p.D - ph - 4]
      })
      joint('Задняя стенка ↔ Задние рамы', 'Задняя стенка ДВП', 'Рама', [{ type: 'selft', qty: 4, name: 'Саморез по металлу Ø4×13' }], 'сверху и снизу по краям')
    }

    // ---- Соединения рамы ----
    const corners = 4 * L
    joint('Стойка ↔ Рама фронт/бэк', 'Стойка', 'Рама фронт/бэк', [{ type: 'bolt', qty: 4 * corners, name: 'Болт M6×20 + гайка/шайба' }], 'по 2 болта на соединение, отверстия Ø6.6, 10 мм от кромок')
    joint('Стойка ↔ Рама боковая', 'Стойка', 'Рама боковая', [{ type: 'bolt', qty: 2 * corners, name: 'Болт M6×20 + гайка/шайба' }], 'по 1 болту на соединение, Ø6.6 по центру')
    joint('Угольник 30×30×2 (усиление углов)', 'Стойка', 'Рама', [{ type: 'bolt', qty: corners, name: 'Угольник, 2 болта M6' }], 'на каждый угол каждого уровня')
    if(nDiv > 0) joint('Перегородка ↔ Рама', 'Перегородка', 'Рама', [{ type: 'bolt', qty: 4 * L * nDiv, name: 'Болт M6×20' }], 'по 4 болта на пересечение (фронт + бэк)')
    if(p.metalRear) joint('Задняя стенка ↔ Задние рамы', 'Задняя стенка ДВП', 'Рама', [{ type: 'selft', qty: 4, name: 'Саморез по металлу Ø4×13' }], 'сверху и снизу по краям')
  }

  switch(p.type){
    case 'shkaf': cabinetLike('shkaf'); break
    case 'tumba': cabinetLike('tumba'); break
    case 'stoyka': cabinetLike('stoyka'); break
    case 'polka': polkaLike(); break
    case 'stol': tableLike(); break
    case 'metal': metalFrame(); break
  }

  // детали, разрезанные под лист (splitMap) → сегменты с узлами стыковки
  const splitItems = applySplits(items, joints, result)

  return { items: splitItems, ghosts, joints, metal: p.type === 'metal' }
}

const DIM_OF_AXIS = { x: 'w', y: 'h', z: 'd' }

/**
 * Применяет авторазрез (calculator.splitOversized) к элементам сборки:
 *  - полный бокс детали разбивается на N сегментов
 *  - отверстия пересчитываются в локальные координаты сегмента
 *  - на гранях стыка добавляются шканты + саморез (узел стыковки)
 */
function applySplits(items, joints, result){
  const sm = result.splitMap || {}
  const newItems = []
  items.forEach(it=>{
    const info = sm[it.name]
    if(!info || it.name.indexOf('/') >= 0){ newItems.push(it); return }

    const N = info.total
    const longAxis = info.longAxis
    const alongB = longAxis === 'h' // разрез вдоль part.h (axisB)

    // мировые оси: axisA — направление part.w, axisB — part.h
    const axisOf = (dim)=> Math.abs(it.h - dim) < 1.5 ? 'y' : (Math.abs(it.d - dim) < 1.5 ? 'z' : (Math.abs(it.w - dim) < 1.5 ? 'x' : null))
    const axisA = axisOf(info.origW)
    const axisB = axisOf(info.origH)
    if(!axisA || !axisB || axisA === axisB){ newItems.push(it); return }
    const tAxis = ['x', 'y', 'z'].filter(a=> a !== axisA && a !== axisB).sort((a, b)=> it[a] - it[b])[0]
    const tSize = it[tAxis]

    const splitA = alongB ? axisB : axisA  // ось разреза по длинной стороне
    const splitB = alongB ? axisA : axisB  // ось разреза по короткой (если shortN>1)
    const otherAxis = alongB ? axisA : axisB

    const t = (it.part && it.part.thickness) || 16
    const dD = t >= 12 ? 8 : 6
    const dL = Math.max(30, Math.round(t * 3 / 10) * 10)
    const sL = Math.max(30, Math.round((t * 2 + 8) / 10) * 10)

    const cutPos = []
    let idx = 0
    for(let li = 0; li < info.longN; li++){
      let longOff = 0
      for(let k = 0; k < li; k++) longOff += info.longSizes[k]
      if(li > 0) cutPos.push(String(Math.round(longOff)))
      for(let si = 0; si < info.shortN; si++){
        let shortOff = 0
        for(let k = 0; k < si; k++) shortOff += info.shortSizes[k]
        const sizeLong = info.longSizes[li], sizeShort = info.shortSizes[si]
        const isFirstLong = li === 0, isLastLong = li === info.longN - 1

        const sub = { ...it }
        sub.key = `${it.key}-${idx}`
        sub.name = `${it.name} ${idx + 1}/${N}`

        // габариты сегмента
        sub[splitA] = it[splitA] + longOff
        sub[DIM_OF_AXIS[splitA]] = sizeLong
        if(info.shortN > 1){
          sub[splitB] = it[splitB] + shortOff
          sub[DIM_OF_AXIS[splitB]] = sizeShort
        }
        // развёртка (грань)
        if(alongB){ sub.plateH = sizeLong; if(info.shortN > 1) sub.plateW = sizeShort }
        else { sub.plateW = sizeLong; if(info.shortN > 1) sub.plateH = sizeShort }

        // координаты в системе детали (u вдоль axisA/origW, v вдоль axisB/origH)
        const offA = alongB ? shortOff : longOff
        const offB = alongB ? longOff : shortOff
        const sizeA = alongB ? sizeShort : sizeLong
        const sizeB = alongB ? sizeLong : sizeShort

        // ---- отверстия: перенос в сегмент ----
        const holes = []
        it.holes.forEach(hle=>{
          const f = hle.f
          let u = hle.u, v = hle.v
          let keep = true
          if(f === 'M'){
            if(u < offA - 1 || u > offA + sizeA + 1) keep = false
            if(v < offB - 1 || v > offB + sizeB + 1) keep = false
            u -= offA; v -= offB
          } else if(f === 'top'){
            if(offB > 1) keep = false
            else { if(u < offA - 1 || u > offA + sizeA + 1) keep = false; u -= offA }
          } else if(f === 'bottom'){
            if(offB < info.origH - sizeB - 1) keep = false
            else { if(u < offA - 1 || u > offA + sizeA + 1) keep = false; u -= offA }
          } else if(f === 'left'){
            if(offA > 1) keep = false
            else { if(v < offB - 1 || v > offB + sizeB + 1) keep = false; v -= offB }
          } else if(f === 'right'){
            if(offA < info.origW - sizeA - 1) keep = false
            else { if(v < offB - 1 || v > offB + sizeB + 1) keep = false; v -= offB }
          }
          if(keep) holes.push({ ...hle, u: Math.round(u), v: Math.round(v) })
        })

        // ---- узел стыковки: шканты + саморез на грани стыка ----
        const Llong = alongB ? sizeA : sizeB // ширина грани стыка
        const addJointHoles = (face)=>{
          holes.push(HOLE(face, Math.round(Llong * 0.25), Math.round(t / 2), dD, t, 'dowel'))
          holes.push(HOLE(face, Math.round(Llong * 0.75), Math.round(t / 2), dD, t, 'dowel'))
          holes.push(HOLE(face, Math.round(Llong * 0.5), Math.round(t / 2), 4, sL, 'screw'))
        }
        if(!isLastLong) addJointHoles(alongB ? 'top' : 'right')
        if(!isFirstLong) addJointHoles(alongB ? 'bottom' : 'left')

        // ---- мировые отверстия (для подсветки 3D) ----
        sub.worldHoles = (it.worldHoles || []).filter(hl=>{
          const c = hl[splitA]
          if(c < it[splitA] + longOff - 1 || c > it[splitA] + longOff + sizeLong + 1) return false
          if(info.shortN > 1){
            const c2 = hl[splitB]
            if(c2 < it[splitB] + shortOff - 1 || c2 > it[splitB] + shortOff + sizeShort + 1) return false
          }
          return true
        })
        const addJointWH = (endFace)=>{
          const startCoord = endFace ? it[splitA] + longOff + sizeLong : it[splitA] + longOff
          ;[0.25, 0.5, 0.75].forEach(frac=>{
            const coords = {}
            coords[splitA] = startCoord
            coords[otherAxis] = it[otherAxis] + Llong * frac
            coords[tAxis] = it[tAxis] + tSize / 2
            sub.worldHoles.push({ x: coords.x, y: coords.y, z: coords.z, d: dD, t: 'dowel', face: splitA === 'y' ? 'y+' : 'z-' })
          })
        }
        if(!isLastLong) addJointWH(true)
        if(!isFirstLong) addJointWH(false)

        sub.holes = holes
        // фактическая деталь (сегмент) из списка раскроя — для карточки
        const piece = result.parts.find(q=> q.splitInfo && q.splitInfo.baseName === it.name && q.splitInfo.index === idx)
        if(piece){ sub.part = piece; sub.partId = piece.id }
        newItems.push(sub)
        idx++
      }
    }
    joints.push({
      label: `Разрез ${it.name} — ${N} сегмента`,
      a: it.name, b: 'стыковка торцов',
      fasteners: [
        { type: 'dowel', qty: 2 * (N - 1), name: `Шкант Ø${dD}×${dL} + клей` },
        { type: 'screw', qty: (N - 1), name: `Саморез Ø4×${sL}` }
      ],
      note: `распил: ${cutPos.join('; ')} мм; на стыке — шканты + саморез, клей; кромка только на внешних гранях`
    })
  })
  return newItems
}

/** Суммарно по типам крепежа */
export function fastenerTotals(joints){
  const m = new Map()
  joints.forEach(j=>{
    j.fasteners.forEach(f=>{
      if(!f.qty) return
      m.set(f.type, (m.get(f.type) || 0) + f.qty)
    })
  })
  return [...m.entries()].map(([type, qty])=> ({ type, qty, label: FAST_TYPES[type].label, color: FAST_TYPES[type].color }))
}

const PART_PREFIXES = ['Полка', 'Боковина', 'Дверь', 'Царга', 'Стойка', 'Рама', 'Перегородка', 'Дно ящика', 'Перед/зад ящика', 'Боковина ящика', 'Ножка', 'Столешница', 'Цоколь', 'Крыша', 'Дно', 'Ребро']

/** Соединения, в которых участвует деталь (по имени или префиксу) */
export function jointsForPart(partName, joints){
  return joints.filter(j=> [j.a, j.b].some(np=>{
    if(np === partName) return true
    const pfx = PART_PREFIXES.find(pf=> partName.startsWith(pf))
    return pfx && np === pfx
  }))
}
