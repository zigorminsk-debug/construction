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

// ===== Пользовательские материалы («мой материал — свой размер листа») =====
// Элемент: { id, label, t, sheet: [W, H], priceM2 }
export const CUSTOM_MATS = []
export function setCustomMats(list){ CUSTOM_MATS.length = 0; (list || []).forEach(m=> CUSTOM_MATS.push(m)) }
export function getCustomMats(){ return [...CUSTOM_MATS] }

export function getMaterial(key, customT){
  if(key && key.startsWith('custom:')){
    const i = Number(key.slice(7))
    const c = CUSTOM_MATS[i]
    if(c) return { label: c.label, t: c.t, sheet: c.sheet, priceM2: c.priceM2, custom: true }
  }
  const m = MATERIALS[key] || MATERIALS.ldsp16
  return { ...m, t: customT || m.t }
}

/**
 * Квадратные (прямоугольные) трубы для металлической рамы.
 * a×b — сечение, wall — толщина стенки, kgm — вес 1 м, price — цена $/м
 */
export const METAL_PROFILES = {
  '20x20': { a: 20, b: 20, wall: 1.5, kgm: 0.87, price: 4.5 },
  '30x30': { a: 30, b: 30, wall: 2,   kgm: 1.76, price: 6.0 },
  '40x20': { a: 40, b: 20, wall: 2,   kgm: 1.76, price: 6.5 },
  '40x40': { a: 40, b: 40, wall: 2,   kgm: 2.39, price: 8.5 },
  '50x25': { a: 50, b: 25, wall: 2,   kgm: 2.23, price: 7.5 },
  '60x30': { a: 60, b: 30, wall: 2,   kgm: 2.70, price: 9.5 },
}
export const DEFAULT_METAL_PROFILE = '40x20'

export function getMetalProfile(key, customWall){
  const pr = METAL_PROFILES[key] || METAL_PROFILES[DEFAULT_METAL_PROFILE]
  return { ...pr, wall: customWall || pr.wall }
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

  // Металл (профтруба) — общая функция для любых типов (каркас корпуса)
  const addMetal = (name, len, count=1, prof, note='')=>{
    if(len<=0 || !count) return
    parts.push({
      id: id++,
      name, w: Math.round(len), h: 0, wCut: Math.round(len), hCut: 0,
      count, material: `Профиль ${prof.a}×${prof.b}×${prof.wall}`, thickness: prof.wall, edge: '',
      note, group: 'рама', kind: 'metal', section: `${prof.a}×${prof.b}×${prof.wall}`,
      kgm: prof.kgm, priceM: prof.price, area: 0
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

      // Металлический каркас (профтруба): 4 стойки + нижние рамы
      if(p.metalFrame){
        const prof = p._frameProfile
        addMetal('Стойка каркаса', p.H, 4, prof, '4 угла, полная высота H')
        addMetal('Рама нижняя', p.W - 2*prof.a, 2, prof, 'фронт + бэк, стягивает стойки снизу')
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
      if(p.metalFrame){
        const prof = p._frameProfile
        addMetal('Стойка каркаса', Ht, 4, prof, '4 угла, полная высота')
        addMetal('Рама нижняя', p.W - 2*prof.a, 2, prof, 'фронт + бэк, стягивает стойки снизу')
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
      if(p.metalFrame){
        const prof = p._frameProfile
        addMetal('Стойка каркаса', p.H, 4, prof, '4 угла, полная высота H')
        addMetal('Рама нижняя', p.W - 2*prof.a, 2, prof, 'фронт + бэк, стягивает стойки снизу')
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
      // Металлический каркас (профтруба): стойки-ножки под столешницу + нижние рамы
      if(p.metalFrame && isLegs){
        const prof = p._frameProfile
        addMetal('Стойка каркаса', Math.max(100, p.H - tableT), 4, prof, '4 угла, под столешницей')
        addMetal('Рама нижняя', p.W - 2*prof.a, 2, prof, 'фронт + бэк, стягивает стойки снизу')
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
        // Металлический каркас (профтруба) для полки-короба
        if(p.metalFrame){
          const prof = p._frameProfile
          addMetal('Стойка каркаса', p.H, 4, prof, '4 угла, полная высота')
          addMetal('Рама нижняя', p.W - 2*prof.a, 2, prof, 'фронт + бэк, стягивает стойки снизу')
        }
      }
      break
    }
    case 'metal': {
      // ===== Металлическая рама из прямоугольного профиля =====
      const prof = getMetalProfile(p.metalProfile, p.metalWall)
      const pw = prof.a, ph = prof.b
      const L = clamp(Number(p.metalLevels)||3, 2, 6)
      const nDiv = clamp(Number(p.metalDividers)||0, 0, 4)
      const matLabel = `Профиль ${pw}×${ph}×${prof.wall}`
      const addM = (name, len, count, opts={})=>{
        if(len<=0 || !count) return
        parts.push({
          id: id++,
          name, w: Math.round(len), h: 0, wCut: Math.round(len), hCut: 0,
          count, material: matLabel, thickness: prof.wall, edge: '',
          note: opts.note || '', group: opts.group || 'рама',
          kind: 'metal', section: `${pw}×${ph}×${prof.wall}`,
          kgm: prof.kgm, priceM: prof.price,
          area: 0
        })
      }
      // Стойки — 4 по углам, полная высота
      addM('Стойка', p.H, 4, { note: '4 угла, полная высота H' })
      // Рамы на каждом уровне: фронт/бэк (W - 2pw) и боковые (D - 2ph)
      addM('Рама фронт/бэк', p.W - 2*pw, 2*L, { note: 'по 2 на уровень (фасад + зад)' })
      addM('Рама боковая', p.D - 2*ph, 2*L, { note: 'по 2 на уровень (лево + право)' })
      // Перегородки
      if(nDiv>0){
        addM('Перегородка', p.H - 2*pw, nDiv, { note: 'по всей высоте между рамами' })
      }
      // Листовые полки на уровнях (кроме верхнего)
      if(p.metalShelves){
        const cols = nDiv + 1
        const cW = Math.floor((p.W - 2*pw - nDiv*ph) / cols) - 2
        const shH = p.D - 2*ph - 2
        add('Полка', cW, shH, (L-1)*cols, { edge:'-', group:'наполнение', note:'на '+(L-1)+' уровнях'+(nDiv>0?', по секциям':'') })
      }
      // Задняя стенка
      if(p.metalRear){
        add('Задняя стенка ДВП', p.W - 2*pw - 4, p.H - 2*pw - 4, 1, { material:'ДВП 3.2 мм', thickness:3.2, edge:'-', group:'корпус' })
      }
      break
    }
  }

  // ===== Максимальная нагрузка на полку (изгиб + прогиб L/350) =====
  // «Верх» изделия «Полка» (короб) — тоже несущая полка
  parts.forEach(pt=>{
    if(pt.h > 0 && pt.kind !== 'metal' && (pt.name.startsWith('Полка') || (pt.name === 'Верх' && p.type === 'polka'))){
      const kg = shelfLoadKg(pt.thickness, pt.w, pt.h, pt.material)
      if(kg){
        pt.maxLoad = kg
        pt.note = `${pt.note ? pt.note + '; ' : ''}макс. нагрузка ≤ ${kg} кг (пролёт ${pt.w} мм, ${pt.thickness} мм, ${pt.material})`
      }
    }
  })

  // ===== Авторазрез: деталь больше листа → режем на сегменты + узел стыковки =====
  const splitMap = {}
  if(p.type !== 'metal'){
    splitOversized(parts, p.sheetW, p.sheetH, splitMap)
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

  return { parts, totalArea, totalAreaCut, edgeM, params: p, splitMap }
}

/**
 * Деталь, не влезает в лист (в обоих ориентациях) → режем по длинной стороне
 * (и по короткой, если та тоже больше листа) на N сегментов.
 * Результат — детали «Имя 1/N», «Имя 2/N» + заметка о стыковке;
 * splitMap[Имя] = { total, longAxis, longN, shortN, longSizes, shortSizes, origW, origH }
 * (для сборки/крепёжа в joinery.js). Детали с count>1 не режем (у них своя раскладка).
 */
function splitOversized(parts, sheetW, sheetH, splitMap){
  const S = Math.max(sheetW, sheetH), T = Math.min(sheetW, sheetH)
  let seq = 10000
  for(let i = parts.length - 1; i >= 0; i--){
    const p = parts[i]
    if(p.kind === 'metal' || p.count !== 1 || !p.h || p.h <= 0) continue
    const w = p.w, h = p.h
    const longAxis = h >= w ? 'h' : 'w'
    const long = Math.max(w, h), short = Math.min(w, h)
    const longN = long > S ? Math.ceil(long / S) : 1
    const shortN = short > T ? Math.ceil(short / T) : 1
    if(longN === 1 && shortN === 1) continue
    const N = longN * shortN
    const mkSizes = (len, n)=>{
      const base = Math.floor(len / n), rem = len % n
      const arr = []
      for(let k = 0; k < n; k++) arr.push(base + (k < rem ? 1 : 0))
      return arr
    }
    const longSizes = mkSizes(long, longN)
    const shortSizes = mkSizes(short, shortN)
    const t = p.thickness || 16
    const dD = t >= 12 ? 8 : 6
    const dL = Math.max(30, Math.round(t * 3 / 10) * 10)
    const sL = Math.max(30, Math.round((t * 2 + 8) / 10) * 10)
    const edgeNote = (p.edge && p.edge !== '-') ? `; кромка — только на внешних гранях (было: ${p.edge}), на стыке — необработанная` : ''
    const cutPositions = []
    const newParts = []
    let idx = 0
    for(let li = 0; li < longN; li++){
      let longOff = 0
      for(let k = 0; k < li; k++) longOff += longSizes[k]
      if(li > 0) cutPositions.push(String(Math.round(longOff)))
      for(let si = 0; si < shortN; si++){
        let shortOff = 0
        for(let k = 0; k < si; k++) shortOff += shortSizes[k]
        const pw = longAxis === 'h' ? (shortN > 1 ? shortSizes[si] : w) : longSizes[li]
        const ph = longAxis === 'h' ? longSizes[li] : (shortN > 1 ? shortSizes[si] : h)
        newParts.push({
          ...p,
          id: seq++,
          name: `${p.name} ${idx + 1}/${N}`,
          w: pw, h: ph, wCut: pw, hCut: ph,
          edge: '-',
          note: `${p.note}; СТЫК: стыковка торцов, шкант Ø${dD}×${dL} ×2 + саморез Ø4×${sL} ×1, клей${edgeNote}`,
          area: Math.round(pw * ph),
          splitInfo: {
            total: N, index: idx, baseName: p.name,
            longAxis, longN, shortN,
            longSize: longSizes[li], longOff,
            shortSize: shortSizes[si], shortOff,
            origW: w, origH: h, origEdge: p.edge || ''
          }
        })
        idx++
      }
    }
    parts.splice(i, 1, ...newParts)
    splitMap[p.name] = { total: N, longAxis, longN, shortN, longSizes, shortSizes, origW: w, origH: h }
  }
}

// Модуль упругости E, МПа, и допустимое напряжение изгиба, МПа — по базовому материалу
const SHELF_E   = { 'ЛДСП': 3800, 'МДФ': 4200, 'Фанера': 9000, 'ОСП': 4500, 'OSB': 4500, 'ДСП': 3400 }
const SHELF_SIG = { 'ЛДСП': 9,    'МДФ': 10,   'Фанера': 22,   'ОСП': 8,    'OSB': 8,    'ДСП': 7 }

/**
 * Максимальная нагрузка на полку, кг.
 * Полка — балка на двух опорах, распределённая нагрузка:
 *  - прогиб ≤ L/350:  P = 384·E·I / (1750·L²)
 *  - прочность изгиба: P = 16·I·[σ] / (t·L)
 * I = b·t³/12, где L — пролёт (ширина полки), b — ширина поперёк (глубина).
 * Возвращает меньшее из двух, округлённое в меньшую сторону (кг).
 */
export function shelfLoadKg(t, L, b, label){
  if(!(t > 0) || !(L > 200) || !(b > 0)) return null
  let base = null
  for(const k of Object.keys(SHELF_E)){
    if(label && label.includes(k)){ base = k; break }
  }
  const E = base ? SHELF_E[base] : 3800
  const sig = base ? SHELF_SIG[base] : 9
  const I = b * Math.pow(t, 3) / 12
  const pDefl = 384 * E * I / (1750 * L * L) / 9.81   // N → кг
  const pSig = 16 * I * sig / (t * L) / 9.81
  const kg = Math.min(pDefl, pSig)
  if(!(kg > 0) || !isFinite(kg)) return null
  return Math.max(0.5, Math.floor(kg * 10) / 10)
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
    priceM2: mat.priceM2,
    // металлическая рама
    metalProfile: params.metalProfile || '40x20',
    metalWall: Number(params.metalWall) || 0,
    metalLevels: clamp(Number(params.metalLevels)||3, 2, 6),
    metalDividers: clamp(Number(params.metalDividers)||0, 0, 4),
    metalShelves: params.metalShelves !== false,
    metalRear: !!params.metalRear,
    _profile: getMetalProfile(params.metalProfile || '40x20', Number(params.metalWall) || 0),
    // каркас из профтрубы для корпусной мебели
    metalFrame: !!params.metalFrame,
    frameProfile: params.frameProfile || '40x20',
    frameWall: Number(params.frameWall) || 0,
    _frameProfile: getMetalProfile(params.frameProfile || '40x20', Number(params.frameWall) || 0)
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
