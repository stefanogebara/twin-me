// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
const f=vi.hoisted(()=>({history:vi.fn(),listeners:new Set<(state:string)=>void>()}));
vi.mock('react-native',()=>{
 const Box=({children}:{children:React.ReactNode})=><div>{children}</div>;
 return {View:Box,KeyboardAvoidingView:Box,ScrollView:React.forwardRef((_props:{children:React.ReactNode},_ref)=> <div>{_props.children}</div>),TextInput:()=>null,Platform:{OS:'ios'},StyleSheet:{create:(s:unknown)=>s},DeviceEventEmitter:{addListener:()=>({remove:()=>{}})},AppState:{currentState:'active',addEventListener:(_:string,listener:(state:string)=>void)=>{f.listeners.add(listener);return{remove:()=>f.listeners.delete(listener)};}}};
});
vi.mock('react-native-safe-area-context',()=>({useSafeAreaInsets:()=>({top:0,bottom:0})}));
vi.mock('../src/ui/motion',()=>({useReducedMotion:()=>true}));
vi.mock('../src/ui/Orb',()=>({Orb:()=>null}));
vi.mock('../src/ui/prompt',()=>({Prompt:()=>null,Shimmer:()=>null}));
vi.mock('../src/ui/figures',()=>({Figure:()=>null,HomeMap:()=>null}));
vi.mock('../src/ui/primitives',()=>{const Text=({children}:{children:React.ReactNode})=><span>{children}</span>;return{Body:Text,Card:Text,Enter:Text,Hairline:()=>null,Heading:Text,Label:Text,Micro:Text,Page:Text,Pill:()=>null,Press:Text,Row:()=>null,Small:Text,Title:Text};});
vi.mock('expo-secure-store',()=>({}));
vi.mock('../src/constants',()=>({API_URL:'/api',STORAGE_KEYS:{}}));
vi.mock('../src/services/api',()=>({authFetch:vi.fn()}));
vi.mock('../src/services/moneyApi',async original=>({...await original<Record<string,unknown>>(),moneyApi:{chatHistory:f.history,recurring:async()=>[],months:async()=>[],categories:async()=>({groups:[]}),forecast:async()=>({projected_p50:5}),ledger:async()=>[]}}));
import ChatScreen from '../src/screens/ChatScreen';
import { readLines, setLines } from '../src/screens/chatStore';
import { invalidateSession } from '../src/services/sessionEpoch';
const host=document.createElement('div');document.body.append(host);let root:ReturnType<typeof createRoot>;
Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true,__DEV__:false});
afterEach(async()=>{await act(async()=>root?.unmount());host.innerHTML='';invalidateSession();f.history.mockReset();});
const turn=(text:string)=>({id:text,role:'twin',text});
it('refreshes shared history on Ask tab return and foreground without replacing a pending response',async()=>{
 f.history.mockResolvedValueOnce([turn('First web answer')]).mockResolvedValueOnce([turn('New web answer')]).mockResolvedValueOnce([turn('Newest web answer')]);
 root=createRoot(host);await act(async()=>root.render(<ChatScreen mode="ask" active/>));
 expect(host.textContent).toContain('First web answer');expect(f.history).toHaveBeenCalledTimes(1);
 await act(async()=>root.render(<ChatScreen mode="ask" active={false}/>));
 await act(async()=>root.render(<ChatScreen mode="ask" active/>));
 expect(host.textContent).toContain('New web answer');expect(f.history).toHaveBeenCalledTimes(2);
 await act(async()=>{f.listeners.forEach(fn=>fn('background'));f.listeners.forEach(fn=>fn('active'));});
 expect(host.textContent).toContain('Newest web answer');
 await act(async()=>setLines('ask',[...readLines('ask'),{id:'pending',who:'twin',text:'Working',pending:true}]));
 await act(async()=>{f.listeners.forEach(fn=>fn('background'));f.listeners.forEach(fn=>fn('active'));});
 expect(f.history).toHaveBeenCalledTimes(3);expect(readLines('ask').at(-1)?.pending).toBe(true);
});
