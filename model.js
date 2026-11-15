(function (scope) {
  'use strict';
  const positive = (n) => Number.isSafeInteger(n) && n > 0;
  function checked(n) {
    if (!Number.isSafeInteger(n) || n < 0) throw new Error('計算結果が扱える整数の上限を超えました。個数を減らしてください。');
    return n;
  }
  function validate(data) {
    if (!data || data.version !== 1 || !Array.isArray(data.items) || data.items.length > 300) throw new Error('対応するJSONは version: 1、アイテム300件以内です。');
    const map = new Map();
    for (const item of data.items) {
      if (!item || typeof item.id !== 'string' || !item.id || item.id.length > 100 || map.has(item.id)) throw new Error('アイテムIDが不正、または重複しています。');
      if (typeof item.name !== 'string' || !item.name.trim() || item.name.length > 100) throw new Error('アイテム名は1〜100文字で入力してください。');
      map.set(item.id, item);
    }
    for (const item of data.items) {
      if (item.recipe == null) continue;
      const r = item.recipe;
      if (!positive(r.output) || !Array.isArray(r.materials) || !r.materials.length || r.materials.length > 300) throw new Error(`${item.name}：完成個数と材料を正の整数で設定してください。`);
      const seen = new Set();
      for (const m of r.materials) {
        if (!m || !map.has(m.id) || !positive(m.quantity) || seen.has(m.id)) throw new Error(`${item.name}：材料の参照・個数・重複を確認してください。`);
        seen.add(m.id);
      }
    }
    const state = new Map(), order = [], path = [];
    function visit(id) {
      if (state.get(id) === 1) throw new Error('循環レシピ：' + [...path.slice(path.indexOf(id)), id].map(x => map.get(x).name).join(' → '));
      if (state.get(id) === 2) return;
      state.set(id, 1); path.push(id);
      for (const m of map.get(id).recipe?.materials || []) visit(m.id);
      path.pop(); state.set(id, 2); order.push(id);
    }
    for (const id of map.keys()) visit(id);
    return {map, order: order.reverse()};
  }
  function calculate(data, target, quantity) {
    const {map, order} = validate(data);
    if (!map.has(target)) throw new Error('作りたいアイテムを選択してください。');
    if (!positive(quantity)) throw new Error('完成希望個数は正の整数で入力してください。');
    const demand = new Map([[target, quantity]]), totals = new Map();
    for (const id of order) {
      const needed = demand.get(id) || 0;
      if (!needed) continue;
      const item = map.get(id), r = item.recipe;
      const crafts = r ? Math.floor((needed - 1) / r.output) + 1 : 0;
      const produced = r ? checked(crafts * r.output) : needed;
      totals.set(id, {id, name: item.name, needed, crafts, produced, surplus: produced - needed, raw: !r});
      for (const m of r?.materials || []) demand.set(m.id, checked((demand.get(m.id) || 0) + checked(crafts * m.quantity)));
    }
    // Allocate whole batches in tree order. Later branches use the shared surplus.
    const assigned = new Map(); let count = 0, truncated = false;
    function branch(id, needed) {
      if (++count > 2000) { truncated = true; return null; }
      const item = map.get(id), r = item.recipe, previous = assigned.get(id) || 0;
      assigned.set(id, checked(previous + needed));
      const ceil = n => n ? Math.floor((n - 1) / r.output) + 1 : 0;
      const crafts = r ? ceil(previous + needed) - ceil(previous) : 0;
      return {id, name: item.name, needed, crafts, raw: !r, children: r && crafts ? r.materials.map(m => branch(m.id, checked(crafts * m.quantity))).filter(Boolean) : []};
    }
    const tree = branch(target, quantity);
    return {tree, totals: [...totals.values()], truncated};
  }
  function sample() {
    return {version: 1, target: 'a', quantity: 3, items: [
      {id:'a', name:'完成品A', recipe:{output:1, materials:[{id:'b',quantity:2},{id:'c',quantity:3}]}},
      {id:'b', name:'中間素材B', recipe:{output:2, materials:[{id:'d',quantity:3}]}},
      {id:'c', name:'素材C', recipe:null}, {id:'d', name:'素材D', recipe:null}
    ]};
  }
  const api = {validate, calculate, sample, positive};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else scope.CraftModel = api;
})(globalThis);
