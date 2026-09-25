// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,expect,it,vi} from 'vitest';
const f=vi.hoisted(()=>({state:'unavailable',read:vi.fn(),openURL:vi.fn()}));
vi.mock('react-native',()=>({View:({children}:{children?:React.ReactNode})=><div>{children}</div>,ScrollView:({children}:{children?:React.ReactNode})=><div>{children}</div>,Pressable:({children,onPress}:{children?:React.ReactNode;onPress?:()=>void})=><button onClick={onPress}>{children}</button>,TextInput:()=>null,Alert:{alert:vi.fn()},Linking:{openURL:f.openURL},StyleSheet:{create:(s:unknown)=>s},AppState:{currentState:'active',addEventListener:()=>({remove(){}})}}));
vi.mock('../src/services/moneyApi',()=>({moneyApi:{plan:async()=>{f.read();return{withheld:f.state!=='clear',reconciliation:{state:f.state},month:'2026-09',today:'2026-09-25',first_weekday:1,cells:[],peak:null,line:'The plan is current.'};}}}));
vi.mock('../src/ui/primitives',()=>{const T=({children}:{children?:React.ReactNode})=><span>{children}</span>;return{Body:T,Heading:T,Label:T,List:T,Micro:T,Page:T,Small:T,Title:T,Hairline:()=>null,Pill:({label,onPress}:{label:string;onPress?:()=>void})=><button onClick={onPress}>{label}</button>};});
vi.mock('../src/ui/Orb',()=>({Orb:()=>null}));
import PlanScreen from '../src/screens/PlanScreen';
const host=document.createElement('div');document.body.append(host);let root:ReturnType<typeof createRoot>;
Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
afterEach(async()=>{await act(async()=>root?.unmount());host.innerHTML='';f.state='unavailable';f.read.mockClear();f.openURL.mockReset();});
it('distinguishes unavailable evidence from confirmed review and retries the plan',async()=>{
 root=createRoot(host);await act(async()=>root.render(<PlanScreen/>));
 expect(host.textContent).toContain('The payment evidence could not be confirmed.');
 expect(host.textContent).not.toContain('observations awaiting review');
 const retry=Array.from(host.querySelectorAll('button')).find(b=>b.textContent==='Try again');expect(retry).toBeDefined();
 f.state='clear';await act(async()=>retry!.click());expect(f.read).toHaveBeenCalledTimes(2);expect(host.textContent).toContain('The plan is current.');expect(host.textContent).not.toContain('Try again');
});
it('sends confirmed pending observations to review without presenting a failed-read retry',async()=>{
 f.state='pending';root=createRoot(host);await act(async()=>root.render(<PlanScreen/>));
 expect(host.textContent).toContain('observations awaiting review');
 const review=Array.from(host.querySelectorAll('button')).find(b=>b.textContent==='Review on twinme.me');expect(review).toBeDefined();
 await act(async()=>review!.click());expect(f.openURL).toHaveBeenCalledWith('https://twinme.me/money/account#sources');expect(host.textContent).not.toContain('Try again');
});
