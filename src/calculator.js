/**
 * Конструктор мебели — логика расчёта деталей и раскроя
 * Поддерживает: шкаф, тумба, стойка, стол, полка
 * Учитывает толщину материала, зазоры, кромку, тип сборки
 */

export const MATERIALS = {
  ldsp16: { label: 'ЛДСП 16 мм', t: 16, sheet: [2800,2070], priceM2: 28 },
  ldsp18: { label: 'ЛДСП 18 мм', t: 18, sheet: [2800,2070], priceM2: 32 },
  mdf16: { label: 'МДФ 16 мм', t: 16, sheet: [2800,2070], priceM2: 45 },
  mdf18: { label: 'МДФ 18 мм', t: 18, sheet: [2800,2070], priceM2: 52 },
  fanera12: { label: 'Фанера 12 мм', t: 12, sheet: [2500,1250], priceM2: 38 },
  fanera15: { label: 'Фанера 15 мм', t: 15, sheet: [2500,1250], priceM2: 44 },
  fanera18: { label: 'Фанера 18 мм', t: 18, sheet: [2500,1250], priceM2: 52 },
  fanera21: { label: 'Фанера 21 мм', t: 21, sheet: [2500,1250], priceM2: 60 },
  osp12: { label: 'ОСП 12 мм', t: 12, sheet: [2500,1250], priceM2: 22 },
  osp15: { label: 'ОСП 15 мм', t: 15, sheet: [2500,1250], priceM2: 26 },
  dsp22: { label: 'ДСП 22 мм', t: 22, sheet: [2440,1830], priceM2: 35 },
}

export function getMaterial(key, customT){
  const m = MATERIALS[key] || MATERIALS.ldsp16
  return { ...m, t: customT || m.t }
}

function num(v, def){
  const n = Number(v)
  return Number.isFinite(n) ? n : def
}
function clamp(v, min, max){ return Math.max(min, Math.min(max, num(v, min))) }

/**
 * Зоны фасадов — общая логика для расчёта деталей и эскизов.
 * Ящики — нижняя зона над цоколем, двери — сверху (фасады не перекрывают друг друга).
 * Тумба без дверей: ящики на весь фасад.
 * Размеры в мм.
 */
export function facadeZones(params){
  const H = clamp(num(params.H, 2000), 200, 3000)
  const W = clamp(num(params.W, 800), 150, 3000)
  const GAP = clamp(num(params.gapFacade, 3), 0, 10)
  const baseH = params.base ? 80 : 0
  const drawers = clamp(params.drawers, 0, 8)
  const doors = clamp(params.doors, 0, 6)

  let drawerZoneH = 0
  if(drawers > 0){
    const bottomZone = Math.min(drawers * 180 + (drawers + 1) * GAP, Math.round(H * 0.45))
    drawerZoneH = (params.type === 'tumba' && doors === 0) ? (H - baseH) : bottomZone
  }
  const drawerH = drawers > 0 ? (drawerZoneH - (drawers + 1) * GAP) / drawers : 0
  const doorH = doors > 0 ? Math.max(H - baseH - drawerZoneH - 2 * GAP, 10) : 0
  const doorW = doors > 0 ? (W - (doors + 1) * GAP) / doors : 0

  return { H, W, GAP, baseH, drawers, doors, drawerZoneH, drawerH, doorH, doorW }
}

/**
 * Основная функция расчёта
 * params = { type, H,W,D, t, materialKey, sheetW,sheetH, rear, base, construction, shelfMount, shelves, doors, drawers, partitions, gapFacade, shelfInset, edge, ... }
 * edge — припуск на кромку в мм (0 = без кромки); к чистовому размеру добавляется
 * с той стороны(ах), где наклеивается кромка (припуск идёт на раскрой в wCut/hCut).
 */
export function calculate(params){
  const p = normalize(params)
  const t = p.t
  const GAP_F = p.gapFacade
  const SHELF_INSET = p.shelfInset
  const EA = p.edge // припуск на кромку, мм
  const parts = []
  let id = 1
  const add = (name, w, h, count=1, opts={})=>{
    if(w<=0 || h<=0) return
    // w,h — чистовые размеры; edgeX/edgeY — припуск на кромку для раскроя
    parts.push({
      id: id++,
      name,
      w: Math.round(w),
      h: Math.round(h),
      wCut: Math.round(w + (opts.edgeX||0)),
      hCut: Math.round(h + (opts.edgeY||0)),
      count,
      material: opts.material || p.materialLabel,
      thickness: opts.thickness ?? t,
      edge: opts.edge || '',
      note: opts.note || '',
      group: opts.group || 'корпус',
      area: Math.round(w*h)
    })
  }

  // общие величины
  const innerW = p.W - 2*t
  const baseH = p.base ? 80 : 0

  // type-specific
  switch(p.type){
    case 'shkaf': {
      const fz = facadeZones(p)
      // Боковины: кромка на передней и задней кромках (2 длинных) → припуск по глубине
      add('Боковина левая', p.D, p.H, 1, { edge: '2 длинных', edgeX: 2*EA, group:'корпус', note: p.construction==='inset'?'паз под заднюю стенку 10мм':'' })
      add('Боковина правая', p.D, p.H, 1, { edge: '2 длинных', edgeX: 2*EA, group:'корпус' })

      // Крыша и дно
      if(p.construction === 'inset'){
        add('Крыша', innerW, p.D, 1, { edge: 'перед', edgeY: EA, group:'корпус' })
        add('Дно', innerW, p.D, 1, { edge: 'перед', edgeY: EA, group:'корпус' })
      }else{
        add('Крыша накладная', p.W, p.D, 1, { edge: 'по периметру', edgeX: 2*EA, edgeY: 2*EA, group:'корпус' })
        add('Дно накладное', p.W, p.D, 1, { edge: 'перед', edgeY: EA, group:'корпус' })
      }

      // Цоколь
      if(p.base){
        add('Цоколь фронтальный', innerW, 80, 1, { edge: 'перед', edgeY: EA, group:'корпус', note:'отступ 20мм от фасада' })
      }

      // Перегородки вертикальные (кромка «перед» — по высоте → припуск по глубине)
      for(let i=0;i<p.partitions;i++){
        add(`Перегородка ${i+1}`, p.D - 10, p.H - 2*t - baseH, 1, { edge:'перед', edgeX: EA, group:'корпус' })
      }

      // Полки: ширина секции делится перегородками
      const sections = p.partitions + 1
      const shelfW = sections > 1
        ? Math.floor((innerW - p.partitions*t)/sections) - 2
        : (p.shelfMount === 'overlay' ? p.W - 2 : innerW - 4)
      const shelfD = p.D - SHELF_INSET - (p.rear ? 4 : 0) // отступ от задней стенки
      for(let i=0;i<p.shelves;i++){
        if(sections>1){
          for(let s=0;s<sections;s++){
            add(`Полка ${i+1}.${s+1}`, shelfW, shelfD, 1, { edge:'перед', edgeY: EA, group:'наполнение' })
          }
        }else{
          add(`Полка ${i+1}`, shelfW, shelfD, 1, { edge:'перед', edgeY: EA, group:'наполнение' })
        }
      }

      // Задняя стенка ДВП
      if(p.rear){
        add('Задняя стенка ДВП', p.W - 6, p.H - baseH - 6, 1, { material: 'ДВП 3.2 мм', thickness: 3.2, edge:'-', group:'корпус', note: 'в паз 10мм или накладная на гвозди' })
      }

      // Двери — верхняя зона (над ящиками, если они есть)
      for(let i=0;i<p.doors;i++){
        add(`Дверь ${i+1} фасад`, fz.doorW, fz.doorH, 1, { edge:'по периметру', edgeX: 2*EA, edgeY: 2*EA, group:'фасады', note:`зазор ${GAP_F}мм, петля накладная 35мм` })
      }

      // Ящики (шуфлядки) — нижняя зона
      if(p.drawers>0){
        const fW = p.W - 2*GAP_F
        for(let i=0;i<p.drawers;i++){
          add(`Фасад ящика ${i+1}`, fW, fz.drawerH, 1, { edge:'по периметру', edgeX: 2*EA, edgeY: 2*EA, group:'фасады', note:`зазор ${GAP_F}мм` })
          // Короб ящика: 2 боковины, перед/зад, дно ДВП
          const boxW = fW - 40 // минус направляющие и зазоры
          const boxD = p.D - 40
          const boxH = 120
          add(`Боковина ящика ${i+1} L/R`, boxD, boxH, 2, { group:'ящики', note:'сверление под направляющие' })
          add(`Перед/зад ящика ${i+1}`, boxW - 2*t, boxH, 2, { group:'ящики' })
          add(`Дно ящика ${i+1} ДВП`, boxW, boxD, 1, { material:'ДВП 3.2 мм', thickness:3.2, edge:'-', group:'ящики', note:'в паз 6мм' })
        }
      }
      break
    }
    case 'tumba': {
      // Тумба / комод
      const fz = facadeZones(p)
      add('Боковина левая', p.D, p.H, 1, { edge:'2 длинных', edgeX: 2*EA, group:'корпус' })
      add('Боковина правая', p.D, p.H, 1, { edge:'2 длинных', edgeX: 2*EA, group:'корпус' })
      if(p.construction==='inset'){
        add('Крыша', innerW, p.D, 1, { edge:'перед', edgeY: EA, group:'корпус' })
        add('Дно', innerW, p.D, 1, { edge:'перед', edgeY: EA, group:'корпус' })
      }else{
        add('Крыша накладная', p.W, p.D, 1, { edge:'по периметру', edgeX: 2*EA, edgeY: 2*EA, group:'корпус' })
        add('Дно накладное', p.W, p.D, 1, { edge:'перед', edgeY: EA, group:'корпус' })
      }
      if(p.base){
        add('Цоколь', innerW, 80, 1, { edge:'перед', edgeY: EA, group:'корпус' })
      }
      for(let i=0;i<p.partitions;i++){
        add(`Перегородка ${i+1}`, p.D-10, p.H - 2*t - baseH, 1, { edge:'перед', edgeX: EA, group:'корпус' })
      }
      // Полки
      const sections = p.partitions+1
      const shelfW = sections > 1
        ? Math.floor((innerW - p.partitions*t)/sections) - 2
        : (p.shelfMount === 'overlay' ? p.W - 2 : innerW - 4)
      const shelfD = p.D - SHELF_INSET
      for(let i=0;i<p.shelves;i++){
        for(let s=0;s<sections;s++){
          add(`Полка ${i+1}${sections>1?'.'+(s+1):''}`, shelfW, shelfD, 1, { edge:'перед', edgeY: EA, group:'наполнение' })
        }
      }
      if(p.rear){
        add('Задняя стенка ДВП', p.W-6, p.H-6, 1, { material:'ДВП 3.2 мм', thickness:3.2, edge:'-', group:'корпус' })
      }
      // Фасады: ящики внизу, двери сверху
      if(p.drawers>0){
        const fW = p.W - 2*GAP_F
        for(let i=0;i<p.drawers;i++){
          add(`Фасад ящика ${i+1}`, fW, fz.drawerH, 1, { edge:'по периметру', edgeX: 2*EA, edgeY: 2*EA, group:'фасады' })
          const boxW = innerW - 26
          const boxD = p.D - 30
          const boxH = Math.max(40, Math.min(120, fz.drawerH - 30))
          add(`Боковина ящика ${i+1}`, boxD, boxH, 2, { group:'ящики' })
          add(`Перед/зад ящика ${i+1}`, boxW, boxH, 2, { group:'ящики' })
          add(`Дно ящика ${i+1} ДВП`, boxW+2*t, boxD, 1, { material:'ДВП 3.2 мм', thickness:3.2, group:'ящики' })
        }
      }
      for(let i=0;i<p.doors;i++){
        add(`Дверь ${i+1}`, fz.doorW, fz.doorH, 1, { edge:'по периметру', edgeX: 2*EA, edgeY: 2*EA, group:'фасады' })
      }
      break
    }
    case 'stoyka': {
      // Стеллаж открытый
      add('Стойка левая', p.D, p.H, 1, { edge:'2 длинных', edgeX: 2*EA, group:'корпус' })
      add('Стойка правая', p.D, p.H, 1, { edge:'2 длинных', edgeX: 2*EA, group:'корпус' })
      if(p.construction==='inset'){
        add('Крыша', innerW, p.D, 1, { edge:'перед', edgeY: EA, group:'корпус' })
        add('Дно', innerW, p.D, 1, { edge:'перед', edgeY: EA, group:'корпус' })
      }else{
        add('Крыша накладная', p.W, p.D, 1, { edge:'по периметру', edgeX: 2*EA, edgeY: 2*EA, group:'корпус' })
        add('Дно накладное', p.W, p.D, 1, { edge:'перед', edgeY: EA, group:'корпус' })
      }
      // Полки внутренние
      const shelfW = p.shelfMount === 'overlay' ? p.W - 2 : innerW - 2
      const shelfD = p.D - SHELF_INSET
      for(let i=0;i<p.shelves;i++){
        add(`Полка ${i+1}`, shelfW, shelfD, 1, { edge:'перед', edgeY: EA, group:'наполнение' })
      }
      if(p.rear){
        add('Задняя стенка ДВП / ХДФ', p.W-4, p.H-4, 1, { material:'ДВП 3.2 мм', thickness:3.2, edge:'-', group:'корпус' })
      }else{
        // для жёсткости — царги сзади
        add('Царга жесткости задняя верх', innerW, 100, 1, { edge:'-', group:'корпус', note:'под верхом' })
        add('Царга жесткости задняя низ', innerW, 100, 1, { edge:'-', group:'корпус' })
      }
      for(let i=0;i<p.partitions;i++){
        add(`Перегородка ${i+1}`, p.D-10, p.H-2*t, 1, { edge:'перед', edgeX: EA, group:'корпус' })
      }
      break
    }
    case 'stol': {
      // Стол
      const tableT = Math.max(t, 22) // столешница толще корпуса
      add('Столешница', p.W, p.D, 1, { thickness: tableT, edge:'по периметру', edgeX: 2*EA, edgeY: 2*EA, group:'корпус', note:'свес 20мм по бокам' })
      const legH = p.H - tableT
      const isLegs = p.tableSupport === 'legs'
      if(isLegs){
        // Металлические ножки — не в раскрое, только царги из ЛДСП
        add('Царга фронтальная', innerW, 120, 1, { edge:'-', group:'корпус', note:'под столешницей' })
        add('Царга задняя', innerW, 120, 1, { edge:'-', group:'корпус' })
        add('Царга боковая', p.D-40, 120, 2, { edge:'-', group:'корпус' })
      }else{
        // Опоры — боковины ЛДСП
        add('Боковина-опора левая', p.D-20, legH, 1, { edge:'2 длинных', edgeX: 2*EA, group:'корпус' })
        add('Боковина-опора правая', p.D-20, legH, 1, { edge:'2 длинных', edgeX: 2*EA, group:'корпус' })
        add('Царга фронтальная', innerW, 120, 1, { edge:'-', group:'корпус' })
        add('Царга задняя', innerW, 100, 1, { edge:'-', group:'корпус' })
        if(p.shelves>0){
          add('Полка подстольная', innerW-10, p.D-80, 1, { edge:'перед', edgeY: EA, group:'наполнение', note:'на 200мм от пола' })
        }
      }
      // Ящики для стола
      for(let i=0;i<p.drawers;i++){
        const fW = 400 // ширина ящика стола
        const fH = 140
        add(`Фасад ящика стола ${i+1}`, fW, fH, 1, { edge:'по периметру', edgeX: 2*EA, edgeY: 2*EA, group:'фасады' })
        add(`Боковина ящика стола ${i+1}`, p.D-80, 100, 2, { group:'ящики' })
        add(`Перед/зад ящика стола ${i+1}`, fW-26, 100, 2, { group:'ящики' })
        add(`Дно ящика стола ${i+1}`, fW, p.D-80, 1, { material:'ДВП 3.2 мм', thickness:3.2, group:'ящики' })
      }
      break
    }
    case 'polka': {
      // Настенная полка: простая доска или короб с боковинами
      if(p.polkaType === 'simple'){
        add('Полка', p.W, p.D, 1, { edge:'по периметру', edgeX: 2*EA, edgeY: 2*EA, group:'корпус', note:'крепёж: полкодержатель 2шт / скрытый менсолодержатель' })
        // Для длинных полок — ребро жёсткости
        if(p.W>800){
          add('Ребро жесткости', p.W-40, 80, 1, { edge:'-', group:'корпус', note:'под полкой сзади' })
        }
      }else{
        // полка-короб (навесной шкаф без дверей)
        add('Боковина левая', p.D, p.H, 1, { edge:'перед', edgeX: EA, group:'корпус' })
        add('Боковина правая', p.D, p.H, 1, { edge:'перед', edgeX: EA, group:'корпус' })
        add('Верх', innerW, p.D, 1, { edge:'перед', edgeY: EA, group:'корпус' })
        add('Низ', innerW, p.D, 1, { edge:'перед', edgeY: EA, group:'корпус' })
        const shelfW = p.shelfMount === 'overlay' ? p.W - 2 : innerW - 2
        for(let i=0;i<p.shelves;i++){
          add(`Полка ${i+1}`, shelfW, p.D-20, 1, { edge:'перед', edgeY: EA, group:'наполнение' })
        }
        if(p.rear) add('Задняя стенка ДВП', p.W-4, p.H-4, 1, { material:'ДВП 3.2 мм', thickness:3.2, edge:'-', group:'корпус' })
      }
      break
    }
  }

  // Общие расчёты
  const totalArea = parts.reduce((s,pt)=> s + (pt.w*pt.h*pt.count)/1e6, 0)
  const totalAreaCut = parts.reduce((s,pt)=> s + (pt.wCut*pt.hCut*pt.count)/1e6, 0)
  // Кромка: погонные метры
  let edgeM = 0
  parts.forEach(pt=>{
    if(pt.edge && pt.edge!=='-'){
      let perim = 0
      if(pt.edge.includes('по периметру')) perim = 2*(pt.w+pt.h)/1000
      else if(pt.edge.includes('перед')) perim = pt.w/1000
      else if(pt.edge.includes('2 длинных')) perim = 2*Math.max(pt.w,pt.h)/1000
      else perim = pt.w/1000
      edgeM += perim * pt.count
    }
  })

  return { parts, totalArea, totalAreaCut, edgeM, params: p }
}

function normalize(params){
  const t = clamp(num(params.t, 16), 3, 40)
  const materialKey = params.materialKey || 'ldsp16'
  const mat = getMaterial(materialKey, t)
  return {
    type: params.type || 'shkaf',
    H: clamp(num(params.H, 2000), 200, 3000),
    W: clamp(num(params.W, 800), 150, 3000),
    D: clamp(num(params.D, 520), 150, 900),
    t,
    materialKey,
    materialLabel: mat.label,
    sheetW: num(params.sheetW, mat.sheet[0]),
    sheetH: num(params.sheetH, mat.sheet[1]),
    rear: !!params.rear,
    base: !!params.base,
    construction: params.construction || 'inset',
    shelfMount: params.shelfMount || 'inner',
    shelves: clamp(params.shelves, 0, 20),
    doors: clamp(params.doors, 0, 6),
    drawers: clamp(params.drawers, 0, 8),
    partitions: clamp(params.partitions, 0, 4),
    gapFacade: clamp(num(params.gapFacade, 3), 0, 10),
    shelfInset: clamp(num(params.shelfInset, 20), 0, 50),
    edge: clamp(num(params.edge, 1), 0, 5), // 0 = без кромки, иначе припуск в мм
    tableSupport: params.tableSupport || 'panels',
    polkaType: params.polkaType || 'simple',
    priceM2: mat.priceM2
  }
}
