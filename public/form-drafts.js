// Local drafts are separate from submitted learning evidence.
export function createViewDrafts({getDate,getPage,storage=localStorage}){
 const key=()=>`eju-view-draft:${getDate()}:${getPage()}`;
 const fields=()=>[...document.querySelectorAll('#view form input,#view form textarea,#view form select')].filter(e=>!e.readOnly&&!e.disabled&&!['password','file','hidden','submit','button'].includes(e.type));
 const id=e=>e.id||e.name;
 function remember(){const entries=fields().filter(id).map(e=>({id:id(e),value:e.value,checked:e.checked,type:e.type}));if(entries.length)storage.setItem(key(),JSON.stringify(entries));}
 function restore(){let entries=[];try{entries=JSON.parse(storage.getItem(key())||'[]');}catch{}for(const e of fields()){const row=entries.find(r=>r.id===id(e)&&r.type===e.type);if(row){e.value=row.value;if(['checkbox','radio'].includes(e.type))e.checked=row.checked;}e.addEventListener('input',remember);e.addEventListener('change',remember);}}
 function clear(savedKey=key()){storage.removeItem(savedKey);}
 return {remember,restore,clear,key};
}
