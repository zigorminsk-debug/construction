/**
 * Конструктор мебели — логика расчёта раскроя
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

/**
 * Основная функция расчёта
 * params = { type, H,W,D, t, materialKey, sheetW,sheetH, rear, base, construction, shelfMount, shelves, doors, drawers, partitions, gapFacade, shelfInset, edge, ... }
 */
export function calculate(params){
  const p = normalize(params)
  const t = p.t
  const GAP_F = p.gapFacade
  const SHELF_INSET = p.shelfInset
  const parts = []
  let id = 1
  const add = (name, w, h, count=1, opts={})=>{
    if(w<=0 || h<=0) return
    // кромка: прибавка уже учтена? размеры деталей указаны чистовые (без кромки), а для раскроя добавим припуск edge
    // здесь w,h - чистовые
    parts.push({
      id: id++,
      name,
      w: Math.round(w),
      h: Math.round(h),
      // для раскроя используем wCut/hCut с кромкой
      wCut: Math.round(w + (opts.edgeX||0)),
      hCut: Math.round(h + (opts.edgeY||0)),
      count,
      material: opts.material || p.materialLabel,
      thickness: opts.thickness ?? t,
      edge: opts.edge || '',
      note: opts.note || '',
      group: opts.group || 'корпус',
      // для сортировки
      area: Math.round(w*h)
    })
  }

  // общие величины
  const innerW_inset = p.W - 2*t
  const innerH_inset = p.H - 2*t // if inset top/bottom
  const innerW_overlay = p.W // if overlay, inner width still W-2t for shelves
  const innerW = p.construction === 'inset' ? innerW_inset : p.W - 2*t
  const sideH_inset = p.H
  const sideH_overlay = p.H - t // крыша сверху, дно снизу? упростим: боковины = H - t (если крыша накладная, дно между боковин)
  // для overlay: крыша и дно накладные: W x D, боковины H - t (дно между боковин, крыша сверху) либо H -2t если обе накладные
  // выберем вариант: overlay = обе накладные => боковины H-2t
  const sideH = p.construction === 'inset' ? p.H - (p.base?80:0) : p.H - 2*t - (p.base?0:0)
  // цоколь
  const baseH = p.base ? 80 : 0

  // type-specific
  switch(p.type){
    case 'shkaf': {
      // Боковины
      const sideHeight = p.construction === 'inset' ? p.H - baseH : p.H - 2*t - baseH // if base, боковины стоят на цоколе? упростим
      // Actually if base, боковины full height, цоколь - планка между ними спереди
      const sideH_final = p.H - baseH
      // Но чтобы не усложнять, делаем боковины H x D, а цоколь отдельной планкой
      // Пересмотрим: боковины всегда H x D (если без цоколя), если с цоколем - боковины H x D, цоколь внутри
      // Для простоты: боковины = H x D, крыша/дно между или сверху
      const bokH = p.H
      const bokD = p.D
      add('Боковина левая', bokD, bokH, 1, { edge: '2 длинных', group:'корпус', note: p.construction==='inset'?'паз под заднюю стенку 10мм':'' })
      add('Боковина правая', bokD, bokH, 1, { edge: '2 длинных', group:'корпус' })

      // Крыша и дно
      if(p.construction === 'inset'){
        add('Крыша', innerW, p.D, 1, { edge: 'перед', group:'корпус' })
        add('Дно', innerW, p.D, 1, { edge: 'перед', group:'корпус' })
      }else{
        add('Крыша накладная', p.W, p.D, 1, { edge: 'по периметру', group:'корпус' })
        add('Дно накладное', p.W, p.D, 1, { edge: 'перед', group:'корпус' })
      }

      // Цоколь
      if(p.base){
        add('Цоколь фронтальный', innerW, 80, 1, { edge: 'перед', group:'корпус', note:'отступ 20мм от фасада' })
        // боковые цоколи опционально
        // add('Цоколь боковой', p.D-20, 80, 2, { group:'корпус'})
      }

      // Перегородка вертикальная
      if(p.partitions>0){
        for(let i=0;i<p.partitions;i++){
          const partH = p.construction==='inset' ? p.H - 2*t - baseH : p.H - 2*t - baseH
          // Actually перегородка между крышей и дном
          const h = p.H - 2*t - baseH
          add(`Перегородка ${i+1}`, p.D - 10, h, 1, { edge:'перед', group:'корпус' })
        }
      }

      // Полки
      // Если есть перегородки, ширина полки делится
      const sections = p.partitions + 1
      const shelfW_full = innerW - GAP_F // minus gaps
      const shelfW = sections>1 ? Math.floor((innerW - p.partitions*t)/sections) - 2 : innerW - 4 // -2 зазор с каждой стороны, -20 от фасада по глубине
      const shelfD = p.D - SHELF_INSET - (p.rear? 4:0) // отступ от задней стенки
      for(let i=0;i<p.shelves;i++){
        if(sections>1){
          // по полке в каждую секцию
          for(let s=0;s<sections;s++){
            add(`Полка ${i+1}.${s+1}`, shelfW, shelfD, 1, { edge:'перед', group:'наполнение' })
          }
        }else{
          add(`Полка ${i+1}`, shelfW, shelfD, 1, { edge:'перед', group:'наполнение' })
        }
      }

      // Задняя стенка ДВП
      if(p.rear){
        const rearW = p.W - 6
        const rearH = p.H - baseH - 6
        add('Задняя стенка ДВП', rearW, rearH, 1, { material: 'ДВП 3.2 мм', thickness: 3.2, edge:'-', group:'корпус', note: 'в паз 10мм или накладная на гвозди' })
      }

      // Двери
      if(p.doors>0){
        const doorGap = GAP_F
        const totalGap = doorGap * (p.doors + 1)
        const doorW = (p.W - totalGap)/p.doors
        const doorH = p.H - baseH - doorGap*2
        // если цоколь есть, дверь выше цоколя
        for(let i=0;i<p.doors;i++){
          add(`Дверь ${i+1} фасад`, doorW, doorH, 1, { material: p.materialLabel, thickness: t, edge:'по периметру', group:'фасады', note:'зазор 3мм, петля накладная 35мм' })
        }
      }

      // Ящики (шуфлядки)
      if(p.drawers>0){
        // Ящики внизу, под полками/дверями. Высота фасада ящика
        // Если есть двери, ящики - внутренние или фасадные? Сделаем фасадные ящики внизу шкафа, двери выше или наоборот?
        // Упростим: ящики занимают нижнюю часть корпуса высотой drawers * 180 + gaps
        const drawerSectionH = p.drawers * 180 + (p.drawers+1)*GAP_F // estimate
        // Но для фасадов ящиков: делим высоту
        const availableH_forDrawers = Math.min(drawerSectionH, p.H*0.45) // limit
        const facadeH = (availableH_forDrawers - (p.drawers+1)*GAP_F)/p.drawers
        const facadeW = innerW + 2*t - (p.doors>0? 0 : 2*GAP_F) // actually фасад ящика = ширина корпуса - зазоры
        // корректнее: facadeW = p.W - 2*GAP_F
        const fW = p.W - 2*GAP_F
        for(let i=0;i<p.drawers;i++){
          add(`Фасад ящика ${i+1}`, fW, facadeH, 1, { edge:'по периметру', group:'фасады', note:'зазор 3мм' })
          // Короб ящика: 2 боковины, перед/зад, дно ДВП
          const boxW = fW - 40 // минус направляющие 13мм с каждой + зазор
          const boxD = p.D - 40
          const boxH = 120 // высота боковины ящика (зависит от фасада, но фиксируем 120)
          // Боковины ящика
          add(`Боковина ящика ${i+1} L/R`, boxD, boxH, 2, { material: p.materialLabel, thickness: t, edge:'-', group:'ящики', note:'сверление под направляющие' })
          add(`Перед/зад ящика ${i+1}`, boxW - 2*t, boxH, 2, { material: p.materialLabel, thickness: t, edge:'-', group:'ящики' })
          add(`Дно ящика ${i+1} ДВП`, boxW, boxD, 1, { material:'ДВП 3.2 мм', thickness:3.2, edge:'-', group:'ящики', note:'в паз 6мм' })
        }
      }

      break
    }
    case 'tumba': {
      // Тумба: высота 400-800, ширина любая, глубина 350-520
      const Ht = Math.min(p.H, 900)
      add('Боковина левая', p.D, Ht, 1, { edge:'2 длинных', group:'корпус' })
      add('Боковина правая', p.D, Ht, 1, { edge:'2 длинных', group:'корпус' })
      if(p.construction==='inset'){
        add('Крыша', innerW, p.D, 1, { edge:'перед', group:'корпус' })
        add('Дно', innerW, p.D, 1, { edge:'перед', group:'корпус' })
      }else{
        add('Крыша накладная', p.W, p.D, 1, { edge:'по периметру', group:'корпус' })
        add('Дно накладное', innerW, p.D, 1, { edge:'перед', group:'корпус' })
      }
      if(p.base){
        add('Цоколь', innerW, 60, 1, { edge:'перед', group:'корпус' })
      }
      if(p.partitions>0){
        for(let i=0;i<p.partitions;i++){
          add(`Перегородка ${i+1}`, p.D-10, Ht-2*t- (p.base?60:0), 1, { edge:'перед', group:'корпус' })
        }
      }
      // Полки
      const sections = p.partitions+1
      const shelfW = sections>1 ? Math.floor((innerW - p.partitions*t)/sections)-2 : innerW -4
      const shelfD = p.D - SHELF_INSET
      for(let i=0;i<p.shelves;i++){
        for(let s=0;s<sections;s++){
          add(`Полка ${i+1}${sections>1?'.'+(s+1):''}`, shelfW, shelfD, 1, { edge:'перед', group:'наполнение' })
        }
      }
      if(p.rear){
        add('Задняя стенка ДВП', p.W-6, Ht-6, 1, { material:'ДВП 3.2 мм', thickness:3.2, edge:'-', group:'корпус' })
      }
      // Фасады: двери или ящики
      if(p.doors>0 && p.drawers===0){
        const doorW = (p.W - (p.doors+1)*GAP_F)/p.doors
        const doorH = Ht - (p.base?60:0) - 2*GAP_F
        for(let i=0;i<p.doors;i++) add(`Дверь ${i+1}`, doorW, doorH, 1, { edge:'по периметру', group:'фасады' })
      }else if(p.drawers>0){
        // Тумба с ящиками: делим высоту на ящики
        const availH = Ht - (p.base?60:0) - (p.drawers+1)*GAP_F
        const fH = availH / p.drawers
        const fW = p.W - 2*GAP_F
        for(let i=0;i<p.drawers;i++){
          add(`Фасад ящика ${i+1}`, fW, fH, 1, { edge:'по периметру', group:'фасады' })
          const boxW = innerW - 26
          const boxD = p.D - 30
          const boxH = Math.min(120, fH-30)
          add(`Боковина ящика ${i+1}`, boxD, boxH, 2, { group:'ящики' })
          add(`Перед/зад ящика ${i+1}`, boxW, boxH, 2, { group:'ящики' })
          add(`Дно ящика ${i+1} ДВП`, boxW+2*t, boxD, 1, { material:'ДВП 3.2 мм', thickness:3.2, group:'ящики' })
        }
        // Если и двери и ящики: двери сверху, ящики снизу - сложно, пока только ящики
        if(p.doors>0){
          // add doors on top section: половина высоты?
        }
      }else{
        // открытая тумба без фасадов - ничего
      }
      break
    }
    case 'stoyka': {
      // Стеллаж открытый
      add('Стойка левая', p.D, p.H, 1, { edge:'2 длинных', group:'корпус' })
      add('Стойка правая', p.D, p.H, 1, { edge:'2 длинных', group:'корпус' })
      if(p.construction==='inset'){
        add('Крыша', innerW, p.D, 1, { edge:'перед', group:'корпус' })
        add('Дно', innerW, p.D, 1, { edge:'перед', group:'корпус' })
      }else{
        add('Крыша накладная', p.W, p.D, 1, { edge:'по периметру', group:'корпус' })
        add('Дно накладное', p.W, p.D, 1, { edge:'перед', group:'корпус' })
      }
      // Полки внутренние + maybe дополнительные
      const shelfW = innerW - 2
      const shelfD = p.D - SHELF_INSET
      for(let i=0;i<p.shelves;i++){
        add(`Полка ${i+1}`, shelfW, shelfD, 1, { edge:'перед', group:'наполнение' })
      }
      if(p.rear){
        add('Задняя стенка ДВП / ХДФ', p.W-4, p.H-4, 1, { material:'ДВП 3.2 мм', thickness:3.2, group:'корпус' })
        // или крестовина жесткости
      }else{
        // для жесткости - царга/планка сзади
        add('Царга жесткости задняя', innerW, 100, 1, { edge:'-', group:'корпус', note:'под верхом' })
        add('Царга жесткости задняя низ', innerW, 100, 1, { edge:'-', group:'корпус' })
      }
      if(p.partitions>0){
        for(let i=0;i<p.partitions;i++) add(`Перегородка ${i+1}`, p.D-10, p.H-2*t, 1, { group:'корпус' })
      }
      break
    }
    case 'stol': {
      // Стол
      const tableT = Math.max(t, 22) // столешница толще
      // Столешница всегда накладная
      add('Столешница', p.W, p.D, 1, { thickness: tableT, edge:'по периметру', group:'корпус', note:'свес 20мм по бокам' })
      const legH = p.H - tableT
      const isLegs = p.tableSupport === 'legs'
      if(isLegs){
        // 4 ножки - если из материала, делаем боковины-ножки 2 шт + царги. Иначе металл - не считаем.
        // Даём опцию: ножки из ЛДСП 2 шт + царга
        // Пока делаем царги
        add('Царга фронтальная', innerW, 120, 1, { edge:'-', group:'корпус', note:'под столешницей' })
        add('Царга задняя', innerW, 120, 1, { edge:'-', group:'корпус' })
        add('Царга боковая', p.D-40, 120, 2, { edge:'-', group:'корпус' })
        // Ножки металлические - не в раскрое, но показываем в смете
      }else{
        // Опоры - боковины ЛДСП
        add('Боковина-опора левая', p.D-20, legH, 1, { edge:'2 длинных', group:'корпус' })
        add('Боковина-опора правая', p.D-20, legH, 1, { edge:'2 длинных', group:'корпус' })
        add('Царга фронтальная', innerW, 120, 1, { edge:'-', group:'корпус' })
        add('Царга задняя', innerW, 100, 1, { edge:'-', group:'корпус' })
        if(p.shelves>0){
          add('Полка подстольная', innerW-10, p.D-80, 1, { edge:'перед', group:'наполнение', note:'на 200мм от пола' })
        }
      }
      // Ящики для стола
      if(p.drawers>0){
        const fW = 400 // ширина ящика
        const fH = 140
        for(let i=0;i<p.drawers;i++){
          add(`Фасад ящика стола ${i+1}`, fW, fH, 1, { edge:'по периметру', group:'фасады' })
          add(`Боковина ящика стола ${i+1}`, p.D-80, 100, 2, { group:'ящики' })
          add(`Перед/зад ящика стола ${i+1}`, fW-26, 100, 2, { group:'ящики' })
          add(`Дно ящика стола ${i+1}`, fW, p.D-80, 1, { material:'ДВП 3.2 мм', thickness:3.2, group:'ящики' })
        }
      }
      if(p.rear && !isLegs){
        // задняя стенка не нужна
      }
      break
    }
    case 'polka': {
      // Настенная полка: одна доска + возможно боковины/крепёж
      // Варианты: простая полка, полка с боковинами (как маленький стеллаж)
      if(p.polkaType === 'simple'){
        add('Полка', p.W, p.D, 1, { edge:'по периметру', group:'корпус', note:'крепёж: полкодержатель 2шт / скрытый менсолодержатель' })
        // Для длинных полок - ребро жесткости
        if(p.W>800){
          add('Ребро жесткости', p.W-40, 80, 1, { edge:'-', group:'корпус', note:'под полкой сзади' })
        }
      }else{
        // полка с боковинами (навесной шкаф без дверей)
        add('Боковина левая', p.D, p.H, 1, { edge:'перед', group:'корпус' })
        add('Боковина правая', p.D, p.H, 1, { edge:'перед', group:'корпус' })
        add('Верх', innerW, p.D, 1, { edge:'перед', group:'корпус' })
        add('Низ', innerW, p.D, 1, { edge:'перед', group:'корпус' })
        if(p.shelves>0){
          for(let i=0;i<p.shelves;i++) add(`Полка ${i+1}`, innerW-2, p.D-20, 1, { edge:'перед', group:'наполнение' })
        }
        if(p.rear) add('Задняя стенка ДВП', p.W-4, p.H-4, 1, { material:'ДВП 3.2 мм', thickness:3.2, group:'корпус' })
      }
      break
    }
  }

  // Общие расчёты
  const totalArea = parts.reduce((s,p)=> s + (p.w*p.h*p.count)/1e6, 0)
  const totalAreaCut = parts.reduce((s,p)=> s + (p.wCut*p.hCut*p.count)/1e6, 0)
  // Кромка: считаем погонные метры
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
  const t = Number(params.t) || 16
  const materialKey = params.materialKey || 'ldsp16'
  const mat = getMaterial(materialKey, t)
  return {
    type: params.type || 'shkaf',
    H: clamp(Number(params.H)||2000, 200,3000),
    W: clamp(Number(params.W)||800, 150,3000),
    D: clamp(Number(params.D)||520, 150,900),
    t,
    materialKey,
    materialLabel: mat.label,
    sheetW: Number(params.sheetW)|| mat.sheet[0],
    sheetH: Number(params.sheetH)|| mat.sheet[1],
    rear: !!params.rear,
    base: !!params.base,
    construction: params.construction || 'inset',
    shelfMount: params.shelfMount || 'inner',
    shelves: clamp(Number(params.shelves)||0,0,20),
    doors: clamp(Number(params.doors)||0,0,6),
    drawers: clamp(Number(params.drawers)||0,0,8),
    partitions: clamp(Number(params.partitions)||0,0,4),
    gapFacade: Number(params.gapFacade)||3,
    shelfInset: Number(params.shelfInset)||20,
    edge: Number(params.edge)||1,
    tableSupport: params.tableSupport || 'panels',
    polkaType: params.polkaType || 'simple',
    priceM2: mat.priceM2
  }
}
function clamp(v,min,max){ return Math.max(min, Math.min(max,v)) }

// Экспорт для тестов
export function estimateMaterial(parts, sheetW, sheetH){
  // грубая оценка листов
  const sheetArea = sheetW*sheetH/1e6
  let total = 0
  parts.forEach(p=>{ if(p.thickness>=8) total+= p.wCut*p.hCut*p.count/1e6 })
  return { sheets: Math.ceil(total / sheetArea * 1.08), totalArea: total, sheetArea }
}
