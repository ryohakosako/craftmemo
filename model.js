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
    return calculateGraph(map, order, target, quantity);
  }
  function calculateGraph(map, order, target, quantity) {
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
  function validateProject(data) {
    if (!data || data.version !== 2) throw new Error('対応していない保存形式です。');
    const {map} = validate({version:1, items:data.items});
    if (!Array.isArray(data.trees) || data.trees.length > 100) throw new Error('ツリーは100件以内です。');
    const ids = new Set();
    for (const tree of data.trees) {
      if (!tree || typeof tree.id !== 'string' || !tree.id || tree.id.length > 100 || ids.has(tree.id)) throw new Error('ツリーIDが不正、または重複しています。');
      ids.add(tree.id);
      if (typeof tree.name !== 'string' || !tree.name.trim() || tree.name.length > 100 || !map.has(tree.target) || !positive(tree.quantity)) throw new Error('ツリーの名前・完成品・希望個数を確認してください。');
      if (!Array.isArray(tree.removed) || tree.removed.length > 2000) throw new Error('削除した枝の情報が不正です。');
      for (const path of tree.removed) {
        if (!Array.isArray(path) || path.length < 2 || path.length > 300 || path[0] !== tree.target || path.some(id => !map.has(id)) || new Set(path).size !== path.length) throw new Error('削除した枝のパスが不正です。');
      }
    }
    if (data.trees.length ? !ids.has(data.activeTreeId) : data.activeTreeId !== null) throw new Error('選択したツリーがありません。');
    return data;
  }
  function migrate(input) {
    const data = structuredClone(input);
    if (data?.version === 2) {validateProject(data);return data;}
    validate(data);
    if (data.target !== undefined && !(data.target === '' && !data.items.length) && !data.items.some(item=>item.id===data.target)) throw new Error('完成品の参照が不正です。');
    if (data.quantity !== undefined && !positive(data.quantity)) throw new Error('完成希望個数は正の整数で指定してください。');
    const target = data.target || data.items[0]?.id;
    const project = {version:2, items:data.items, trees:target ? [{id:'tree-initial', name:data.items.find(x=>x.id===target).name, target, quantity:data.quantity || 1, removed:[]}] : [], activeTreeId:target ? 'tree-initial' : null};
    validateProject(project);return project;
  }
  function resolveItem(project, name, makeId) {
    const clean = name.trim();
    if (!clean || clean.length > 100) throw new Error('アイテム名は1〜100文字で入力してください。');
    const found = project.items.find(item=>item.name.trim()===clean);
    if (found) return found.id;
    if (project.items.length >= 300) throw new Error('アイテムは300件以内です。');
    const id = makeId();
    if (project.items.some(item=>item.id===id)) throw new Error('アイテムIDが重複しています。');
    project.items.push({id, name:clean, recipe:null});return id;
  }
  function addTree(project, name, targetName, quantity, makeId) {
    const next = structuredClone(project);
    const target = resolveItem(next,targetName,makeId), id=makeId();
    next.trees.push({id,name:name.trim(),target,quantity,removed:[]});next.activeTreeId=id;
    validateProject(next);return next;
  }
  function removeBranch(project, treeId, path) {
    const next=structuredClone(project), tree=next.trees.find(x=>x.id===treeId);
    if (!tree || path.length < 2 || path[0]!==tree.target) throw new Error('削除する枝が不正です。');
    const map=new Map(next.items.map(item=>[item.id,item]));
    for(let i=1;i<path.length;i++) if(!map.get(path[i-1])?.recipe?.materials.some(m=>m.id===path[i])) throw new Error('削除する枝が見つかりません。');
    const prefix=(a,b)=>a.length<=b.length&&a.every((id,i)=>id===b[i]);
    if(!tree.removed.some(p=>prefix(p,path))) tree.removed=[...tree.removed.filter(p=>!prefix(path,p)),[...path]];
    validateProject(next);return next;
  }
  function calculateTree(project, treeId) {
    validateProject(project);
    const tree=project.trees.find(x=>x.id===treeId);
    if(!tree)throw new Error('ツリーを選択してください。');
    const originals=new Map(project.items.map(item=>[item.id,item]));
    // A trie makes exclusions local to an occurrence, not to a shared item.
    const exclusions=new Map();
    for(const path of tree.removed){let trie=exclusions;for(const id of path){if(!trie.has(id))trie.set(id,new Map());trie=trie.get(id);}trie.deleted=true;}
    const variants=new Map(), signatures=new Map(), defaults=new Map(), ordered=[];
    function compile(id,trie) {
      if(!trie?.size && defaults.has(id))return defaults.get(id);
      const item=originals.get(id), materials=[];
      for(const material of item.recipe?.materials || []){
        const childTrie=trie?.get(material.id);
        if(!childTrie?.deleted)materials.push({id:compile(material.id,childTrie),quantity:material.quantity});
      }
      const signature=JSON.stringify([id,materials]);
      if(signatures.has(signature))return signatures.get(signature);
      if(variants.size>=10000)throw new Error('枝の組み合わせが多すぎます。ツリーを分けてください。');
      const key='variant-'+variants.size;
      variants.set(key,{id:key,original:id,name:item.name,recipe:item.recipe?{output:item.recipe.output,materials}:null});
      signatures.set(signature,key);ordered.push(key);if(!trie?.size)defaults.set(id,key);return key;
    }
    const root=compile(tree.target,exclusions.get(tree.target));
    const result=calculateGraph(variants,ordered.reverse(),root,tree.quantity);
    const totals=new Map();
    for(const total of result.totals){const id=variants.get(total.id).original;const combined=totals.get(id);if(!combined)totals.set(id,{...total,id,variants:1});else{for(const key of ['needed','crafts','produced','surplus'])combined[key]=checked(combined[key]+total[key]);combined.variants++;}}
    function restore(node,path=[]){const id=variants.get(node.id).original;node.id=id;node.path=[...path,id];node.children.forEach(child=>restore(child,node.path));}
    restore(result.tree);return {...result,totals:[...totals.values()]};
  }
  const api = {validate, calculate, sample, positive, validateProject, migrate, resolveItem, addTree, removeBranch, calculateTree};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else scope.CraftModel = api;
})(globalThis);
