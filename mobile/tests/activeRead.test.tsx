// @vitest-environment jsdom
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
const f=vi.hoisted(()=>({listeners:new Set<(state:string)=>void>()}));
vi.mock('react-native',()=>({AppState:{currentState:'active',addEventListener:(_:string,listener:(state:string)=>void)=>{f.listeners.add(listener);return{remove:()=>f.listeners.delete(listener)};}}}));
import { useActiveRead } from '../src/hooks/useActiveRead';
import { invalidateSession } from '../src/services/sessionEpoch';
let refresh!: (afterCurrent?:boolean)=>Promise<void>;
const host=document.createElement('div');document.body.append(host);
let root:ReturnType<typeof createRoot>;
Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
afterEach(async()=>{await act(async()=>root?.unmount());host.innerHTML='';expect(f.listeners.size).toBe(0);});
function Harness({read,active=true}:{read:(current:()=>boolean)=>Promise<void>;active?:boolean}){refresh=useActiveRead(read,active);return null;}

it('coalesces concurrent refreshes and queues exactly one read after a completed write',async()=>{
 let finish!:()=>void;
 const read=vi.fn().mockImplementationOnce(()=>new Promise<void>(resolve=>{finish=resolve;})).mockResolvedValue(undefined);
 root=createRoot(host);await act(async()=>root.render(<Harness read={read}/>));
 void refresh();void refresh();void refresh(true);void refresh(true);
 expect(read).toHaveBeenCalledTimes(1);
 await act(async()=>finish());expect(read).toHaveBeenCalledTimes(2);
});

it('ignores responses after hiding or signing out',async()=>{
 let finish!:()=>void;
 let valid!:()=>boolean;
 const read=vi.fn((current:()=>boolean)=>{valid=current;return new Promise<void>(resolve=>{finish=resolve;});});
 root=createRoot(host);await act(async()=>root.render(<Harness read={read}/>));
 expect(valid()).toBe(true);
 await act(async()=>root.render(<Harness read={read} active={false}/>));expect(valid()).toBe(false);
 await act(async()=>finish());
 await act(async()=>root.render(<Harness read={read}/>));expect(valid()).toBe(true);
 invalidateSession();expect(valid()).toBe(false);await act(async()=>finish());
});

it('retains content while resuming and ignores repeated active events',async()=>{
 let value='first';
 const fetchValue=vi.fn(async()=>value);
 function Screen(){const [shown,setShown]=useState('loading');const read=React.useCallback(async(current:()=>boolean)=>{const next=await fetchValue();if(current())setShown(next);},[]);useActiveRead(read);return <span>{shown}</span>;}
 root=createRoot(host);await act(async()=>root.render(<Screen/>));
 value='updated';
 await act(async()=>{f.listeners.forEach(fn=>fn('active'));});expect(fetchValue).toHaveBeenCalledTimes(1);
 await act(async()=>{f.listeners.forEach(fn=>fn('background'));});expect(host.textContent).toBe('first');
 await act(async()=>{f.listeners.forEach(fn=>fn('active'));});expect(host.textContent).toBe('updated');
});

it('reports an automatic read failure, runs the queued refresh, and remains retryable',async()=>{
 let reject!:(error:Error)=>void;
 const warn=vi.spyOn(console,'warn').mockImplementation(()=>{});
 const read=vi.fn().mockImplementationOnce(()=>new Promise<void>((_,no)=>{reject=no;})).mockResolvedValue(undefined);
 try {
  root=createRoot(host);await act(async()=>root.render(<Harness read={read}/>));
  const queued=refresh(true);
  await act(async()=>{reject(new Error('Read failed'));await queued;});
  expect(warn).toHaveBeenCalledTimes(1);expect(read).toHaveBeenCalledTimes(2);
  await act(async()=>refresh());expect(read).toHaveBeenCalledTimes(3);
 } finally {warn.mockRestore();}
});
