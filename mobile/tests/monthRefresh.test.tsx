// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
const f=vi.hoisted(()=>({pull:vi.fn(),spent:5,forecast:vi.fn()}));
vi.mock('react-native',()=>({View:({children}:{children:React.ReactNode})=><div>{children}</div>,ScrollView:({children}:{children:React.ReactNode})=><div>{children}</div>,RefreshControl:()=>null,StyleSheet:{create:(s:unknown)=>s},AppState:{currentState:'active',addEventListener:()=>({remove:()=>{}})}}));
vi.mock('../src/services/moneyApi',()=>({currentMonthStart:()=> '2026-09-01',bankLabel:()=> 'Test bank',moneyApi:{
 forecast:async()=>{f.forecast();return{month:'2026-09-01',spent:f.spent,projected_p50:10,projected_p90:15,projected_p10:5,committed:0};},
 ledger:async()=>[{amount:-5,occurred_at:'2026-09-25'}],readings:async()=>[],categories:async()=>null,recurring:async()=>[],today:async()=>null,accounts:async()=>[],months:async()=>[],refreshIfStale:f.pull,
}}));
vi.mock('../src/ui/primitives',()=>{const Text=({children}:{children:React.ReactNode})=><span>{children}</span>;return{Body:Text,Display:Text,Enter:Text,Micro:Text,Page:Text,Section:Text,Small:Text,Title:Text,Counting:({value}:{value:number})=><span>{`Spent: ${value}`}</span>,Hairline:()=>null,Row:()=>null,Pill:()=>null};});
vi.mock('../src/ui/figures',()=>({Band:()=>null,Strip:()=>null}));
vi.mock('../src/ui/carved',()=>({KindTile:()=>null,Stamp:()=>null}));
import MonthScreen from '../src/screens/MonthScreen';
const host=document.createElement('div');document.body.append(host);let root:ReturnType<typeof createRoot>;
Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
afterEach(async()=>{await act(async()=>root?.unmount());host.innerHTML='';f.forecast.mockClear();f.pull.mockReset();f.spent=5;});
it('refreshes after a successful bank pull with zero new transactions',async()=>{
 let complete!:(result:unknown)=>void;f.pull.mockImplementation(()=>new Promise(resolve=>{complete=resolve;}));
 root=createRoot(host);await act(async()=>root.render(<MonthScreen questionCount={0} onOpenQuestions={()=>{}} active/>));
 expect(host.textContent).toContain('Spent: 5');expect(f.forecast).toHaveBeenCalledTimes(1);
 f.spent=9;await act(async()=>complete({pulled:true,created:0}));
 expect(host.textContent).toContain('Spent: 9');expect(f.forecast).toHaveBeenCalledTimes(2);
});
