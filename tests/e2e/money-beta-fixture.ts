import type { Page } from '@playwright/test';
const now = new Date().toISOString();
const month = now.slice(0,7);
const user = {id:'00000000-0000-4000-8000-000000000001',email:'audit@example.invalid',name:'Audit Reader',firstName:'Audit',preferred_language:'en',timezone:'Europe/Madrid',created_at:'2026-01-01T00:00:00Z'};
const ledger = [{id:'tx1',occurred_at:now,posted_at:now,amount:-12.5,currency:'EUR',merchant_raw:'Audit Cafe',merchant_key:'audit cafe',merchant_name:'Audit Cafe',category:'coffee',channel:'card',card_last4:'1234',is_recurring:false,verdict:null}];
const forecast={month:month+'-01',as_of:now,days_left:13,spent:12.5,committed:20,expected:100,baseline_rest:70,projected_p10:80,projected_p50:100,projected_p90:140,history_days:60,committed_items:[],commitment_items:[],income_items:[],calendar_items:[]};
const account={balance_observed_at:now,id:'acc1',provider:'enablebanking',provider_account_id:'synthetic',name:'Audit Account',iban_mask:'ES** **** 1234',currency:'EUR',consent_expires_at:'2027-01-01T00:00:00Z',last_pulled_at:now,bank_name:'Banco Santander',balance:250,balance_at:now,balance_type:'ITAV'};
const today={amount:16.43,basis:'balance',base:250,income:1000,keep:0,budget:250,free:230,over:false,days_left:13,spent:12.5,committed:20,calendar_ahead:0,shape:null,basis_label:null,today_events:[],sentence:'From the 250 EUR in your account, over 14 days.',why:null,balance:{amount:250,banks:['Santander'],at:now},horizon:{day:null,days:14,source:null}};
const data={
 '/money/forecast':forecast,'/money/ledger':ledger,'/money/recurring':[], '/money/bank/accounts':[account],
 '/money/months':[{month:month+'-01',spent:12.5,received:1000,lines:1,days_covered:17,days_in_month:30,complete:false,biggest:{id:'tx1',merchant:'Audit Cafe',amount:12.5}}],
 '/money/readings':[], '/money/categories':{month,total:12.5,read:12.5,groups:[{category:'coffee',known:true,spent:12.5,lines:1,share:1,merchants:[{name:'Audit Cafe',merchant_key:'audit cafe',spent:12.5}]}]},
 '/money/usage':{findings:[],unmeasurable:[],measured:[]},'/money/today':today,
 '/money/facts':[{id:'fact1',kind:'home_area',subject:'madrid',value:'Madrid',subject_label:'Madrid'},{id:'fact2',kind:'income',subject:'family',amount:1000,day:1}],
 '/money/questions':{opening:[],fromLedger:[],answered:2},'/money/patterns':{findings:[]},
 '/money/inbox':{address:'synthetic@example.invalid',domain:'example.invalid',receiving:true},
 '/money/calendar':{connected:false,google:false,needsReconnect:false,feeds:[],events:[],items:[],week:[],learned:[],routine:null},
 '/money/bank/refresh-if-stale':{pulled:false,reason:'fresh'},'/money/bank/budget':{used:1,left:3,resets_at:null},
 '/money/chat/history':[], '/money/places':[], '/money/home':{saved:null,guess:null},
 '/money/plan':{month,days_in_month:30,first_weekday:2,today:now.slice(0,10),cells:Array.from({length:30},(_,i)=>({day:`${month}-${String(i+1).padStart(2,'0')}`,dom:i+1,weekday:(i+2)%7,past:i<16,today:i===16,spent:i===16?12.5:0,count:i===16?1:0,received:0,said:null,hit:null,expected:0,items:[],rows:[],note:null})),totals:{spent_to_day:12.5,expected_rest:20,income_ahead:0,days_ahead:13},peak:null,line:'Your month, day by day.'},
 '/money/transactions/tx1/sightings':[{id:'s1',source:'bankfeed',seen_at:now,raw_text:'Audit Cafe 12.50',amount:12.5,currency:'EUR',occurred_at:now,parse_confidence:1}]
};

export async function moneyFixture(page: Page, { firstVisit = false } = {}) {
  const state = { reconciliationPending: false, failing: false, empty: false, paginated: false, advanced: true, capabilitiesFailed: false, statementFailed: false, changed: false, offer: false, interrupted: false, cards: false, cardTypes: {} as Record<string,string>, imports: [] as string[], accountCreations: 0 };
  await page.addInitScript(({ user, firstVisit }) => {
    sessionStorage.setItem('oauth_bootstrap_token','audit.synthetic.token');
    sessionStorage.setItem('twinme_new_user_check_done_v1','1');
    localStorage.setItem('auth_user',JSON.stringify(user));
    if (!firstVisit) for(const step of ['banks','places','phone']) localStorage.setItem(`mv-start-skip:${step}`,'1');
  }, { user, firstVisit });
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (!['127.0.0.1','localhost'].includes(url.hostname)) return route.abort();
    if (!url.pathname.startsWith('/api/')) return route.continue();
    const path = url.pathname.slice(4);
    const json = (body: unknown, status=200) => route.fulfill({ status,contentType:'application/json',body:JSON.stringify(body) });
    if(path==='/auth/verify') return json({success:true,user});
    if(path==='/auth/refresh') return json({success:true,token:'audit.synthetic.token',user});
    if(state.failing && path.startsWith('/money/')) return json({success:false,error:'Synthetic outage'},503);
    if(path==='/money/capabilities') return state.capabilitiesFailed ? json({success:false,error:'Unavailable'},503) : json({success:true,data:{why:state.advanced?'listed':'restricted',bank:state.advanced,capture:state.advanced}});
    if(path==='/money/bank/accounts' && state.empty) return json({success:true,data:[]});
    if(path==='/money/statement/accounts') {
      if(route.request().method()==='POST') {
        state.accountCreations++;
        return json({success:true,data:{...account,id:'manual-account',provider:'statement',name:'Everyday'}},201);
      }
      return json({success:true,data:[account,{...account,id:'acc2',name:'Second Account'}]});
    }
    if(path==='/money/statement') {
      state.imports.push(route.request().postData() || '');
      if(state.statementFailed) return json({success:false,error:'The statement service is unavailable. Try again.'},503);
      return json({success:true,data:{read:1,created:1,skipped:0,attached:0}});
    }
    const accountsNow = () => state.empty ? [] : state.cards ? [
      {...account,cards:[{last4:'1234',type:state.cardTypes['acc1:1234'] || 'unknown',source:state.cardTypes['acc1:1234']?'user':null},{last4:'5678',type:'credit',source:'user'}]},
      {...account,id:'acc2',name:'Second Account',cards:[{last4:'1234',type:'debit',source:'user'}]}
    ] : [account];
    if (path==='/money/bank/accounts' && state.cards) return json({success:true,data:accountsNow()});
    /* The page in one read (M2-3): the same parts the single routes serve, under the same states. */
    if(path==='/money/page') return json({success:true,data:{
      reconciliation:{state:state.reconciliationPending?'pending':'clear',unresolvedCount:state.reconciliationPending?1:0,revision:1}, forecast, today: state.changed ? {...today,amount:29.99} : today,
      ledger: state.empty ? [] : state.paginated ? [...Array.from({length:200},(_,i)=>({...ledger[0],id:`tx${i}`})),{...ledger[0],id:'tx201',merchant_raw:'Last page cafe',merchant_name:'Last page cafe'}] : ledger,
      recurring: [], accounts: accountsNow(), months: data['/money/months'], readings: data['/money/readings'], categories: data['/money/categories'], usage: data['/money/usage'],
      capabilities: state.capabilitiesFailed ? null : {why:state.advanced?'listed':'restricted',bank:state.advanced,capture:state.advanced}, inbox: data['/money/inbox'], facts: data['/money/facts'], seen: { tx1: ['bankfeed'] }, failed: state.capabilitiesFailed ? ['capabilities'] : [],
    }});
    if (/^\/money\/bank\/accounts\/[^/]+\/cards\/\d{4}\/type$/.test(path)) {
      const parts=path.split('/'); const body=route.request().postDataJSON();
      state.cardTypes[parts[4]+':'+parts[6]]=body.type;
      return json({success:true,data:{last4:parts[6],type:body.type,source:'user'}});
    }
    if(path==='/money/chat/act') { state.changed=true; return json({success:true,data:{done:true,said:'Updated your ledger.'}}); }
    if(path==='/money/today' && state.changed) return json({success:true,data:{...today,amount:29.99}});
    if(path==='/money/chat/stream' && state.interrupted) return route.fulfill({status:200,contentType:'text/event-stream',body:'data: {"phase":"text","delta":"An unfinished answer"}\n\n'});
    if(path==='/money/chat/stream' && state.offer) return route.fulfill({status:200,contentType:'text/event-stream',body:[
      'data: {"phase":"text","delta":"Confirm the correction below."}',
      'data: {"phase":"actions","actions":[{"kind":"not_me","transaction_id":"tx1","label":"Not my payment"}],"receipts":[],"basis":[]}',
      'data: {"phase":"done"}'
    ].join('\n\n')+'\n\n'});
    if(path==='/money/chat/stream') return route.fulfill({status:200,contentType:'text/event-stream',body:[
      'data: {"phase":"reading"}', 'data: {"phase":"text","delta":"You spent 12.50 EUR at Audit Cafe."}',
      'data: {"phase":"figures","figures":[]}', 'data: {"phase":"actions","actions":[],"receipts":[],"basis":[]}', 'data: {"phase":"done"}',
    ].join('\n\n')+'\n\n'});
    if(path==='/money/stream') return route.fulfill({status:200,contentType:'text/event-stream',body:'data: {"step":"end","state":"done","done":true,"ledger":1}\n\n'});
    if(path==='/money/ledger') {
      if(state.empty) return json({success:true,data:[],next_cursor:null});
      if(state.paginated) return json({success:true,
        data:url.searchParams.has('cursor') ? [{...ledger[0],id:'tx201',merchant_raw:'Last page cafe',merchant_name:'Last page cafe'}]
          : Array.from({length:200},(_,i)=>({...ledger[0],id:`tx${i}`})),
        next_cursor:url.searchParams.has('cursor') ? null : 'synthetic-next',
      });
    }
    if(Object.hasOwn(data,path)) return json({success:true,data:data[path as keyof typeof data]});
    if(path==='/onboarding/new-user-check') return json({isNew:false});
    if(path==='/billing/subscription') return json({success:true,subscription:null,tier:'free',usage:{},limits:{}});
    if(path.startsWith('/money/')) return json({success:false,error:'Unmocked money route'},404);
    return json({success:true,data:[],user});
  });
  return state;
}
