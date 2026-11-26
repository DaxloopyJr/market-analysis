/** Remembers each table's rows-per-page in this browser (safe if storage is blocked). */
import {useCallback,useState} from 'react';
import {PAGE_SIZES} from '../../utils/pagedFetch.js';

const storageKey=key=>`viwanda.pageSize.${key}`;

export function usePageSize(tableKey,initial=10){
  const [size,setSize]=useState(()=>{
    try{const saved=Number(window.localStorage.getItem(storageKey(tableKey)));if(PAGE_SIZES.includes(saved))return saved;}catch{/* storage blocked */}
    return initial;
  });
  const change=useCallback(value=>{
    const next=Number(value);
    if(!PAGE_SIZES.includes(next))return;
    setSize(next);
    try{window.localStorage.setItem(storageKey(tableKey),String(next));}catch{/* storage blocked */}
  },[tableKey]);
  return [size,change];
}

