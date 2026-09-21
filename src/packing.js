/**
 * Простой алгоритм раскроя — укладка прямоугольников на листы (Guillotine / Shelf)
 * Учитывает припуск на пропил 3мм, поворот деталей если выгодно
 */

const KERF = 3 // пропил

export function packParts(parts, sheetW, sheetH){
  // ДВП / тонкий лист — отдельный раскрой, остальное — основной материал
  const isDvp = p => p.material.includes('ДВП') || p.thickness < 5
  const mainParts = parts.filter(p => !isDvp(p))
  const dvpParts = parts.filter(isDvp)

  // разворачиваем count в отдельные экземпляры
  const expand = (list) => {
    const out=[]
    list.forEach(p=>{
      for(let i=0;i<p.count;i++){
        out.push({
          ...p,
          instance: i+1,
          label: p.count>1 ? `${p.name} #${i+1}` : p.name,
          w: p.wCut,
          h: p.hCut,
          origW: p.w,
          origH: p.h,
        })
      }
    })
    return out
  }

  const sheetsMain = packList(expand(mainParts), sheetW, sheetH, 'ЛДСП')
  const sheetsDvp = dvpParts.length ? packList(expand(dvpParts), sheetW, sheetH, 'ДВП') : []

  return { sheetsMain, sheetsDvp, totalSheets: sheetsMain.length + sheetsDvp.length }
}

function packList(items, sheetW, sheetH, groupLabel){
  if(!items.length) return []
  // сортировка по убыванию высоты, затем ширины, затем площади
  items.sort((a,b)=> (b.h - a.h) || (b.w - a.w) || (b.w*b.h - a.w*a.h))

  const sheets = []
  let sheetIndex = 1

  // Shelf algorithm: строки
  let currentSheet = newSheet(sheetIndex++, sheetW, sheetH, groupLabel)
  sheets.push(currentSheet)

  for(const item of items){
    let placed = false
    // пробуем разместить на существующих листах
    for(const sh of sheets){
      if(tryPlace(sh, item)){
        placed = true
        break
      }
    }
    if(!placed){
      // создаём новый лист
      const sh = newSheet(sheetIndex++, sheetW, sheetH, groupLabel)
      sheets.push(sh)
      // пробуем разместить (с поворотом если нужно)
      if(!tryPlace(sh, item)){
        // если деталь больше листа - всё равно кладём с выходом за границы (пометим)
        sh.items.push({
          ...item,
          x: 0, y: 0, w: item.w, h: item.h,
          overflow: true,
          rotated: false
        })
        sh.usedArea += item.w*item.h
      }
    }
  }

  // посчитать статистику по каждому листу
  sheets.forEach(sh=>{
    sh.usedArea = sh.items.reduce((s,it)=> s + it.w*it.h, 0)
    sh.waste = sh.area - sh.usedArea
    sh.efficiency = sh.area ? (sh.usedArea/sh.area*100) : 0
    // обрезки
  })

  return sheets
}

function newSheet(index, W, H, label){
  return {
    index,
    W, H,
    area: W*H,
    label,
    items: [],
    shelves: [], // rows
    usedArea: 0,
    waste: 0,
    efficiency: 0,
    // для алгоритма shelf
    curY: 0,
    curRowHeight: 0,
    curX: 0,
  }
}

function tryPlace(sheet, item){
  const kerf = KERF
  // пробуем без поворота и с поворотом, выбираем лучший вариант (минимальный остаток)
  // сначала пытаемся в существующие полки (shelves)
  // shelf: y, height, x (current X)
  // Если не помещается в существующую полку, создаём новую

  // Попытка разместить в существующих полках (shelves)
  for(const shelf of sheet.shelves){
    // пробуем без поворота
    if(item.w + kerf <= sheet.W - shelf.x && item.h <= shelf.h){
      // поместится
      item.x = shelf.x
      item.y = shelf.y
      item.rotated = false
      shelf.x += item.w + kerf
      sheet.items.push({...item, x:item.x, y:item.y, rotated:false})
      return true
    }
    // пробуем с поворотом
    if(item.h + kerf <= sheet.W - shelf.x && item.w <= shelf.h){
      item.x = shelf.x
      item.y = shelf.y
      item.rotated = true
      const w = item.h, h = item.w
      shelf.x += w + kerf
      sheet.items.push({...item, x:item.x, y:item.y, w, h, rotated:true})
      return true
    }
  }

  // Не поместилось в существующие полки — пробуем создать новую полку
  // Высота полки = высота детали (или с поворотом — выбираем ориентацию с минимальной высотой чтобы экономить)
  // Нужно проверить два варианта ориентации и выбрать тот, который даёт минимальную высоту полки и помещается по ширине

  // Вариант A: без поворота
  const hA = item.h
  const wA = item.w
  const fitsA = wA <= sheet.W && sheet.curY + hA <= sheet.H

  // Вариант B: с поворотом
  const hB = item.w
  const wB = item.h
  const fitsB = wB <= sheet.W && sheet.curY + hB <= sheet.H

  if(!fitsA && !fitsB) return false

  // выбираем ориентацию с меньшей высотой (чтобы больше полок влезло), либо если одна не помещается
  let useRotated = false
  if(fitsA && fitsB){
    // выбираем ту что уже, но если ширина одинаковая - менее высокая
    // эвристика: меньшая высота лучше, но если ширина сильно меньше - тоже хорошо
    // просто берём меньшую высоту
    useRotated = hB < hA
    // но если повёрнутая сильно уже, можно тоже
    // небольшая хитрость: если деталь почти квадратная, не вращать
    if(Math.abs(hA - hB) < 20) useRotated = false
  }else if(fitsB){
    useRotated = true
  }

  const newH = useRotated ? hB : hA
  const newW = useRotated ? wB : wA

  // создаём новую полку
  const shelf = {
    y: sheet.curY,
    h: newH,
    x: newW + kerf // уже занято первым элементом
  }
  sheet.shelves.push(shelf)
  sheet.curY += newH + kerf
  sheet.curRowHeight = newH

  sheet.items.push({
    ...item,
    x: 0,
    y: shelf.y,
    w: newW,
    h: newH,
    rotated: useRotated
  })
  return true
}

// Вспомогательная функция для получения SVG раскроя
export function getPackStats(sheets){
  const totalArea = sheets.reduce((s,sh)=> s+sh.area,0)/1e6
  const usedArea = sheets.reduce((s,sh)=> s+sh.usedArea,0)/1e6
  return {
    sheets: sheets.length,
    totalArea: totalArea.toFixed(2),
    usedArea: usedArea.toFixed(2),
    waste: (totalArea-usedArea).toFixed(2),
    eff: totalArea? (usedArea/totalArea*100).toFixed(1):0
  }
}
