'use strict';
const $ = id => document.getElementById(id);
const KEY = 'craftmemo.v1';
const {validate, calculate, sample, positive} = CraftModel;
let data = sample(), editing = null, draft = [], collapsed = new Set(), createTarget = false, branchParent = null;
const fmt = n => n.toLocaleString('ja-JP');
function el(tag, className, text) {const n = document.createElement(tag); if(className)n.className=className;if(text!==undefined)n.textContent=text;return n;}
function notify(text) {$('message').textContent=text;$('message').hidden=!text;}
function save() {
  try {localStorage.setItem(KEY, JSON.stringify(data));$('save-status').textContent='✓ このブラウザに保存済み';}
  catch {$('save-status').textContent='保存できませんでした';notify('自動保存できません。JSON書き出しでデータを保管してください。');}
}
try {
  const stored = localStorage.getItem(KEY);
  if(stored){const parsed=JSON.parse(stored);validate(parsed);data=parsed;}
} catch {notify('保存データを読み込めませんでした。元の保存データは上書きせず、サンプルを表示しています。編集前に必要なバックアップをご確認ください。');}
if(!data.items.some(x=>x.id===data.target))data.target=data.items[0]?.id || '';
if(!positive(data.quantity))data.quantity=1;
$('quantity').value=data.quantity;
function targets() {
  $('target').replaceChildren();
  if(!data.items.length){const o=el('option','','アイテムを追加してください');o.value='';$('target').append(o);}
  for(const item of data.items){const o=el('option','',item.name);o.value=item.id;$('target').append(o);}
  $('target').value=data.target;
}
function list() {
  $('items').replaceChildren();$('item-count').textContent=`(${data.items.length})`;
  const query=$('search').value.trim().toLocaleLowerCase();
  for(const item of data.items.filter(x=>x.name.toLocaleLowerCase().includes(query))){
    const row=el('div','item'),icon=el('span','item-icon'+(item.recipe?'':' raw'),item.recipe?'◇':'▧'),info=el('div','item-info',item.name),button=el('button','','編集');
    info.append(el('small','',item.recipe?`1回で ${fmt(item.recipe.output)}個 · 材料${item.recipe.materials.length}種`:'最終素材 · レシピなし'));
    button.setAttribute('aria-label',`${item.name}を編集`);button.onclick=()=>openEditor(item.id);row.append(icon,info,button);$('items').append(row);
  }
  if(!$('items').childNodes.length)$('items').append(el('p','empty',query?'一致するアイテムがありません。':'最初のアイテムを追加しましょう。'));
}
function renderTree(node,path='0') {
  const wrapper=el('div','node'),head=el('div','node-head'),card=el('div','node-card'+(node.raw?' raw':''));
  const title=el('button','node-name',node.name);title.setAttribute('aria-label',node.name+'を編集');title.onclick=()=>openEditor(node.id);
  const amount=el('strong','node-amount',fmt(node.needed));amount.append(el('small','','個'));
  const info=el('span','node-meta',node.raw?'素材':node.crafts?fmt(node.crafts)+'回分を割当':'共有の余りで供給');
  card.append(title,amount,info);
  if(node.children.length){const toggle=el('button','node-fold',collapsed.has(path)?'▸':'▾');toggle.setAttribute('aria-label',node.name+'の材料を'+(collapsed.has(path)?'展開':'折りたたむ'));toggle.setAttribute('aria-expanded',String(!collapsed.has(path)));toggle.onclick=()=>{if(collapsed.has(path))collapsed.delete(path);else collapsed.add(path);results();};card.append(toggle);}
  const add=el('button','node-add','＋');add.setAttribute('aria-label',node.name+'に材料を追加');add.title='材料を追加';add.onclick=()=>openBranch(node.id);head.append(card,add);wrapper.append(head);
  if(node.children.length&&!collapsed.has(path)){const children=el('div','children');node.children.forEach((child,i)=>children.append(renderTree(child,path+'.'+i)));wrapper.append(children);}
  return wrapper;
}
function results() {
  for(const id of ['tree','raw','crafted'])$(id).replaceChildren();$('raw-count').textContent='0種類';
  if(!data.items.length){const add=el('button','empty-add','＋ 最初のアイテム');add.onclick=()=>{createTarget=true;openEditor();};$('tree').append(add);return;}
  try {
    const result=calculate(data,$('target').value,Number($('quantity').value));
    $('tree').append(renderTree(result.tree));
    if(result.truncated)$('tree').append(el('p','empty','ツリーは2,000項目まで表示しています。全体集計は省略せず計算しています。'));
    const raw=result.totals.filter(x=>x.raw),crafted=result.totals.filter(x=>!x.raw);
    $('raw-count').textContent=`${raw.length}種類`;
    for(const row of raw){const div=el('div','raw-row'),n=el('strong','',fmt(row.needed));n.append(el('small','',' 個'));div.append(el('span','',row.name),n);$('raw').append(div);}
    for(const row of crafted){const div=el('div','craft-row'),metrics=el('div','metrics');for(const [label,value,unit] of [['必要総数',row.needed,'個'],['クラフト',row.crafts,'回'],['余り',row.surplus,'個']]){const cell=el('span','',label);cell.append(el('strong','',`${fmt(value)} ${unit}`));metrics.append(cell);}div.append(el('h3','',row.name),metrics);$('crafted').append(div);}
    if(!crafted.length)$('crafted').append(el('p','empty','選択したアイテムは最終素材です。'));
    if(!raw.length)$('raw').append(el('p','empty','最終素材はありません。'));
  } catch(error){$('tree').append(el('p','empty',error.message));$('tree').firstChild.setAttribute('role','alert');}
}
function refresh(){targets();list();results();}
function showEditorError(text){$('editor-error').textContent=text;$('editor-error').hidden=!text;}
function materials() {
  $('materials').replaceChildren();
  draft.forEach((m,i)=>{
    const row=el('div','material-row'),label=el('label','','素材'),select=el('select'),qLabel=el('label','','必要個数'),q=el('input'),del=el('button','','✕');
    select.required=true;
    const blank=el('option','','選択してください');blank.value='';select.append(blank);
    for(const item of data.items.filter(x=>x.id!==editing)){const o=el('option','',item.name);o.value=item.id;select.append(o);}
    select.value=m.id;select.onchange=()=>{draft[i].id=select.value;};q.type='number';q.min='1';q.step='1';q.required=true;q.value=m.quantity;q.oninput=()=>{draft[i].quantity=Number(q.value);};
    del.type='button';del.setAttribute('aria-label',`材料${i+1}を削除`);del.onclick=()=>{draft.splice(i,1);materials();};label.append(select);qLabel.append(q);row.append(label,qLabel,del);$('materials').append(row);
  });
}
function recipeVisibility(){const enabled=$('has-recipe').checked;$('recipe-fields').hidden=!enabled;$('output').disabled=!enabled;for(const input of $('materials').querySelectorAll('input,select'))input.disabled=!enabled;}
function openEditor(id=null){
  editing=id;if(id)createTarget=false;const item=data.items.find(x=>x.id===id);
  $('editor-title').textContent=item?'アイテムを編集':'アイテムを追加';$('item-name').value=item?.name || '';$('has-recipe').checked=!!item?.recipe;$('output').value=item?.recipe?.output || 1;
  draft=item?.recipe?structuredClone(item.recipe.materials):[];$('delete-item').hidden=!item;showEditorError('');materials();recipeVisibility();$('library').close();$('editor').showModal();$('item-name').focus();
}
$('add-item').onclick=()=>{createTarget=true;openEditor();};$('close-editor').onclick=()=>$('editor').close();$('has-recipe').onchange=recipeVisibility;
$('add-material').onclick=()=>{draft.push({id:'',quantity:1});materials();recipeVisibility();};
$('item-form').onsubmit=event=>{
  event.preventDefault();
  try {
    const next=structuredClone(data),id=editing || crypto.randomUUID(),item={id,name:$('item-name').value.trim(),recipe:$('has-recipe').checked?{output:Number($('output').value),materials:structuredClone(draft)}:null};
    const index=next.items.findIndex(x=>x.id===id);if(index<0)next.items.push(item);else next.items[index]=item;
    validate(next);if(!next.target || createTarget)next.target=id;createTarget=false;data=next;$('editor').close();notify('');collapsed.clear();refresh();save();
  }catch(error){showEditorError(error.message);}
};
$('delete-item').onclick=async()=>{
  const users=data.items.filter(x=>x.recipe?.materials.some(m=>m.id===editing));
  if(users.length){showEditorError(`次のレシピで使用中です：${users.map(x=>x.name).join('、')}。先に材料から外してください。`);return;}
  const item=data.items.find(x=>x.id===editing);if(!await confirmLocal(`「${item.name}」を削除しますか？`))return;
  data.items=data.items.filter(x=>x.id!==editing);if(data.target===editing)data.target=data.items[0]?.id || '';$('editor').close();notify('');collapsed.clear();refresh();save();
};
$('target').onchange=()=>{data.target=$('target').value;collapsed.clear();notify('');results();save();};
$('quantity').oninput=()=>{results();if(positive(Number($('quantity').value))){data.quantity=Number($('quantity').value);save();}};
$('search').oninput=list;
$('expand').onclick=()=>{collapsed.clear();results();};
$('collapse').onclick=()=>{collapsed.add('0');results();};
$('sample').onclick=async()=>{if(!await confirmLocal('現在のアイテムとレシピをサンプルで置き換えます。必要なデータは先にJSON書き出ししてください。'))return;data=sample();collapsed.clear();$('quantity').value=data.quantity;$('search').value='';notify('');refresh();save();};
$('export').onclick=()=>{const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=el('a');a.href=url;a.download='craftmemo.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);};
$('import').onclick=()=>$('file').click();
$('file').onchange=async()=>{
  const file=$('file').files[0];if(!file)return;
  try {
    if(file.size>2*1024*1024)throw new Error('JSONは2MB以内で読み込んでください。');
    const next=JSON.parse(await file.text());validate(next);
    if(next.target!==undefined && !next.items.some(x=>x.id===next.target) && !(next.target===''&&!next.items.length))throw new Error('完成品の参照が不正です。');
    if(next.quantity!==undefined&&!positive(next.quantity))throw new Error('完成希望個数は正の整数で指定してください。');
    if(!await confirmLocal('現在のアイテム・レシピを読み込んだJSONで置き換えますか？'))return;
    data={version:1,items:next.items,target:next.target || next.items[0]?.id || '',quantity:next.quantity || 1};collapsed.clear();$('quantity').value=data.quantity;$('search').value='';notify('JSONを読み込みました。');refresh();save();
  } catch(error){notify(`読み込めませんでした：${error.message} 現在のデータは変更していません。`);}
  finally{$('file').value='';}
};

$('library-toggle').onclick=()=>$('library').showModal();
$('close-library').onclick=()=>$('library').close();
function branchMode(){const existing=$('branch-form').querySelector('input[name="branch-mode"]:checked').value==='existing';$('branch-name-label').hidden=existing;$('branch-existing-label').hidden=!existing;$('branch-name').disabled=existing;$('branch-existing').disabled=!existing;$('branch-existing').required=existing;}
for(const radio of $('branch-form').querySelectorAll('input[name="branch-mode"]'))radio.onchange=branchMode;
function openBranch(id){
  branchParent=id;const item=data.items.find(x=>x.id===id);$('branch-title').textContent=item.name+' に材料を追加';$('branch-name').value='';$('branch-output').value=item.recipe?.output || 1;$('branch-quantity').value=1;$('branch-error').hidden=true;
  $('branch-existing').replaceChildren();for(const candidate of data.items.filter(x=>x.id!==id&&!item.recipe?.materials.some(m=>m.id===x.id))){const option=el('option','',candidate.name);option.value=candidate.id;$('branch-existing').append(option);}
  $('branch-form').querySelector('input[value="new"]').checked=true;branchMode();$('branch-dialog').showModal();$('branch-name').focus();
}
$('close-branch').onclick=()=>$('branch-dialog').close();
$('branch-form').onsubmit=event=>{
  event.preventDefault();
  try {
    const next=structuredClone(data),parent=next.items.find(x=>x.id===branchParent),existing=$('branch-form').querySelector('input[name="branch-mode"]:checked').value==='existing';
    const id=existing?$('branch-existing').value:crypto.randomUUID();
    if(!existing)next.items.push({id,name:$('branch-name').value.trim(),recipe:null});
    parent.recipe={output:Number($('branch-output').value),materials:[...(parent.recipe?.materials || []),{id,quantity:Number($('branch-quantity').value)}]};
    validate(next);data=next;$('branch-dialog').close();collapsed.clear();notify('');refresh();save();
  }catch(error){$('branch-error').textContent=error.message;$('branch-error').hidden=false;}
};
refresh();

function confirmLocal(message){return new Promise(resolve=>{const dialog=$('confirmation');$('confirmation-message').textContent=message;let finished=false;function finish(value){if(finished)return;finished=true;dialog.close();resolve(value);}$('confirm-yes').onclick=()=>finish(true);$('confirm-no').onclick=()=>finish(false);dialog.oncancel=event=>{event.preventDefault();finish(false);};dialog.showModal();$('confirm-no').focus();});}
