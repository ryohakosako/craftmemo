/* Shared dark combobox for native selects and free-text item suggestions. */
(() => {
  'use strict';
  const pickers = new Map();
  let sequence = 0;
  function labelFor(source) {
    if (source.getAttribute('aria-label')) return source.getAttribute('aria-label');
    const label = source.labels?.[0];
    return label ? [...label.childNodes].filter(node => node !== source).map(node => node.textContent).join('').trim() : 'アイテム';
  }
  function attach(source) {
    if (pickers.has(source)) return;
    const isSelect = source.tagName === 'SELECT';
    const listId = source.getAttribute('list');
    const name = labelFor(source);
    const wrap = document.createElement('div');wrap.className = 'picker';
    source.before(wrap);
    let input;
    if (isSelect) {
      input = document.createElement('input');input.type = 'text';
      source.classList.add('picker-source');source.tabIndex = -1;source.setAttribute('aria-hidden', 'true');
      wrap.append(source,input);
      source.addEventListener('focus', () => input.focus());
      source.addEventListener('invalid', event => {event.preventDefault();input.focus();});
    } else {
      input = source;source.removeAttribute('list');wrap.append(input);
    }
    input.setAttribute('aria-label', name);input.setAttribute('role','combobox');input.setAttribute('aria-autocomplete','list');
    input.setAttribute('aria-haspopup','listbox');input.setAttribute('aria-expanded','false');input.autocomplete='off';
    const list = document.createElement('div');list.className='picker-list';list.id='picker-list-'+(++sequence);list.role='listbox';list.setAttribute('aria-label',name+'の候補');list.hidden=true;
    const status=document.createElement('div');status.className='sr-only';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
    const arrow=document.createElement('span');arrow.className='picker-arrow';arrow.textContent='⌄';arrow.setAttribute('aria-hidden','true');
    wrap.append(arrow,list,status);input.setAttribute('aria-controls',list.id);
    let open=false,query='',active=-1,filtered=[],composing=false,choosing=false;
    function entries(){
      const options=isSelect?[...source.options]:[...(document.getElementById(listId)?.options || [])];
      const rows=options.filter(o=>!o.disabled&&(isSelect?o.value!=='':true)).map(o=>({value:o.value,label:isSelect?o.textContent:o.value}));
      return isSelect?rows:rows.filter((row,i)=>rows.findIndex(other=>other.value===row.value)===i);
    }
    function selectedValue(){return isSelect?source.value:input.value;}
    function close(){
      open=false;list.hidden=true;status.textContent='';input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');wrap.classList.remove('is-open');active=-1;
      if(isSelect){input.value=source.selectedOptions[0]?.textContent || '';input.setCustomValidity('');}
    }
    function choose(index){
      const entry=filtered[index];if(!entry)return;
      if(isSelect){const changed=source.value!==entry.value;source.value=entry.value;input.value=entry.label;close();if(changed)source.dispatchEvent(new Event('change',{bubbles:true}));}
      else{input.value=entry.value;close();choosing=true;input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));choosing=false;}
      input.focus();
    }
    function markActive(){
      [...list.children].forEach((row,i)=>row.classList.toggle('is-active',i===active));
      if(active>=0&&filtered[active]){input.setAttribute('aria-activedescendant',list.id+'-'+active);list.children[active].scrollIntoView({block:'nearest'});}else input.removeAttribute('aria-activedescendant');
    }
    function render(){
      filtered=entries().filter(row=>row.label.toLocaleLowerCase().includes(query.toLocaleLowerCase()));list.replaceChildren();
      filtered.forEach((entry,i)=>{
        const row=document.createElement('div');row.className='picker-option';row.role='option';row.id=list.id+'-'+i;row.setAttribute('aria-selected',String(entry.value===selectedValue()));
        const label=document.createElement('span');label.textContent=entry.label;row.append(label);
        if(entry.value===selectedValue()){const check=document.createElement('span');check.className='picker-check';check.textContent='✓';check.setAttribute('aria-hidden','true');row.append(check);}
        row.addEventListener('pointerdown',event=>{event.preventDefault();});row.addEventListener('click',event=>{event.preventDefault();choose(i);});list.append(row);
      });
      if(!filtered.length){const empty=document.createElement('div');empty.className='picker-empty';empty.textContent=isSelect?'候補がありません':'登録済みの候補なし（新しい名前を入力できます）';list.append(empty);}
      const anchor=input.getBoundingClientRect(),dialog=source.closest('dialog')?.getBoundingClientRect();
      const bottom=Math.min(window.innerHeight,dialog?.bottom ?? window.innerHeight)-12;
      const top=Math.max(0,dialog?.top ?? 0)+12;
      const below=bottom-anchor.bottom,above=anchor.top-top;
      const up=below<Math.min(list.scrollHeight,220)&&above>below;
      list.classList.toggle('opens-up',up);
      list.style.maxHeight=Math.max(65,Math.min(235,window.innerHeight*.3,(up?above:below)-6))+'px';
      status.textContent=filtered.length+'件の候補';markActive();
    }
    function show(){
      if(input.disabled)return;
      for(const picker of pickers.values())if(picker.source!==source)picker.close();
      if(!open){open=true;query='';active=-1;list.hidden=false;input.setAttribute('aria-expanded','true');wrap.classList.add('is-open');render();}
    }
    function sync(){
      if(isSelect){input.disabled=source.disabled;input.required=source.required;input.placeholder='選択・検索…';if(!open)input.value=source.selectedOptions[0]?.textContent || '';}
      wrap.classList.toggle('is-disabled',input.disabled);
      if(input.disabled)close();else if(open){active=-1;render();}
    }
    input.addEventListener('focus',show);input.addEventListener('click',show);
    input.addEventListener('compositionstart',()=>{composing=true;});input.addEventListener('compositionend',()=>{composing=false;});
    input.addEventListener('input',()=>{if(choosing)return;show();query=input.value;active=-1;if(isSelect)input.setCustomValidity('候補を選択してください。');render();});
    input.addEventListener('blur',()=>{close();});
    input.addEventListener('keydown',event=>{
      if(composing||event.isComposing)return;
      if(event.key==='ArrowDown'||event.key==='ArrowUp'){
        event.preventDefault();show();const step=event.key==='ArrowDown'?1:-1;active=filtered.length?(active<0?(step>0?0:filtered.length-1):(active+step+filtered.length)%filtered.length):-1;markActive();
      }else if(event.key==='Enter'&&open){if(active>=0){event.preventDefault();choose(active);}else if(isSelect){event.preventDefault();const exact=filtered.findIndex(row=>row.label===input.value);if(exact>=0)choose(exact);}}
      else if(event.key==='Escape'&&open){event.preventDefault();event.stopPropagation();close();}
      else if(event.key==='Tab')close();
    });
    source.addEventListener('change',sync);
    const picker={source,close,sync};pickers.set(source,picker);sync();
  }
  function enhance(){
    for(const [source] of pickers)if(!source.isConnected)pickers.delete(source);
    document.querySelectorAll('select,input[list]').forEach(attach);
    for(const picker of pickers.values())picker.sync();
  }
  document.addEventListener('pointerdown',event=>{for(const picker of pickers.values())if(!picker.source.closest('.picker')?.contains(event.target))picker.close();});
  document.addEventListener('close',event=>{for(const picker of pickers.values())if(event.target.contains(picker.source))picker.close();},true);
  window.DarkPicker={enhance};
})();
